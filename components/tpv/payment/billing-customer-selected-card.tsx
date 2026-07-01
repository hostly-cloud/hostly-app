"use client";

import type { BillingCustomer } from "@/types/billing-customer";

export type BillingCustomerSelectedCardProps = {
  customer: BillingCustomer;
  compact?: boolean;
  onChange: () => void;
  onClear: () => void;
};

export function BillingCustomerSelectedCard({
  customer,
  compact = false,
  onChange,
  onClear,
}: BillingCustomerSelectedCardProps) {
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
        <button
          type="button"
          className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm active:bg-slate-50 touch-manipulation"
          onClick={onChange}
        >
          Cambiar empresa
        </button>
        <button
          type="button"
          className="min-h-[36px] rounded-xl px-3 text-xs font-bold text-red-700 hover:bg-red-50 active:bg-red-100/80 touch-manipulation"
          onClick={onClear}
        >
          Eliminar selección
        </button>
      </div>
    </div>
  );
}
