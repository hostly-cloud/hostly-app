import type { BillingInvoice } from "@/types/billing-invoice";

export type PreparedInvoiceEmail = {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  /** Placeholder hasta integrar SMTP / SendGrid / Resend. */
  deliveryMode: "placeholder";
  invoiceId: string;
  invoiceNumber: string;
};

export type PrepareInvoiceEmailResult = {
  prepared: PreparedInvoiceEmail;
  canSend: boolean;
  reasonIfBlocked: string | null;
};

/**
 * Prepara el payload de email de factura sin enviarlo.
 * Integraciones futuras: AEAT, Holded, Sage, A3, Odoo vía adaptadores.
 */
export function prepareInvoiceEmail(invoice: BillingInvoice): PrepareInvoiceEmailResult {
  const to = invoice.companySnapshot.email.trim();
  if (!to) {
    return {
      prepared: {
        to: "",
        subject: "",
        bodyText: "",
        bodyHtml: "",
        deliveryMode: "placeholder",
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      },
      canSend: false,
      reasonIfBlocked: "La empresa no tiene email de facturación.",
    };
  }

  const issuer = invoice.restaurantSnapshot.name.trim() || "Hostly";
  const subject = `Factura ${invoice.invoiceNumber} — ${issuer}`;
  const bodyText = [
    `Hola ${invoice.companySnapshot.companyName},`,
    "",
    `Adjuntamos la factura ${invoice.invoiceNumber} por un importe de ${invoice.total.toFixed(2)} ${invoice.currency}.`,
    "",
    `Emisor: ${issuer}`,
    "",
    "Este envío está preparado. La integración SMTP definitiva se activará en una fase posterior.",
  ].join("\n");

  const bodyHtml = bodyText.replace(/\n/g, "<br/>");

  return {
    prepared: {
      to,
      subject,
      bodyText,
      bodyHtml,
      deliveryMode: "placeholder",
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    },
    canSend: true,
    reasonIfBlocked: null,
  };
}

export type SendPreparedInvoiceEmailResult = {
  ok: boolean;
  message: string;
  /** Simula cola de envío para futura integración. */
  queued: boolean;
};

/**
 * Placeholder de envío: valida y confirma preparación sin SMTP real.
 */
export async function sendPreparedInvoiceEmail(
  prepared: PreparedInvoiceEmail,
): Promise<SendPreparedInvoiceEmailResult> {
  if (!prepared.to.trim()) {
    return {
      ok: false,
      message: "No hay destinatario de email.",
      queued: false,
    };
  }

  return {
    ok: true,
    message: `Envío preparado para ${prepared.to} (integración email pendiente).`,
    queued: true,
  };
}
