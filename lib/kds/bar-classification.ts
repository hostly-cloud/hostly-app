const BAR_KEYWORDS_RAW = [
  "bebida",
  "bebidas",
  "vino",
  "vinos",
  "cerveza",
  "cervezas",
  "refresco",
  "refrescos",
  "coctel",
  "cocteles",
  "cocktail",
  "cocktails",
  "cafe",
  "cafes",
  "copa",
  "copas",
  "barra",
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const BAR_KEYWORDS = BAR_KEYWORDS_RAW.map(normalize);

export type BarClassifiable = {
  categoria?: unknown;
  category?: unknown;
  categoryName?: unknown;
};

export function isBarItem(item: BarClassifiable | null | undefined): boolean {
  if (!item) return false;
  const raw: string[] = [];
  for (const key of ["categoria", "category", "categoryName"] as const) {
    const v = item[key];
    if (typeof v === "string" && v.trim()) raw.push(v);
  }
  if (raw.length === 0) return false;
  const normalized = raw.map(normalize);
  return normalized.some((v) => BAR_KEYWORDS.some((k) => v.includes(k)));
}
