import { NextResponse } from "next/server";
import { inferTipoVentaFromCartaText, parseTipoVentaLoose, type TipoProductoVenta } from "@/lib/platos-local";
import { MIN_PDF_TEXT_CHARS } from "@/lib/server/menu-imports/menu-import-limits";
import {
  filterItemsByOcrSource,
  logOcrValidationDiagnostics,
  MIN_OCR_SOURCE_TEXT_LENGTH,
} from "@/lib/server/menu-imports/validate-items-against-ocr";
import { extractPdfEmbeddedText, ocrImageBuffer, ocrPdfBuffer } from "@/lib/server/menu-imports/vision-ocr";

type MenuDetectedItem = {
  nombre: string;
  categoria: string;
  descripcion: string;
  precio: number | null;
  confianza?: number;
  tipoVenta: TipoProductoVenta;
};

const NO_PRODUCTS_MESSAGE =
  "No hemos podido detectar productos claros en esta carta. Sube una imagen más nítida o crea productos manualmente.";

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
  return {
    nombre,
    categoria: categoriaNorm,
    descripcion: descripcion || "",
    precio: precioOk,
    confianza: typeof r.confianza === "number" && Number.isFinite(r.confianza) ? r.confianza : undefined,
    tipoVenta,
  };
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

async function callOpenAiVisionExtract(args: { dataUrl: string; ocrReference: string }): Promise<MenuDetectedItem[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const model = process.env.HOSTLY_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const ocrSnippet = args.ocrReference.trim().slice(0, 6000);

  const prompt = [
    "Analiza esta imagen de una carta o menú de restaurante.",
    "",
    "Extrae únicamente productos reales de venta que aparezcan en la carta.",
    "Para cada producto devuelve:",
    "- nombre",
    "- categoria",
    "- descripcion",
    "- precio",
    '- tipoVenta: exactamente "plato" o "bebida" (tipo principal de producto).',
    "",
    "Clasificación tipoVenta:",
    '- plato: comida (entrantes, primeros, segundos, pastas, arroces, carnes, pescados, postres como plato, menús de comida, tapas, etc.).',
    "- bebida: refrescos, vinos, sangrías, cavas, cervezas, cócteles, agua, zumos, cafés y cualquier bebida.",
    "",
    "REGLAS ESTRICTAS:",
    "- NO inventes productos.",
    "- NO uses platos típicos ni ejemplos si no están en la carta.",
    "- NO incluyas textos como: IVA incluido, menú del día, suplemento terraza, notas legales, horarios, teléfonos.",
    "- Si un producto no tiene precio claro, devuelve precio: null",
    '- Si no hay descripción, devuelve descripcion: ""',
    "- Si no puedes identificar productos claros, devuelve items: []",
    "- Devuelve SOLO JSON válido, sin texto extra.",
    "",
    "Texto OCR de referencia (solo productos que puedas relacionar con este texto):",
    ocrSnippet || "(sin texto OCR)",
    "",
    "Formato exacto esperado:",
    '{ "items": [ { "nombre": "Pizza Carbonara", "categoria": "Pizzas", "descripcion": "Mozzarella, bacon, huevo y parmesano", "precio": 12.9, "tipoVenta": "plato" } ] }',
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
    console.error("[ai/import-menu] openai error", res.status, text);
    throw new Error(`OPENAI_${res.status}`);
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[ai/import-menu] openai non-json response", text.slice(0, 4000));
    throw new Error("OPENAI_RESPONSE_INVALID");
  }

  const content = (parsed as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    console.error("[ai/import-menu] missing content", (parsed as { choices?: unknown[] })?.choices?.[0]);
    throw new Error("OPENAI_CONTENT_MISSING");
  }

  const obj = extractJsonObject(content);
  const itemsRaw = (obj as { items?: unknown })?.items;
  if (!Array.isArray(itemsRaw)) {
    console.error("[ai/import-menu] invalid items", content.slice(0, 2000));
    return [];
  }

  const out: MenuDetectedItem[] = [];
  for (const r of itemsRaw) {
    const it = normalizeItem(r);
    if (it) out.push(it);
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    if (!form) return jsonError(400, "INVALID_MULTIPART");

    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "MISSING_FILE");

    const type = file.type || "";
    const allowed =
      type === "image/jpeg" ||
      type === "image/png" ||
      type === "image/webp" ||
      type === "image/gif" ||
      type === "application/pdf";
    if (!allowed) return jsonError(415, "UNSUPPORTED_TYPE", `type=${type || "unknown"}`);

    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) return jsonError(413, "FILE_TOO_LARGE", `max=${maxBytes}`);

    const buf = Buffer.from(await file.arrayBuffer());
    let ocrText = "";
    try {
      ocrText = await extractOcrTextFromBuffer(buf, type);
    } catch (ocrErr) {
      const message = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
      console.error("[ai/import-menu] ocr failed", message);
      return jsonNoProducts(0, NO_PRODUCTS_MESSAGE);
    }

    const ocrTextLength = ocrText.trim().length;
    if (ocrTextLength < MIN_OCR_SOURCE_TEXT_LENGTH) {
      logOcrValidationDiagnostics(
        {
          ocrTextLength,
          aiReturnedCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          acceptedNames: [],
          rejectedNames: [],
        },
        "ocr-insufficient",
      );
      return jsonNoProducts(ocrTextLength, NO_PRODUCTS_MESSAGE);
    }

    const base64 = buf.toString("base64");
    const dataUrl = `data:${type || "application/octet-stream"};base64,${base64}`;

    const aiItems = await callOpenAiVisionExtract({ dataUrl, ocrReference: ocrText });

    const wrapped = aiItems.map((item) => ({ name: item.nombre, item }));
    const validation = filterItemsByOcrSource(wrapped, ocrText);
    const accepted = validation.accepted.map((row) => row.item);

    logOcrValidationDiagnostics(
      {
        ocrTextLength: validation.ocrTextLength,
        aiReturnedCount: aiItems.length,
        acceptedCount: accepted.length,
        rejectedCount: validation.rejected.length,
        acceptedNames: accepted.map((i) => i.nombre),
        rejectedNames: validation.rejected.map((i) => i.name),
      },
      "post-filter",
    );

    if (accepted.length === 0) {
      return jsonNoProducts(ocrTextLength, NO_PRODUCTS_MESSAGE);
    }

    return NextResponse.json({ ok: true, items: accepted, ocrTextLength });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ai/import-menu] error", { message, stack: err instanceof Error ? err.stack : undefined });
    if (message === "OPENAI_API_KEY_MISSING") {
      return jsonError(500, "AI_KEY_MISSING", "Falta configurar la API key de IA (OPENAI_API_KEY).");
    }
    return jsonError(500, "AI_IMPORT_FAILED", message);
  }
}
