"use client";

import { useState } from "react";
import { HostlyButton } from "@/components/ui/hostly";

export type PaymentModalAdjustmentsSectionProps = {
  discountAmount: string;
  discountPercent: string;
  onDiscountAmountChange: (value: string) => void;
  onDiscountPercentChange: (value: string) => void;
  onPrintPreTicket: () => void;
  onSplitAccount: () => void;
};

/** Invitación, descuento, pre-ticket y dividir — colapsado por defecto en cobro premium. */
export function PaymentModalAdjustmentsSection({
  discountAmount,
  discountPercent,
  onDiscountAmountChange,
  onDiscountPercentChange,
  onPrintPreTicket,
  onSplitAccount,
}: PaymentModalAdjustmentsSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-slate-200/80">
      <HostlyButton
        variant="ghost"
        size="touch"
        aria-expanded={open}
        className="hostly-payment-dock-row flex w-full items-center justify-between gap-2 py-1.5 text-left touch-manipulation"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
          Ajustes
        </span>
        <span className="hostly-payment-dock-row-action text-xs font-semibold">
          Más opciones {open ? "▾" : "▸"}
        </span>
      </HostlyButton>

      {open ? (
        <div className="space-y-2 pb-1">
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="text"
              placeholder="Invitación (€)"
              value={discountAmount}
              onChange={(e) => onDiscountAmountChange(e.target.value)}
              className="min-h-[36px] border border-slate-200 rounded-xl px-2.5 text-sm bg-white shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
            <input
              type="text"
              placeholder="Descuento (%)"
              value={discountPercent}
              onChange={(e) => onDiscountPercentChange(e.target.value)}
              className="min-h-[36px] border border-slate-200 rounded-xl px-2.5 text-sm bg-white shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <HostlyButton
              variant="secondary"
              size="touch"
              className="hostly-payment-chip-btn min-h-[36px] rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 shadow-sm touch-manipulation"
              onClick={onPrintPreTicket}
            >
              Pre-ticket
            </HostlyButton>
            <HostlyButton
              variant="secondary"
              size="touch"
              className="hostly-payment-chip-btn min-h-[36px] rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 shadow-sm touch-manipulation"
              onClick={onSplitAccount}
            >
              Dividir cuenta
            </HostlyButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
