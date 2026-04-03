/**
 * Persistencia local del módulo Mermas. Independiente de Compras.
 */

import type { UnidadStock } from "@/lib/stock-local";

export const MERMAS_LOCAL_STORAGE_KEY = "hostly.mermas.registros.v1";

export const MERMA_MOTIVOS = [
  "roto",
  "caducado",
  "error cocina",
  "invitación",
  "otro",
] as const;

export type MermaMotivo = (typeof MERMA_MOTIVOS)[number];

export type MermaLocal = {
  id: string;
  fecha: string;
  producto_stock_id: string;
  producto_stock_nombre: string;
  unidad: UnidadStock;
  cantidad: number;
  motivo: MermaMotivo;
  notas?: string;
  stock_aplicado: boolean;
};

const SEED: MermaLocal[] = [];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mrm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isValidMotivo(v: unknown): v is MermaMotivo {
  return typeof v === "string" && (MERMA_MOTIVOS as readonly string[]).includes(v);
}

function parseUnidad(v: unknown): UnidadStock {
  if (v === "kg" || v === "g" || v === "l" || v === "ml" || v === "uds") return v;
  return "uds";
}

function parseCantidad(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return 0;
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

export function formatFechaMerma(isoDate: string): string {
  const t = isoDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return isoDate;
  try {
    const [y, m, d] = t.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

export function newMermaId(): string {
  return newId();
}

export function loadMermas(): MermaLocal[] {
  if (typeof window === "undefined") return [...SEED];
  try {
    const raw = localStorage.getItem(MERMAS_LOCAL_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(MERMAS_LOCAL_STORAGE_KEY, JSON.stringify(SEED));
      return [...SEED];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...SEED];
    const out: MermaLocal[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : newId();
      const fecha = typeof r.fecha === "string" ? r.fecha : "";
      const producto_stock_id = typeof r.producto_stock_id === "string" ? r.producto_stock_id : "";
      const producto_stock_nombre =
        typeof r.producto_stock_nombre === "string" ? r.producto_stock_nombre : "";
      const unidad = parseUnidad(r.unidad);
      const cantidad = parseCantidad(r.cantidad);
      const motivo: MermaMotivo = isValidMotivo(r.motivo) ? r.motivo : "otro";
      const notasRaw = r.notas;
      const notas =
        typeof notasRaw === "string" && notasRaw.trim() ? notasRaw.trim() : undefined;
      const stock_aplicado = r.stock_aplicado === true;
      if (!fecha.trim() || !producto_stock_id.trim()) continue;
      out.push({
        id,
        fecha: fecha.trim(),
        producto_stock_id: producto_stock_id.trim(),
        producto_stock_nombre: producto_stock_nombre.trim() || "Producto",
        unidad,
        cantidad,
        motivo,
        notas,
        stock_aplicado,
      });
    }
    return out;
  } catch {
    return [...SEED];
  }
}

export function saveMermas(items: MermaLocal[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MERMAS_LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // noop
  }
}
