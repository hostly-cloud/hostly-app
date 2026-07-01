import { jsPDF } from "jspdf";
import type { BillingInvoice } from "@/types/billing-invoice";

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || "EUR"}`;
  }
}

/**
 * Genera un PDF funcional sencillo de la factura.
 * Diseño provisional — se sustituirá por plantilla definitiva.
 */
export function generateBillingInvoicePdf(invoice: BillingInvoice): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  let y = margin;

  const write = (text: string, size = 10, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 180);
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.42) + 2;
  };

  write("FACTURA", 18, true);
  write(`${invoice.invoiceNumber}`, 12, true);
  y += 2;

  write("Emisor", 11, true);
  write(invoice.restaurantSnapshot.name || "—", 10, true);
  if (invoice.restaurantSnapshot.taxId) {
    write(`CIF/NIF: ${invoice.restaurantSnapshot.taxId}`);
  }
  if (invoice.restaurantSnapshot.address) {
    write(invoice.restaurantSnapshot.address);
  }
  const issuerCity = [invoice.restaurantSnapshot.city, invoice.restaurantSnapshot.country]
    .filter(Boolean)
    .join(", ");
  if (issuerCity) write(issuerCity);
  if (invoice.restaurantSnapshot.email) write(invoice.restaurantSnapshot.email);
  y += 2;

  write("Cliente", 11, true);
  write(invoice.companySnapshot.companyName || "—", 10, true);
  if (invoice.companySnapshot.taxId) {
    write(`CIF/NIF: ${invoice.companySnapshot.taxId}`);
  }
  if (invoice.companySnapshot.address) {
    write(invoice.companySnapshot.address);
  }
  const clientCity = [
    invoice.companySnapshot.postalCode,
    invoice.companySnapshot.city,
    invoice.companySnapshot.province,
    invoice.companySnapshot.country,
  ]
    .filter(Boolean)
    .join(" ");
  if (clientCity.trim()) write(clientCity);
  if (invoice.companySnapshot.email) write(invoice.companySnapshot.email);
  y += 4;

  write("Detalle", 11, true);
  for (const line of invoice.linesSnapshot) {
    const label = line.isComped
      ? `${line.quantity} x ${line.name} (invitación)`
      : `${line.quantity} x ${line.name}`;
    write(
      `${label} — ${formatMoney(line.lineTotal, invoice.currency)}`,
      9,
    );
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
  }

  y += 2;
  write(`Subtotal: ${formatMoney(invoice.subtotal, invoice.currency)}`, 10);
  write(`Impuestos: ${formatMoney(invoice.taxes, invoice.currency)}`, 10);
  write(`TOTAL: ${formatMoney(invoice.total, invoice.currency)}`, 12, true);

  if (invoice.generatedAt) {
    y += 2;
    write(
      `Generada: ${new Date(invoice.generatedAt).toLocaleString("es-ES")}`,
      8,
    );
  }

  return doc.output("blob");
}

export function downloadBillingInvoicePdf(
  invoice: BillingInvoice,
  fileName?: string,
): void {
  const blob = generateBillingInvoicePdf(invoice);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    fileName?.trim() ||
    `factura-${invoice.invoiceNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export function printBillingInvoicePdf(invoice: BillingInvoice): void {
  const blob = generateBillingInvoicePdf(invoice);
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;
  document.body.appendChild(frame);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => {
      document.body.removeChild(frame);
      URL.revokeObjectURL(url);
    }, 1000);
  };
}
