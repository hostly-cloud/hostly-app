import { DEFAULT_SUPPLIERS } from "./default-suppliers";
import type { CanonicalSupplier } from "./types";

/** Texto normalizado para comparación (minúsculas, sin acentos, espacios colapsados). */
export function normalizeSupplierText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

/** Clave densa: alfanumérica para tolerar puntos, guiones y espacios. */
export function normalizeSupplierKey(s: string): string {
  return normalizeSupplierText(s).replace(/[^a-z0-9]/g, "");
}

function variantsForString(s: string): string[] {
  const n = normalizeSupplierText(s);
  const key = normalizeSupplierKey(s);
  const compact = n.replace(/[\s.]/g, "");
  const out = new Set<string>();
  if (n) out.add(n);
  if (key) out.add(key);
  if (compact) out.add(compact);
  return [...out];
}

function collectKeys(sup: CanonicalSupplier): Set<string> {
  const set = new Set<string>();
  for (const v of variantsForString(sup.id.replace(/-/g, " "))) set.add(v);
  for (const v of variantsForString(sup.displayName)) set.add(v);
  for (const v of variantsForString(sup.legalName)) set.add(v);
  for (const a of sup.aliases) {
    for (const v of variantsForString(a)) set.add(v);
  }
  return set;
}

function scoreKeys(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 4 && longer.includes(shorter)) return 90;
  if (shorter.length >= 3 && longer.includes(shorter)) return 82;
  return 0;
}

/**
 * Mejor coincidencia sobre catálogo. Devuelve null si no supera umbral (flujo libre).
 */
export function findSupplierMatch(
  input: string,
  list: readonly CanonicalSupplier[] = DEFAULT_SUPPLIERS,
): CanonicalSupplier | null {
  const raw = input.trim();
  if (!raw) return null;
  const inputKeys = new Set<string>();
  for (const v of variantsForString(raw)) inputKeys.add(v);

  let best: { sup: CanonicalSupplier; score: number } | null = null;
  for (const sup of list) {
    const hay = collectKeys(sup);
    let score = 0;
    for (const ik of inputKeys) {
      for (const hk of hay) {
        const sc = scoreKeys(ik, hk);
        if (sc > score) score = sc;
      }
    }
    if (!best || score > best.score) best = { sup, score };
  }
  if (best && best.score >= 80) return best.sup;
  return null;
}

/** Sugerencias compactas para UI (Linear/Stripe style). */
export function suggestSuppliers(
  query: string,
  limit = 5,
  list: readonly CanonicalSupplier[] = DEFAULT_SUPPLIERS,
): CanonicalSupplier[] {
  const raw = query.trim();
  if (!raw) return [...list].slice(0, limit);
  const qk = normalizeSupplierKey(raw);
  const scored = list.map((sup) => {
    let sc = 0;
    const chk = collectKeys(sup);
    for (const hk of chk) {
      const s = scoreKeys(qk, hk);
      if (s > sc) sc = s;
      const s2 = scoreKeys(normalizeSupplierText(raw), hk.length > 40 ? hk : normalizeSupplierText(hk));
      if (s2 > sc) sc = s2;
    }
    return { sup, sc };
  });
  return scored
    .filter((x) => x.sc >= 50)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map((x) => x.sup);
}

export type ResolvedSupplierFields = {
  /** Siempre relleno para listados legacy. */
  proveedor: string;
  supplierInput: string;
  supplierId?: string;
  supplierDisplayName?: string;
  supplierLegalName?: string;
};

/**
 * Persistencia: no bloquea si no hay match; guarda texto libre en supplierInput y proveedor.
 */
export function resolveSupplierForSave(
  rawInput: string,
  list: readonly CanonicalSupplier[] = DEFAULT_SUPPLIERS,
): ResolvedSupplierFields {
  const supplierInput = rawInput.trim();
  if (!supplierInput) {
    return { proveedor: "", supplierInput: "" };
  }
  const m = findSupplierMatch(supplierInput, list);
  if (!m) {
    return {
      proveedor: supplierInput,
      supplierInput,
    };
  }
  return {
    proveedor: m.displayName,
    supplierInput,
    supplierId: m.id,
    supplierDisplayName: m.displayName,
    supplierLegalName: m.legalName,
  };
}

/** Listado primario (tarjetas / drawer). */
export function supplierPrimaryLabel(args: {
  proveedor: string;
  supplierDisplayName?: string;
}): string {
  const d = (args.supplierDisplayName ?? "").trim();
  if (d) return d;
  return (args.proveedor ?? "").trim() || "—";
}

/** Subtítulo legal solo si difiere del primario. */
export function supplierLegalSubtitle(args: {
  proveedor: string;
  supplierDisplayName?: string;
  supplierLegalName?: string;
}): string | null {
  const legal = (args.supplierLegalName ?? "").trim();
  if (!legal) return null;
  const primary = supplierPrimaryLabel(args);
  if (legal.toLowerCase() === primary.toLowerCase()) return null;
  return legal;
}
