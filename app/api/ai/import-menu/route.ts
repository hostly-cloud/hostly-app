import { NextResponse } from "next/server";
import { inferTipoVentaFromCartaText, parseTipoVentaLoose, type TipoProductoVenta } from "@/lib/platos-local";

type MenuDetectedItem = {
  nombre: string;
  categoria: string;
  descripcion: string;
  precio: number | null;
  confianza?: number;
  tipoVenta: TipoProductoVenta;
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

function extractJsonObject(text: string): any | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  // Try direct parse first.
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fallback: extract first {...} block.
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

function normalizeItem(raw: any): MenuDetectedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const nombre = typeof raw.nombre === "string" ? raw.nombre.trim() : "";
  const categoria = typeof raw.categoria === "string" ? raw.categoria.trim() : "";
  const descripcion = typeof raw.descripcion === "string" ? raw.descripcion.trim() : "";
  const precio =
    raw.precio == null
      ? null
      : typeof raw.precio === "number" && Number.isFinite(raw.precio)
        ? raw.precio
        : typeof raw.precio === "string"
          ? Number(raw.precio.replace(",", "."))
          : NaN;
  const precioOk = precio == null ? null : Number.isFinite(precio) ? Math.round(precio * 100) / 100 : null;
  if (!nombre) return null;
  const categoriaNorm = categoria || "General";
  const tipoVenta: TipoProductoVenta =
    parseTipoVentaLoose(raw.tipoVenta) ?? inferTipoVentaFromCartaText(categoriaNorm, nombre);
  return {
    nombre,
    categoria: categoriaNorm,
    descripcion: descripcion || "",
    precio: precioOk,
    confianza: typeof raw.confianza === "number" && Number.isFinite(raw.confianza) ? raw.confianza : undefined,
    tipoVenta,
  };
}

async function callOpenAiVisionExtract(args: { dataUrl: string }): Promise<MenuDetectedItem[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const model = process.env.HOSTLY_OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const prompt = [
    "Analiza esta imagen de una carta o menú de restaurante.",
    "",
    "Extrae únicamente productos reales de venta.",
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
    "REGLAS:",
    "- NO inventes productos.",
    "- NO incluyas textos como: IVA incluido, menú del día, suplemento terraza, notas legales, horarios, teléfonos.",
    "- Si un producto no tiene precio claro, devuelve precio: null",
    '- Si no hay descripción, devuelve descripcion: ""',
    "- Intenta agrupar cada producto en una categoría razonable o la categoría visible más cercana.",
    "- Devuelve SOLO JSON válido, sin texto extra.",
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
      temperature: 0.2,
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

  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[ai/import-menu] openai non-json response", text.slice(0, 4000));
    throw new Error("OPENAI_RESPONSE_INVALID");
  }

  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    console.error("[ai/import-menu] missing content", parsed?.choices?.[0]);
    throw new Error("OPENAI_CONTENT_MISSING");
  }

  const obj = extractJsonObject(content);
  const itemsRaw = obj?.items;
  if (!Array.isArray(itemsRaw)) {
    console.error("[ai/import-menu] invalid items", content.slice(0, 2000));
    throw new Error("AI_JSON_INVALID");
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
    console.log("[API] HIT /api/ai/import-menu");
    const form = await req.formData().catch(() => null);
    if (!form) return jsonError(400, "INVALID_MULTIPART");

    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "MISSING_FILE");
    console.log("[API] file received:", file?.name || null);
    console.log("[API] content type:", file?.type || null);
    console.info("[api/ai/import-menu] received", { name: file.name, type: file.type, size: file.size });

    const type = file.type || "";
    const allowed = type === "image/jpeg" || type === "image/png" || type === "application/pdf";
    if (!allowed) return jsonError(415, "UNSUPPORTED_TYPE", `type=${type || "unknown"}`);

    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) return jsonError(413, "FILE_TOO_LARGE", `max=${maxBytes}`);

    if (type === "application/pdf") {
      return jsonError(400, "PDF_NOT_SUPPORTED_YET", "El soporte PDF aún está en preparación. Usa una imagen por ahora.");
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString("base64");
    const dataUrl = `data:${type};base64,${base64}`;

    const items = await callOpenAiVisionExtract({ dataUrl });
    console.log("[API] returning items:", items?.length || 0);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ai/import-menu] error", { message, stack: err instanceof Error ? err.stack : undefined });
    if (message === "OPENAI_API_KEY_MISSING") {
      return jsonError(500, "AI_KEY_MISSING", "Falta configurar la API key de IA (OPENAI_API_KEY).");
    }
    return jsonError(500, "AI_IMPORT_FAILED", message);
  }
}

