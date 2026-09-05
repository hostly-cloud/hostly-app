import type { PosMigrationTargetField } from "@/lib/pos-migration/types";

export type PosMigrationVendor =
  | "revo"
  | "glop"
  | "lastapp"
  | "frontrest"
  | "agora"
  | "square"
  | "lightspeed"
  | "generic";

export type PosVendorAdapter = {
  id: PosMigrationVendor;
  label: string;
  headerHints: string[];
  aliases: Partial<Record<PosMigrationTargetField, string[]>>;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ");
}

export const POS_VENDOR_ADAPTERS: PosVendorAdapter[] = [
  {
    id: "revo",
    label: "Revo",
    headerHints: ["revo", "category name", "tax name", "cost price"],
    aliases: {
      name: ["item name", "product name", "nombre producto"],
      category: ["category name", "group name", "familia"],
      price: ["selling price", "sale price", "price 1"],
      taxRate: ["tax percent", "tax percentage", "tax name"],
      cost: ["cost price", "purchase price"],
      barcode: ["barcode value", "ean13"],
      sku: ["reference", "product reference"],
    },
  },
  {
    id: "glop",
    label: "Glop",
    headerHints: ["glop", "articulo", "familia", "tarifa"],
    aliases: {
      name: ["articulo", "descripcion articulo", "nombre articulo"],
      category: ["familia", "subfamilia"],
      price: ["tarifa", "precio tarifa", "pvp tarifa"],
      taxRate: ["tipo iva", "porcentaje iva"],
      cost: ["precio coste", "ultimo coste"],
      stock: ["existencia", "existencia actual"],
      sku: ["codigo articulo", "cod articulo"],
    },
  },
  {
    id: "lastapp",
    label: "Last.app",
    headerHints: ["last app", "lastapp", "catalog item", "tax category"],
    aliases: {
      name: ["catalog item", "item title", "product title"],
      category: ["catalog category", "category title"],
      price: ["unit price", "base price"],
      taxRate: ["tax category", "vat percent"],
      station: ["production center", "prep station"],
      sku: ["external id", "product id"],
    },
  },
  {
    id: "frontrest",
    label: "FrontRest",
    headerHints: ["frontrest", "familia articulo", "pvp articulo"],
    aliases: {
      name: ["descripcion articulo", "articulo descripcion"],
      category: ["familia articulo", "familia principal"],
      price: ["pvp articulo", "precio venta articulo"],
      taxRate: ["iva articulo", "porc iva"],
      cost: ["coste medio", "coste articulo"],
      stock: ["stock actual", "existencia articulo"],
      sku: ["codigo articulo", "referencia articulo"],
    },
  },
  {
    id: "agora",
    label: "Ágora",
    headerHints: ["agora", "articulo", "familia", "impuesto"],
    aliases: {
      name: ["nombre articulo", "descripcion articulo"],
      category: ["familia", "grupo articulo"],
      price: ["precio venta", "pvp con impuestos"],
      taxRate: ["impuesto", "porcentaje impuesto"],
      cost: ["precio costo", "coste"],
      sku: ["codigo", "referencia"],
    },
  },
  {
    id: "square",
    label: "Square",
    headerHints: ["square", "item name", "variation name", "current quantity"],
    aliases: {
      name: ["item name"],
      category: ["category", "reporting category"],
      price: ["price", "variation price"],
      taxRate: ["tax percentage", "taxes"],
      stock: ["current quantity", "quantity"],
      sku: ["sku"],
      barcode: ["gtin"],
    },
  },
  {
    id: "lightspeed",
    label: "Lightspeed",
    headerHints: ["lightspeed", "product", "default cost", "inventory level"],
    aliases: {
      name: ["product", "product name", "item"],
      category: ["category", "product category"],
      price: ["retail price", "price"],
      taxRate: ["tax rate", "vat rate"],
      cost: ["default cost", "average cost"],
      stock: ["inventory level", "quantity on hand"],
      sku: ["sku", "custom sku"],
      barcode: ["upc", "ean", "barcode"],
    },
  },
];

export function detectPosVendor(headers: string[], fileName = ""): {
  vendor: PosMigrationVendor;
  label: string;
  confidence: number;
  adapter: PosVendorAdapter | null;
} {
  const normalizedHeaders = headers.map(normalize);
  const normalizedFileName = normalize(fileName);
  let best: { adapter: PosVendorAdapter; score: number } | null = null;

  for (const adapter of POS_VENDOR_ADAPTERS) {
    let score = 0;
    for (const hint of adapter.headerHints.map(normalize)) {
      if (normalizedFileName.includes(hint)) score += 3;
      if (normalizedHeaders.some((header) => header === hint)) score += 2;
      else if (normalizedHeaders.some((header) => header.includes(hint))) score += 1;
    }
    for (const aliases of Object.values(adapter.aliases)) {
      for (const alias of (aliases ?? []).map(normalize)) {
        if (normalizedHeaders.includes(alias)) score += 0.75;
      }
    }
    if (!best || score > best.score) best = { adapter, score };
  }

  if (!best || best.score < 2.5) {
    return { vendor: "generic", label: "Formato genérico", confidence: 0, adapter: null };
  }
  const confidence = Math.min(0.98, Math.max(0.55, best.score / 10));
  return {
    vendor: best.adapter.id,
    label: best.adapter.label,
    confidence,
    adapter: best.adapter,
  };
}

export function mergeVendorAliases(
  base: Record<PosMigrationTargetField, string[]>,
  adapter: PosVendorAdapter | null,
): Record<PosMigrationTargetField, string[]> {
  if (!adapter) return base;
  const out = {} as Record<PosMigrationTargetField, string[]>;
  for (const field of Object.keys(base) as PosMigrationTargetField[]) {
    out[field] = [...new Set([...(base[field] ?? []), ...(adapter.aliases[field] ?? [])])];
  }
  return out;
}
