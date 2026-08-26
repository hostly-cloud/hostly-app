/**
 * Puente transitorio de solo lectura para recuperar mermas guardadas por
 * versiones antiguas de Hostly en localStorage.
 *
 * No contiene ninguna API de escritura y nunca modifica stock. Cuando ya no
 * sea necesario recuperar instalaciones antiguas, este archivo debe borrarse.
 */

export const MERMAS_LOCAL_STORAGE_KEY = "hostly.mermas.registros.v1";

export const MERMA_MOTIVOS = [
  "roto",
  "caducado",
  "error cocina",
  "invitación",
  "otro",
] as const;

export type MermaMotivo = (typeof MERMA_MOTIVOS)[number];
export type LegacyMermaUnit = "kg" | "g" | "l" | "ml" | "uds";

export type MermaLocal = {
  id: string;
  fecha: string;
  producto_stock_id: string;
  producto_stock_nombre: string;
  unidad: LegacyMermaUnit;
  cantidad: number;
  motivo: MermaMotivo;
  notas?: string;
  stock_aplicado: boolean;
};

function isValidMotivo(value: unknown): value is MermaMotivo {
  return (
    typeof value === "string" &&
    (MERMA_MOTIVOS as readonly string[]).includes(value)
  );
}

function parseUnidad(value: unknown): LegacyMermaUnit {
  if (
    value === "kg" ||
    value === "g" ||
    value === "l" ||
    value === "ml" ||
    value === "uds"
  ) {
    return value;
  }
  return "uds";
}

function parseCantidad(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return 0;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

export function formatFechaMerma(isoDate: string): string {
  const value = isoDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return isoDate;
  try {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

/**
 * Lee únicamente registros históricos. Nunca crea seeds, escribe localStorage
 * ni altera inventario. Los IDs ausentes se descartan en vez de inventarlos.
 */
export function loadMermas(): MermaLocal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MERMAS_LOCAL_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const records: MermaLocal[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const value = row as Record<string, unknown>;
      const id = typeof value.id === "string" ? value.id.trim() : "";
      const fecha = typeof value.fecha === "string" ? value.fecha.trim() : "";
      const productId =
        typeof value.producto_stock_id === "string"
          ? value.producto_stock_id.trim()
          : "";
      if (!id || !fecha || !productId) continue;

      const productName =
        typeof value.producto_stock_nombre === "string"
          ? value.producto_stock_nombre.trim()
          : "";
      const notes =
        typeof value.notas === "string" && value.notas.trim()
          ? value.notas.trim()
          : undefined;

      records.push({
        id,
        fecha,
        producto_stock_id: productId,
        producto_stock_nombre: productName || "Producto",
        unidad: parseUnidad(value.unidad),
        cantidad: parseCantidad(value.cantidad),
        motivo: isValidMotivo(value.motivo) ? value.motivo : "otro",
        notas: notes,
        stock_aplicado: value.stock_aplicado === true,
      });
    }

    return records;
  } catch {
    return [];
  }
}
