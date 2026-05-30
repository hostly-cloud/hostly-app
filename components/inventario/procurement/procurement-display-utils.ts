import type { ComponentProps } from "react";
import type { PurchaseRiskLevel } from "@/lib/inventory/purchase-intelligence";
import type { HostlyStatusBadge, HostlyStatusBadgeTone } from "@/components/ui/hostly/data-table";

type StatusTone = NonNullable<ComponentProps<typeof HostlyStatusBadge>["tone"]>;
export function purchaseRiskStatusTone(level: PurchaseRiskLevel): StatusTone {
  switch (level) {
    case "out":
    case "urgent":
      return "danger";
    case "soon":
      return "warning";
    case "watch":
      return "warning";
    case "ok":
      return "success";
    default:
      return "muted";
  }
}

export function supplierInvoiceStatusTone(status: string): StatusTone {
  return status === "recorded" ? "success" : "muted";
}

export function supplierInvoiceStatusLabel(status: string): string {
  return status === "recorded" ? "Registrada" : "Borrador";
}

export function recepcionOperBadgeTone(
  variant: "neutral" | "ok" | "warn" | "bad" | "muted",
): HostlyStatusBadgeTone {
  switch (variant) {
    case "ok":
      return "success";
    case "warn":
      return "warning";
    case "bad":
      return "danger";
    case "muted":
      return "muted";
    default:
      return "neutral";
  }
}

export function formatProcurementQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
}

export function formatProcurementEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatProcurementDays(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
}

export function displayProcurementUnit(unit: string): string {
  return unit === "unit" ? "ud" : unit;
}
