import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function priceKey(price: number | undefined): string {
  return typeof price === "number" && Number.isFinite(price)
    ? (Math.round(price * 100) / 100).toFixed(2)
    : "";
}

function itemKey(item: ImportedMenuItem): string {
  return `${normalize(item.name)}::${priceKey(item.price)}`;
}

function preferCandidate(current: ImportedMenuItem, candidate: ImportedMenuItem): ImportedMenuItem {
  if ((candidate.description?.trim().length ?? 0) > (current.description?.trim().length ?? 0)) {
    return candidate;
  }
  if ((candidate.confidence ?? 0) > (current.confidence ?? 0)) {
    return candidate;
  }
  return current;
}

export function mergeMenuImportPageItems(
  pages: Array<{ pageIndex: number; items: ImportedMenuItem[] }>,
): { items: ImportedMenuItem[]; duplicateCount: number } {
  const byKey = new Map<string, ImportedMenuItem>();
  let duplicateCount = 0;

  for (const page of pages) {
    for (const item of page.items) {
      const key = itemKey(item);
      if (!key.startsWith("::") && byKey.has(key)) {
        duplicateCount += 1;
        const current = byKey.get(key)!;
        const preferred = preferCandidate(current, item);
        if (preferred !== current) {
          byKey.set(key, {
            ...preferred,
            id: current.id,
          });
        }
        continue;
      }

      byKey.set(key, {
        ...item,
        id: `page-${page.pageIndex + 1}-${item.id}`,
      });
    }
  }

  return { items: [...byKey.values()], duplicateCount };
}
