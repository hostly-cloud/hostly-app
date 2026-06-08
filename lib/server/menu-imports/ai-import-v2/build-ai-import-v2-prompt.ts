import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";

const MAX_OCR_CHARS = 10_000;
const MAX_LAYOUT_CHARS = 4_000;

export function buildAiImportV2Prompt(args: {
  rawText: string;
  menuType: MenuImportMenuType;
  layoutSummary?: string;
  hasImage: boolean;
}): string {
  const ocrSnippet = args.rawText.trim().slice(0, MAX_OCR_CHARS);
  const layoutSnippet = (args.layoutSummary ?? "").trim().slice(0, MAX_LAYOUT_CHARS);

  return [
    "Eres un extractor estructurado de cartas de restaurante para Hostly (modo shadow / evaluación).",
    "Tu tarea es detectar PRODUCTOS DE VENTA con precio, agrupados por sección.",
    "",
    "REGLAS ESTRICTAS (anti-invención):",
    "- Cada items[].name DEBE aparecer literalmente en el OCR o en la imagen.",
    "- Cada items[].price DEBE ser un precio visible en el OCR/imagen.",
    "- sourceEvidence: fragmentos EXACTOS del OCR que prueban nombre y precio (mín. 1 por item).",
    "- NO inventes platos, precios ni secciones.",
    "- NO conviertas traducciones (EN/DE/FR) en productos separados: van en translations[].",
    "- NO conviertas cabeceras de sección (PASTA CASERA, VINOS…) en productos.",
    "- NO incluyas IVA, menú del día, teléfonos, horarios, notas legales.",
    "- Cada producto DEBE tener price numérico (> 0). Sin precio → no es producto.",
    "- description: texto secundario bajo el nombre (puede estar vacío).",
    "- confidence: 0.0–1.0 según claridad del emparejamiento nombre↔precio.",
    "",
    `Tipo de carta indicado por el usuario: ${args.menuType}`,
    args.hasImage
      ? "Entrada multimodal: imagen de la carta + OCR de referencia. Prioriza lo visible en imagen; usa OCR para validar."
      : "Entrada solo texto OCR (sin imagen).",
    "",
    layoutSnippet ? "Resumen layout OCR (líneas con posición aproximada):" : "",
    layoutSnippet || "",
    "",
    "Texto OCR completo (referencia obligatoria):",
    ocrSnippet || "(vacío)",
    "",
    "Devuelve JSON con schema sections[].items[] según el contrato.",
    "Sin texto fuera del JSON.",
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
}

export function summarizeOcrLayout(lines: Array<{ text: string; centerX?: number; centerY?: number }>): string {
  if (!lines.length) return "";
  return lines
    .slice(0, 120)
    .map((line, index) => {
      const pos =
        line.centerX != null && line.centerY != null
          ? ` @(${Math.round(line.centerX)},${Math.round(line.centerY)})`
          : "";
      return `${String(index + 1).padStart(3, " ")}. ${line.text}${pos}`;
    })
    .join("\n");
}
