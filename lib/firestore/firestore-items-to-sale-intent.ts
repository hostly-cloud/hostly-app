import type { SaleLineIntent } from "@/lib/server/tpv/tpv-mutation-dtos";

export function firestoreItemsToSaleLineIntents(
  items: readonly Record<string, unknown>[],
): SaleLineIntent[] {
  const out: SaleLineIntent[] = [];
  for (const item of items) {
    const lineId = typeof item.id === "string" ? item.id.trim() : "";
    const productId = typeof item.productId === "string" ? item.productId.trim() : "";
    const quantity = Math.floor(Number(item.quantity ?? item.qty) || 0);
    if (!lineId || !productId || quantity <= 0) continue;
    let selectedModifiers: SaleLineIntent["selectedModifiers"];
    if (Array.isArray(item.selectedModifiers)) {
      selectedModifiers = [];
      for (const row of item.selectedModifiers) {
        if (!row || typeof row !== "object") continue;
        const d = row as Record<string, unknown>;
        const groupId = typeof d.groupId === "string" ? d.groupId.trim() : "";
        const optionId = typeof d.optionId === "string" ? d.optionId.trim() : "";
        if (groupId && optionId) selectedModifiers.push({ groupId, optionId });
      }
      if (selectedModifiers.length === 0) selectedModifiers = undefined;
    }
    const note =
      typeof item.note === "string" && item.note.trim() ? item.note.trim() : undefined;
    out.push({ lineId, productId, quantity, selectedModifiers, note });
  }
  return out;
}
