"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { BillingCustomerSelectedCard } from "@/components/tpv/payment/billing-customer-selected-card";
import { NewBillingCustomerModal } from "@/components/tpv/payment/new-billing-customer-modal";
import { useBillingCustomers } from "@/hooks/useBillingCustomers";
import type { BillingCustomer, BillingCustomerInput } from "@/types/billing-customer";

export type PaymentBillingSectionProps = {
  /** `compact` para panel de ajustes en modal de cobro reducido. */
  variant?: "default" | "compact";
  restaurantId: string | null;
  selectedCustomer: BillingCustomer | null;
  onSelectedCustomerChange: (customer: BillingCustomer | null) => void;
};

export function PaymentBillingSection({
  variant = "default",
  restaurantId,
  selectedCustomer,
  onSelectedCustomerChange,
}: PaymentBillingSectionProps) {
  const sectionId = useId();
  const [billingOpen, setBillingOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false);
  const [isChangingCustomer, setIsChangingCustomer] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    loading,
    error: customersError,
    createBillingCustomer,
    searchBillingCustomers,
  } = useBillingCustomers(restaurantId);

  const isCompact = variant === "compact";
  const showSearch = !selectedCustomer || isChangingCustomer;

  const searchResults = useMemo(
    () => searchBillingCustomers(customerSearch),
    [customerSearch, searchBillingCustomers],
  );

  const handleSelectCustomer = useCallback(
    (customer: BillingCustomer) => {
      onSelectedCustomerChange(customer);
      setCustomerSearch(customer.companyName);
      setIsChangingCustomer(false);
      setSaveError(null);
    },
    [onSelectedCustomerChange],
  );

  const handleCreateCustomer = useCallback(
    async (input: BillingCustomerInput) => {
      setSaveError(null);
      const created = await createBillingCustomer(input);
      handleSelectCustomer(created);
      setNewCustomerModalOpen(false);
    },
    [createBillingCustomer, handleSelectCustomer],
  );

  const handleClearSelection = useCallback(() => {
    onSelectedCustomerChange(null);
    setCustomerSearch("");
    setIsChangingCustomer(false);
    setSaveError(null);
  }, [onSelectedCustomerChange]);

  const handleChangeCustomer = useCallback(() => {
    setIsChangingCustomer(true);
    setCustomerSearch("");
    setSaveError(null);
  }, []);

  return (
    <>
      <section
        className={
          isCompact
            ? "rounded-[16px] border border-slate-200/90 bg-white p-2 space-y-2"
            : "rounded-[18px] border border-slate-200 bg-slate-50/70 p-3 space-y-2.5"
        }
        aria-labelledby={`${sectionId}-title`}
      >
        <div
          id={`${sectionId}-title`}
          className={
            isCompact
              ? "text-[10px] font-black text-slate-400 uppercase tracking-[0.16em]"
              : "text-[11px] font-black text-slate-400 uppercase tracking-[0.18em]"
          }
        >
          Facturación
        </div>

        <button
          type="button"
          aria-expanded={billingOpen}
          aria-controls={`${sectionId}-panel`}
          className={
            isCompact
              ? "w-full min-h-[42px] rounded-2xl border border-blue-200 bg-blue-50 px-3 text-sm font-extrabold text-blue-900 shadow-sm active:bg-blue-100/80 touch-manipulation transition"
              : "w-full min-h-[46px] rounded-2xl border border-blue-200 bg-blue-50 px-4 text-sm font-extrabold text-blue-900 shadow-sm hover:bg-blue-100/70 active:bg-blue-100 touch-manipulation transition"
          }
          onClick={() => setBillingOpen((open) => !open)}
        >
          Emitir factura
        </button>

        {billingOpen ? (
          <div id={`${sectionId}-panel`} className="space-y-2 pt-0.5">
            {selectedCustomer && !isChangingCustomer ? (
              <BillingCustomerSelectedCard
                customer={selectedCustomer}
                compact={isCompact}
                onChange={handleChangeCustomer}
                onClear={handleClearSelection}
              />
            ) : (
              <>
                <label
                  className="block text-[11px] font-bold text-slate-600"
                  htmlFor={`${sectionId}-search`}
                >
                  Empresa
                </label>
                <div className="relative">
                  <input
                    id={`${sectionId}-search`}
                    type="search"
                    placeholder="Buscar empresa por nombre, CIF o email"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className={
                      isCompact
                        ? "w-full min-h-[40px] rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                        : "hostly-input w-full min-h-[44px] rounded-2xl text-sm"
                    }
                    autoComplete="off"
                  />

                  {customerSearch.trim() && searchResults.length > 0 ? (
                    <ul
                      className="absolute left-0 right-0 top-[calc(100%+4px)] z-[4] max-h-[168px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_16px_40px_rgba(15,23,42,0.12)]"
                      role="listbox"
                      aria-label="Resultados de empresas"
                    >
                      {searchResults.map((customer) => (
                        <li key={customer.id} role="option">
                          <button
                            type="button"
                            className="w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50 active:bg-slate-100 touch-manipulation"
                            onClick={() => handleSelectCustomer(customer)}
                          >
                            <div className="text-sm font-bold text-slate-900 leading-snug">
                              {customer.companyName}
                            </div>
                            <div className="text-xs font-semibold text-slate-500">
                              {customer.taxId} · {customer.email}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {customerSearch.trim() &&
                  !loading &&
                  searchResults.length === 0 ? (
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Sin coincidencias. Crea una empresa nueva.
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  className={
                    isCompact
                      ? "inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100/80 touch-manipulation"
                      : "inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50 active:bg-blue-100/70 touch-manipulation"
                  }
                  onClick={() => setNewCustomerModalOpen(true)}
                >
                  <span aria-hidden className="text-base leading-none">
                    +
                  </span>
                  Nueva empresa
                </button>
              </>
            )}

            {customersError ? (
              <p className="text-xs font-semibold text-red-600" role="alert">
                {customersError}
              </p>
            ) : null}
            {saveError ? (
              <p className="text-xs font-semibold text-red-600" role="alert">
                {saveError}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <NewBillingCustomerModal
        open={newCustomerModalOpen}
        onClose={() => setNewCustomerModalOpen(false)}
        onSave={handleCreateCustomer}
        onError={setSaveError}
      />
    </>
  );
}
