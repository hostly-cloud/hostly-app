"use client";

import { HostlyButton } from "@/components/ui/hostly";
import { useBillingInvoiceActions } from "@/hooks/useBillingInvoiceActions";
import type { BillingInvoice } from "@/types/billing-invoice";

export type BillingInvoiceCompletionPanelProps = {
  open: boolean;
  invoice: BillingInvoice;
  onClose: () => void;
};

export function BillingInvoiceCompletionPanel({
  open,
  invoice,
  onClose,
}: BillingInvoiceCompletionPanelProps) {
  const { isSending, sendMessage, downloadPdf, printPdf, sendInvoice } =
    useBillingInvoiceActions();

  if (!open) return null;

  const companyName = invoice.companySnapshot.companyName.trim() || "—";
  const companyEmail = invoice.companySnapshot.email.trim();

  return (
    <div className="fixed inset-0 z-[88] flex items-end justify-center bg-slate-950/60 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hostly-billing-invoice-complete-title"
        className="w-full max-w-[420px] rounded-[24px] border border-white/70 bg-white p-4 sm:p-5 shadow-[0_28px_80px_rgba(2,6,23,0.34)]"
      >
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
          Factura generada
        </div>
        <h2
          id="hostly-billing-invoice-complete-title"
          className="mt-1 text-xl font-extrabold tracking-tight text-slate-950"
        >
          {invoice.invoiceNumber}
        </h2>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 space-y-1">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            Empresa
          </div>
          <div className="text-sm font-extrabold text-slate-950">{companyName}</div>
          {companyEmail ? (
            <div className="text-sm font-semibold text-slate-600">{companyEmail}</div>
          ) : (
            <div className="text-xs font-semibold text-amber-700">
              Sin email — el envío no estará disponible.
            </div>
          )}
          <div className="pt-1 text-sm font-bold text-slate-800">
            Total: {invoice.total.toFixed(2)} {invoice.currency}
          </div>
        </div>

        {sendMessage ? (
          <p className="mt-3 text-xs font-semibold text-emerald-700" role="status">
            {sendMessage}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <HostlyButton
            variant="primary"
            size="touch"
            disabled={!companyEmail || isSending}
            className="col-span-2 min-h-[48px] rounded-2xl bg-blue-600 text-sm font-extrabold text-white shadow-sm disabled:opacity-50 touch-manipulation"
            onClick={() => {
              void sendInvoice(invoice).catch((err) => {
                window.alert(
                  err instanceof Error ? err.message : "No se pudo enviar la factura.",
                );
              });
            }}
          >
            {isSending ? "Preparando envío…" : "Enviar factura"}
          </HostlyButton>
          <HostlyButton
            variant="secondary"
            size="touch"
            className="min-h-[44px] rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700 shadow-sm touch-manipulation"
            onClick={() => downloadPdf(invoice)}
          >
            Descargar PDF
          </HostlyButton>
          <HostlyButton
            variant="secondary"
            size="touch"
            className="min-h-[44px] rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700 shadow-sm touch-manipulation"
            onClick={() => printPdf(invoice)}
          >
            Imprimir
          </HostlyButton>
          <HostlyButton
            variant="ghost"
            size="touch"
            className="col-span-2 min-h-[44px] rounded-2xl bg-slate-100 text-sm font-bold text-slate-700 touch-manipulation"
            onClick={onClose}
          >
            Cerrar
          </HostlyButton>
        </div>
      </div>
    </div>
  );
}
