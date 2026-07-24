import { NextResponse } from "next/server";
import { inferTipoVentaFromCartaText, parseTipoVentaLoose, type TipoProductoVenta } from "@/lib/platos-local";
import {
  MAX_MENU_IMPORT_OCR_BYTES,
  MIN_PDF_TEXT_CHARS,
} from "@/lib/server/menu-imports/menu-import-limits";
import {
  filterItemsByOcrSource,
  isProductNameSupportedByOcr,
  MIN_OCR_SOURCE_TEXT_LENGTH,
} from "@/lib/server/menu-imports/validate-items-against-ocr";
import { extractPdfEmbeddedText, ocrImageBuffer, ocrPdfBuffer } from "@/lib/server/menu-imports/vision-ocr";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
  type AuthenticatedRestaurantContext,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";

type MenuDetectedItem = {
  nombre: string;
  categoria: string;
  descripcion: string;
  precio: number | null;
  confianza?: number;
  tipoVenta: TipoProductoVenta;
  needsReview?: boolean;
  rawText?: string;
  sourceLine?: string;
};

type AiImportTrace = Pick<
  AuthenticatedRestaurantContext,
  "uid" | "restaurantId"
>;

type MenuProcessingResult = {
  items: MenuDetectedItem[];
  ocrTextLength: number;
};

export type ImportMenuRouteDependencies = AuthenticatedRestaurantDependencies & {
  processFile?: (input: {
    buffer: Buffer;
    contentType: string;
    trace: AiImportTrace;
  }) => Promise<MenuProcessingResult>;
};

const NO_PRODUCTS_MESSAGE =
  "No hemos podido detectar productos claros en esta carta. Sube una imagen más nítida o crea productos manualmente.";
function logImportEvent(
  event: string,
  trace: AiImportTrace,
  details?: Record<string, string | number | boolean>,
) {
  console.info("[ai/import-menu]", {
    event,
    uid: trace.uid,
    restaurantId: trace.restaurantId,
    ...details,
  });
}

function classifyProcessingError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "OPENAI_API_KEY_MISSING") return "OPENAI_API_KEY_MISSING";
  if (/^OPENAI_\d{3}$/.test(message)) return message;
  if (
    message === "OPENAI_RESPONSE_INVALID" ||
    message === "OPENAI_CONTENT_MISSING"
  ) {
    return message;
  }
  return "AI_IMPORT_FAILED";
}

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

function jsonNoProducts(ocrTextLength: number, details?: string) {
  return NextResponse.json({
    ok: true,
    items: [],
    noProducts: true,
    code: "NO_PRODUCTS_DETECTED",
    ocrTextLength,
    details: details ?? NO_PRODUCTS_MESSAGE,
  });
}

function fileSignatureMatches(buffer: Buffer, contentType: string): boolean {
  if (contentType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    );
  }
  if (contentType === "image/gif") {
    const signature = buffer.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }
  if (contentType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if (contentType === "application/pdf") {
    return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  return false;
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeItem(raw: unknown): MenuDetectedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const nombre = typeof r.nombre === "string" ? r.nombre.trim() : "";
  const categoria = typeof r.categoria === "string" ? r.categoria.trim() : "";
  const descripcion = typeof r.descripcion === "string" ? r.descripcion.trim() : "";
  const precio =
    r.precio == null
      ? null
      : typeof r.precio === "number" && Number.isFinite(r.precio)
        ? r.precio
        : typeof r.precio === "string"
          ? Number(r.precio.replace(",", "."))
          : NaN;
  const precioOk = precio == null ? null : Number.isFinite(precio) ? Math.round(precio * 100) / 100 : null;
  if (!nombre) return null;
  const categoriaNorm = categoria || "General";
  const tipoVenta: TipoProductoVenta =
    parseTipoVentaLoose(r.tipoVenta) ?? inferTipoVentaFromCartaText(categoriaNorm, nombre);
  const confianzaRaw = r.confianza;
  let confianza: number | undefined;
  if (typeof confianzaRaw === "number" && Number.isFinite(confianzaRaw)) {
    confianza = confianzaRaw > 1 ? confianzaRaw / 100 : confianzaRaw;
    confianza = Math.max(0, Math.min(1, confianza));
  }
  const rawText = typeof r.rawText === "string" ? r.rawText.trim() : "";
  const sourceLine = typeof r.sourceLine === "string" ? r.sourceLine.trim() : "";
  const needsReview = r.needsReview === true;
  return {
    nombre,
    categoria: categoriaNorm,
    descripcion: descripcion || "",
    precio: precioOk,
    confianza,
    tipoVenta,
    ...(rawText ? { rawText } : {}),
    ...(sourceLine ? { sourceLine } : {}),
    ...(needsReview ? { needsReview: true } : {}),
  };
}

function applyOcrFidelityFlags(items: MenuDetectedItem[], ocrSourceText: string): MenuDetectedItem[] {
  return items.map((item) => {
    const supported = isProductNameSupportedByOcr(item.nombre, ocrSourceText);
    const lowConfidence = item.confianza != null && item.confianza < 0.65;
    const needsReview = item.needsReview === true || !supported || lowConfidence || item.precio == null;
    const confianza =
      item.confianza ??
      (supported ? (item.precio != null ? 0.72 : 0.55) : 0.35);
    return {
      ...item,
      confianza,
      ...(needsReview ? { needsReview: true } : {}),
    };
  });
}

async function extractOcrTextFromBuffer(buffer: Buffer, type: string): Promise<string> {
  if (type === "application/pdf") {
    const embedded = await extractPdfEmbeddedText(buffer);
    if (embedded.length >= MIN_PDF_TEXT_CHARS) return embedded;
    const ocr = await ocrPdfBuffer(buffer);
    return ocr.text;
  }
  return ocrImageBuffer(buffer);
}

async function callOpenAiVisionExtract(args: {
  dataUrl: string;
  ocrReference: string;
  trace: AiImportTrace;
}): Promise<MenuDetectedItem[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const model = process.env.HOSTLY_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const ocrSnippet = args.ocrReference.trim().slice(0, 6000);

  const prompt = [
    "Transcribe y estructura esta carta de restaurante en DOS FASES dentro de un único JSON.",
    "",
    "FASE 1 — TRANSCRIPCIÓN FIEL (OCR)",
    "- Copia el texto visible de la carta línea a línea, sin interpretar.",
    "- No traduzcas, no corrijas nombres comerciales, no embellezcas.",
    "- No inventes líneas que no se vean.",
    "- Mantén nombres italianos/españoles tal cual (Spaghetti, Tagliatelle, Ravioli…).",
    "- Si una línea es ilegible, inclúyela con [ilegible] en transcription.lines.",
    "",
    "FASE 2 — ESTRUCTURACIÓN",
    "- Convierte SOLO líneas de la transcripción en productos de venta.",
    "- Cada items[].nombre DEBE existir literalmente en transcription.lines o en el OCR de referencia.",
    "- NO inventes productos. NO uses platos típicos si no están en la carta.",
    "- NO reformules nombres: copia el nombre comercial tal como aparece.",
    "- NO conviertas descripciones/ingredientes en nombre de producto.",
    "- Separa nombre (título del plato) y descripcion (texto secundario bajo el nombre).",
    "- categoria: sección visible (ej. Pastas, Pizzas). Si no hay sección clara, la más cercana del OCR.",
    "- precio: número o null si no es legible.",
    '- tipoVenta: "plato" o "bebida".',
    "- confianza: 0.0–1.0 (baja si dudas).",
    "- needsReview: true si nombre o precio dudosos/ilegibles.",
    "- sourceLine: línea exacta de transcription.lines usada.",
    "- rawText: fragmento OCR/imagen usado para ese producto.",
    "",
    "PROHIBIDO:",
    "- IVA, menú del día, suplementos, notas legales, horarios, teléfonos.",
    "- Repetir el mismo producto.",
    "- Mezclar dos productos en uno.",
    "",
    "Texto OCR de referencia:",
    ocrSnippet || "(sin texto OCR)",
    "",
    "Formato JSON exacto:",
    '{ "transcription": { "lines": ["PASTAS", "Spaghetti carbonara 14,50", "Tagliatelle al ragú 15,00"] }, "items": [ { "nombre": "Spaghetti carbonara", "categoria": "Pastas", "descripcion": "", "precio": 14.5, "tipoVenta": "plato", "confianza": 0.92, "needsReview": false, "sourceLine": "Spaghetti carbonara 14,50", "rawText": "Spaghetti carbonara 14,50" } ] }',
    "",
    "Devuelve SOLO JSON válido, sin texto extra.",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: args.dataUrl } },
          ],
        },
      ],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    logImportEvent("openai_failed", args.trace, { status: res.status });
    throw new Error(`OPENAI_${res.status}`);
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    logImportEvent("openai_invalid_json", args.trace);
    throw new Error("OPENAI_RESPONSE_INVALID");
  }

  const content = (parsed as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    logImportEvent("openai_missing_content", args.trace);
    throw new Error("OPENAI_CONTENT_MISSING");
  }

  const obj = extractJsonObject(content) as {
    items?: unknown;
    transcription?: { lines?: unknown };
  } | null;
  const itemsRaw = obj?.items;
  if (!Array.isArray(itemsRaw)) {
    logImportEvent("openai_invalid_items", args.trace);
    return [];
  }

  const out: MenuDetectedItem[] = [];
  for (const r of itemsRaw) {
    const it = normalizeItem(r);
    if (it) out.push(it);
  }
  return applyOcrFidelityFlags(out, args.ocrReference);
}

async function processMenuFile(input: {
  buffer: Buffer;
  contentType: string;
  trace: AiImportTrace;
}): Promise<MenuProcessingResult> {
  const { buffer, contentType, trace } = input;
  let ocrText = "";
  try {
    ocrText = await extractOcrTextFromBuffer(buffer, contentType);
  } catch {
    logImportEvent("ocr_failed", trace);
    return { items: [], ocrTextLength: 0 };
  }

  const ocrTextLength = ocrText.trim().length;
  if (ocrTextLength < MIN_OCR_SOURCE_TEXT_LENGTH) {
    logImportEvent("ocr_insufficient", trace, { ocrTextLength });
    return { items: [], ocrTextLength };
  }

  const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
  const aiItems = await callOpenAiVisionExtract({
    dataUrl,
    ocrReference: ocrText,
    trace,
  });
  const wrapped = aiItems.map((item) => ({ name: item.nombre, item }));
  const validation = filterItemsByOcrSource(wrapped, ocrText);
  const accepted = validation.accepted.map((row) => row.item);
  logImportEvent("validation_completed", trace, {
    ocrTextLength: validation.ocrTextLength,
    aiReturnedCount: aiItems.length,
    acceptedCount: accepted.length,
    rejectedCount: validation.rejected.length,
  });
  return { items: accepted, ocrTextLength };
}

export async function handleImportMenuRequest(
  req: Request,
  dependencies?: ImportMenuRouteDependencies,
) {
  const authContext = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authContext)) {
    if (authContext.status === 409) {
      return jsonError(403, "PROFILE_AUTHORIZATION_FAILED");
    }
    return authContext;
  }
  if (!serverRoleHasCapability(authContext.role, "settings.manage")) {
    return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
  }

  const trace: AiImportTrace = {
    uid: authContext.uid,
    restaurantId: authContext.restaurantId,
  };
  const startedAt = Date.now();
  try {
    const form = await req.formData().catch(() => null);
    if (!form) return jsonError(400, "INVALID_MULTIPART");
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "MISSING_FILE");

    const contentType = file.type || "";
    const allowed =
      contentType === "image/jpeg" ||
      contentType === "image/png" ||
      contentType === "image/webp" ||
      contentType === "image/gif" ||
      contentType === "application/pdf";
    if (!allowed) return jsonError(415, "UNSUPPORTED_TYPE");
    if (file.size <= 0) return jsonError(400, "EMPTY_FILE");
    if (file.size > MAX_MENU_IMPORT_OCR_BYTES) {
      return jsonError(413, "FILE_TOO_LARGE");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!fileSignatureMatches(buffer, contentType)) {
      return jsonError(415, "FILE_SIGNATURE_MISMATCH");
    }

    logImportEvent("processing_started", trace, {
      contentType,
      size: file.size,
    });
    const result = await (dependencies?.processFile ?? processMenuFile)({
      buffer,
      contentType,
      trace,
    });
    if (result.items.length === 0) {
      logImportEvent("processing_completed", trace, {
        code: "NO_PRODUCTS_DETECTED",
        durationMs: Date.now() - startedAt,
        itemCount: 0,
        ocrTextLength: result.ocrTextLength,
      });
      return jsonNoProducts(result.ocrTextLength, NO_PRODUCTS_MESSAGE);
    }
    logImportEvent("processing_completed", trace, {
      code: "OK",
      durationMs: Date.now() - startedAt,
      itemCount: result.items.length,
      ocrTextLength: result.ocrTextLength,
    });
    return NextResponse.json({
      ok: true,
      items: result.items,
      ocrTextLength: result.ocrTextLength,
    });
  } catch (err) {
    const code = classifyProcessingError(err);
    logImportEvent("processing_failed", trace, {
      code,
      durationMs: Date.now() - startedAt,
    });
    if (code === "OPENAI_API_KEY_MISSING") {
      return jsonError(503, "AI_UNAVAILABLE");
    }
    return jsonError(500, "AI_IMPORT_FAILED");
  }
}

export async function POST(req: Request) {
  return handleImportMenuRequest(req);
}
