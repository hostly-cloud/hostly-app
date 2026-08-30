import type { ActivityLogDocument } from "@/lib/firestore/activity-log";

export function activityActorLabel(log: ActivityLogDocument): string {
  const name = log.actorUserName?.trim();
  if (name) return name;
  return log.actorUserId?.trim() ? "Usuario" : "Sistema";
}

function paymentMethodLabel(value: string): string {
  switch (value.trim().toLowerCase()) {
    case "cash":
    case "efectivo":
      return "Efectivo";
    case "card":
    case "tarjeta":
      return "Tarjeta";
    case "bizum":
      return "Bizum";
    default:
      return value.trim();
  }
}

function entityFallback(log: ActivityLogDocument): string {
  switch (log.entityType) {
    case "order":
      return "Comanda";
    case "payment":
      return "Cobro";
    case "product":
      return "Producto";
    case "purchaseOrder":
      return "Pedido de compra";
    case "supplierInvoice":
      return "Factura de proveedor";
    case "table":
      return "Mesa";
    case "user":
      return "Usuario";
    default:
      return "Registro operativo";
  }
}

export function activitySummary(log: ActivityLogDocument): string {
  const meta = log.metadata;
  if (!meta) return entityFallback(log);

  const parts: string[] = [];
  if (typeof meta.tableName === "string" && meta.tableName.trim()) {
    parts.push(meta.tableName.trim());
  }
  if (typeof meta.lineCount === "number" && Number.isFinite(meta.lineCount)) {
    parts.push(`${meta.lineCount} líneas`);
  }
  if (typeof meta.amount === "number" && Number.isFinite(meta.amount)) {
    parts.push(
      `${new Intl.NumberFormat("es-ES", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(meta.amount)} €`,
    );
  }
  if (typeof meta.productName === "string" && meta.productName.trim()) {
    parts.push(meta.productName.trim());
  }
  if (typeof meta.paymentMethod === "string" && meta.paymentMethod.trim()) {
    parts.push(paymentMethodLabel(meta.paymentMethod));
  }

  return parts.length > 0 ? parts.join(" · ") : entityFallback(log);
}
