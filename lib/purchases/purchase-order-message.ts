import type { PurchaseOrderDocument, PurchaseOrderLine } from "@/lib/purchases/purchase-order-types";
import { roundInventoryQuantity } from "@/lib/inventory/unit-conversions";

export type PurchaseOrderSupplierGroup = {
  supplierName: string;
  lines: PurchaseOrderLine[];
  totalEstimatedCost: number | null;
};

const UNKNOWN_SUPPLIER_LABEL = "Sin proveedor";

function formatQty(value: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
}

function formatEur(value: number): string {
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

function displayUnit(unit: string): string {
  return unit === "unit" ? "ud" : unit;
}

function supplierKey(line: PurchaseOrderLine): string {
  return line.supplierName?.trim() || UNKNOWN_SUPPLIER_LABEL;
}

function computeGroupEstimatedTotal(lines: PurchaseOrderLine[]): number | null {
  let total = 0;
  let hasAny = false;
  for (const line of lines) {
    if (line.estimatedTotalCost != null && line.estimatedTotalCost >= 0) {
      total += line.estimatedTotalCost;
      hasAny = true;
    }
  }
  return hasAny ? roundInventoryQuantity(total) : null;
}

export function groupPurchaseOrderLinesBySupplier(
  lines: PurchaseOrderLine[],
): PurchaseOrderSupplierGroup[] {
  const map = new Map<string, PurchaseOrderLine[]>();
  for (const line of lines) {
    const key = supplierKey(line);
    const group = map.get(key) ?? [];
    group.push(line);
    map.set(key, group);
  }

  return [...map.entries()].map(([supplierName, groupLines]) => ({
    supplierName,
    lines: groupLines,
    totalEstimatedCost: computeGroupEstimatedTotal(groupLines),
  }));
}

export function formatPurchaseOrderLineForMessage(line: PurchaseOrderLine): string {
  const qty = formatQty(line.quantity);
  const unit = displayUnit(line.unit);
  return `- ${line.productName}: ${qty} ${unit}`;
}

export function buildPurchaseOrderMessage(
  order: Pick<PurchaseOrderDocument, "lines" | "totalEstimatedCost">,
): string {
  const groups = groupPurchaseOrderLinesBySupplier(order.lines);
  if (groups.length === 0) return "Pedido Hostly\n\nGracias.";

  const parts: string[] = ["Pedido Hostly", ""];

  for (const group of groups) {
    parts.push(`Proveedor: ${group.supplierName}`);
    for (const line of group.lines) {
      parts.push(formatPurchaseOrderLineForMessage(line));
    }
    const groupTotal =
      group.totalEstimatedCost ??
      (groups.length === 1 ? order.totalEstimatedCost : null);
    if (groupTotal != null) {
      parts.push(`Total estimado: ${formatEur(groupTotal)}`);
    }
    parts.push("");
  }

  if (groups.length > 1 && order.totalEstimatedCost != null) {
    parts.push(`Total general estimado: ${formatEur(order.totalEstimatedCost)}`);
    parts.push("");
  }

  parts.push("Gracias.");
  return parts.join("\n").trim();
}

export async function copyPurchaseOrderMessageToClipboard(text: string): Promise<boolean> {
  if (!text.trim()) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below.
    }
  }

  if (typeof document === "undefined") return false;

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}
