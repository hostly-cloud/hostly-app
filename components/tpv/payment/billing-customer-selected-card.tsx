"use client";

import { HostlyButton } from "@/components/ui/hostly";
import type { BillingCustomer } from "@/types/billing-customer";

export type BillingCustomerSelectedCardProps = {
  customer: BillingCustomer;
  compact?: boolean;
  /** Tarjeta mínima para cobro premium (solo Cambiar). */
  minimal?: boolean;
  onChange: () => void;
  onClear: () => void;
};

export function BillingCustomerSelectedCard({
  customer,
  compact = false,
  minimal = false,
  onChange,
  onClear,
}: BillingCustomerSelectedCardProps) {
  if (minimal) {
    return (
      <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 px-2.5 py-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
          Empresa
        </div>
        <div className="mt-0.5 text-sm font-bold text-slate-900 leading-snug">
          {customer.companyName}
        </div>
        <div className="text-[11px] font-medium text-slate-600 tabular-nums">
          {customer.taxId}
        </div>
        <div className="text-[11px] font-medium text-slate-600 truncate">
          {customer.email}
        </div>
        <HostlyButton
          variant="secondary"
          size="touch"
          className="hostly-payment-chip-btn mt-2 min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm touch-manipulation"
          onClick={onChange}
        >
          Cambiar empresa
        </HostlyButton>
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "rounded-2xl border border-blue-200/80 bg-blue-50/60 p-2.5 space-y-2"
          : "rounded-2xl border border-blue-200 bg-blue-50/70 p-3 space-y-2.5"
      }
    >
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700/80">
        Empresa
      </div>
      <div className="space-y-1">
        <div
          className={
            compact
              ? "text-sm font-extrabold text-slate-950 leading-snug"
              : "text-base font-extrabold text-slate-950 leading-snug"
          }
        >
          {customer.companyName}
        </div>
        <div className="text-xs font-semibold text-slate-600">
          <span className="text-slate-400">CIF</span> {customer.taxId}
        </div>
        <div className="text-xs font-semibold text-slate-600 truncate">
          <span className="text-slate-400">Email</span> {customer.email}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-0.5">
        <HostlyButton
          variant="secondary"
          size="touch"
          className="hostly-payment-chip-btn min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm touch-manipulation"
          onClick={onChange}
        >
          Cambiar empresa
        </HostlyButton>
        <HostlyButton
          variant="destructive"
          size="touch"
          className="hostly-payment-chip-btn hostly-payment-chip-btn-danger min-h-[36px] rounded-xl border border-transparent px-3 text-xs font-bold text-red-700 touch-manipulation"
          onClick={onClear}
        >
          Eliminar selección
        </HostlyButton>
      </div>
    </div>
  );
}
