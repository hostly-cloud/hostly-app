import type { ImportedMenuDraft, ImportedMenuItem, ImportedMenuSection } from "./imported-menu-types";
import { menuTypeToCartaType } from "./menu-import-type-map";
import type {
  MenuImportDraftDocument,
  MenuImportDraftStatus,
  MenuImportDraftSummary,
} from "@/lib/firestore/menu-import-drafts";

export function flattenSectionsToItems(sections: ImportedMenuSection[]): ImportedMenuItem[] {
  return sections.flatMap((s) => s.items);
}

export function menuImportDocToUiDraft(doc: MenuImportDraftDocument): ImportedMenuDraft {
  const sections =
    Array.isArray(doc.sections) && doc.sections.length > 0
      ? doc.sections
      : groupItemsIntoSections(doc.items ?? []);

  const sourceLabel =
    doc.originalFileName?.trim() ||
    (doc.sourceUrl?.trim() && doc.sourceType === "qr_url" ? doc.sourceUrl.trim() : undefined);

  return {
    id: doc.id,
    createdAt: new Date(doc.createdAt).toISOString(),
    sourceType: doc.sourceType,
    cartaType: menuTypeToCartaType(doc.menuType),
    sourceLabel,
    sections,
    status: doc.status,
    errorMessage: doc.errorMessage,
    storagePath: doc.storagePath,
    sourceUrl: doc.sourceUrl,
    aiWarnings: doc.aiWarnings,
  };
}

/** Agrupa items planos legacy cuando `sections` no está en el doc. */
function groupItemsIntoSections(items: ImportedMenuItem[]): ImportedMenuSection[] {
  const byName = new Map<string, ImportedMenuItem[]>();
  const order: string[] = [];
  for (const item of items) {
    const name = item.sectionName?.trim() || "General";
    if (!byName.has(name)) {
      byName.set(name, []);
      order.push(name);
    }
    byName.get(name)!.push(item);
  }
  return order.map((name, i) => ({
    id: `legacy-section-${i}`,
    name,
    items: byName.get(name) ?? [],
  }));
}

export const MENU_IMPORT_STATUS_LABELS: Record<MenuImportDraftStatus, string> = {
  draft: "Borrador",
  analyzing: "Analizando",
  ready: "Listo",
  failed: "Error",
  partially_published: "Parcialmente publicado",
  published: "Publicado",
};

export function menuImportSummaryLabel(summary: MenuImportDraftSummary): string {
  if (summary.originalFileName?.trim()) return summary.originalFileName.trim();
  if (summary.sourceType === "qr_url" && summary.sourceUrl?.trim()) {
    try {
      const u = new URL(summary.sourceUrl.trim());
      return u.hostname + u.pathname.slice(0, 24);
    } catch {
      return summary.sourceUrl.trim().slice(0, 48);
    }
  }
  if (summary.sourceType === "pdf") return "PDF / captura";
  if (summary.sourceType === "image") return "Foto de carta";
  return "Importación de carta";
}
