"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { BillingCustomerSelectedCard } from "@/components/tpv/payment/billing-customer-selected-card";
import { NewBillingCustomerModal } from "@/components/tpv/payment/new-billing-customer-modal";
import { HostlyButton } from "@/components/ui/hostly";
import { useBillingCustomers } from "@/hooks/useBillingCustomers";
import type { BillingCustomer, BillingCustomerInput } from "@/types/billing-customer";

export type PaymentBillingSectionProps = {
  /** `compact` para panel reducido; `dock` = una línea en cobro premium. */
  variant?: "default" | "compact" | "dock";
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

  const isDock = variant === "dock";
  const isCompact = variant === "compact" || isDock;

  const searchResults = useMemo(
    () => searchBillingCustomers(customerSearch),
    [customerSearch, searchBillingCustomers],
  );

  const collapseBilling = useCallback(() => {
    setBillingOpen(false);
  }, []);

  const handleSelectCustomer = useCallback(
    (customer: BillingCustomer) => {
      onSelectedCustomerChange(customer);
      setCustomerSearch(customer.companyName);
      setIsChangingCustomer(false);
      setSaveError(null);
      if (isDock) collapseBilling();
    },
    [collapseBilling, isDock, onSelectedCustomerChange],
  );

  const handleCreateCustomer = useCallback(
    async (input: BillingCustomerInput) => {
      setSaveError(null);
      const created = await createBillingCustomer(input);
      handleSelectCustomer(created);
      setNewCustomerModalOpen(false);
      collapseBilling();
    },
    [collapseBilling, createBillingCustomer, handleSelectCustomer],
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

  const handleCloseModal = useCallback(() => {
    setNewCustomerModalOpen(false);
  }, []);

  const toggleBilling = useCallback(() => {
    setBillingOpen((open) => !open);
  }, []);

  const showCustomerOnDisclosure =
    Boolean(selectedCustomer) && !isChangingCustomer && !billingOpen;

  return (
    <>
      {isDock ? (
        <div className="pt-0.5">
          <HostlyButton
            variant="ghost"
            size="touch"
            aria-expanded={billingOpen}
            aria-controls={`${sectionId}-panel`}
            aria-label={
              showCustomerOnDisclosure
                ? `Factura: ${selectedCustomer!.companyName}. Abrir opciones de facturación`
                : "Emitir factura"
            }
            className="hostly-payment-billing-disclosure touch-manipulation"
            onClick={toggleBilling}
          >
            <div className="min-w-0 flex-1">
              {showCustomerOnDisclosure ? (
                <>
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="shrink-0 text-[17px] leading-none"
                      aria-hidden
                    >
                      🧾
                    </span>
                    <span className="truncate text-sm font-bold text-slate-900">
                      {selectedCustomer!.companyName}
                    </span>
                  </div>
                  <div className="mt-0.5 pl-[25px] text-[11px] font-semibold text-slate-500 tabular-nums">
                    {selectedCustomer!.taxId}
                  </div>
                </>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="shrink-0 text-[17px] leading-none"
                    aria-hidden
                  >
                    🧾
                  </span>
                  <span className="text-sm font-bold text-slate-800">
                    Emitir factura
                  </span>
                </div>
              )}
            </div>
            <span
              className="hostly-payment-billing-disclosure-chevron"
              aria-hidden
            >
              ▸
            </span>
          </HostlyButton>

          {billingOpen ? (
            <div id={`${sectionId}-panel`} className="space-y-3 pb-4 pt-2">
              {selectedCustomer && !isChangingCustomer ? (
                <BillingCustomerSelectedCard
                  customer={selectedCustomer}
                  compact
                  minimal
                  onChange={handleChangeCustomer}
                  onClear={handleClearSelection}
                />
              ) : (
                <>
                  <label
                    className="block text-[10px] font-bold text-slate-500"
                    htmlFor={`${sectionId}-search`}
                  >
                    Empresa
                  </label>
                  <div className="relative">
                    <input
                      id={`${sectionId}-search`}
                      type="search"
                      placeholder="Buscar por nombre, CIF o email"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full min-h-[36px] rounded-xl border border-slate-200 bg-white px-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                      autoComplete="off"
                    />

                    {customerSearch.trim() && searchResults.length > 0 ? (
                      <ul
                        className="absolute left-0 right-0 top-[calc(100%+4px)] z-[4] max-h-[140px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
                        role="listbox"
                        aria-label="Resultados de empresas"
                      >
                        {searchResults.map((customer) => (
                          <li key={customer.id} role="option" aria-selected={false}>
                            <HostlyButton
                              variant="ghost"
                              size="touch"
                              className="hostly-payment-list-item w-full rounded-lg px-2.5 py-1.5 text-left touch-manipulation"
                              onClick={() => handleSelectCustomer(customer)}
                            >
                              <div className="text-sm font-bold text-slate-900 leading-snug">
                                {customer.companyName}
                              </div>
                              <div className="text-xs font-semibold text-slate-500">
                                {customer.taxId} · {customer.email}
                              </div>
                            </HostlyButton>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {customerSearch.trim() &&
                    !loading &&
                    searchResults.length === 0 ? (
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        Sin coincidencias. Crea una empresa nueva.
                      </p>
                    ) : null}
                  </div>

                  <HostlyButton
                    variant="secondary"
                    size="touch"
                    className="hostly-payment-chip-btn inline-flex min-h-[42px] w-full items-center justify-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 text-sm font-extrabold text-blue-700 shadow-sm touch-manipulation"
                    onClick={() => setNewCustomerModalOpen(true)}
                  >
                    <span aria-hidden className="text-lg leading-none">
                      +
                    </span>
                    Nueva empresa
                  </HostlyButton>
                </>
              )}

              {customersError ? (
                <p className="text-[11px] font-semibold text-red-600" role="alert">
                  {customersError}
                </p>
              ) : null}
              {saveError ? (
                <p className="text-[11px] font-semibold text-red-600" role="alert">
                  {saveError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
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

          <HostlyButton
            variant="secondary"
            size="touch"
            aria-expanded={billingOpen}
            aria-controls={`${sectionId}-panel`}
            className={
              isCompact
                ? "hostly-payment-primary-toggle w-full min-h-[42px] rounded-2xl border border-blue-200 bg-blue-50 px-3 text-sm font-extrabold text-blue-900 shadow-sm touch-manipulation"
                : "hostly-payment-primary-toggle w-full min-h-[46px] rounded-2xl border border-blue-200 bg-blue-50 px-4 text-sm font-extrabold text-blue-900 shadow-sm touch-manipulation"
            }
            onClick={toggleBilling}
          >
            Emitir factura
          </HostlyButton>

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
                          <li key={customer.id} role="option" aria-selected={false}>
                            <HostlyButton
                              variant="ghost"
                              size="touch"
                              className="hostly-payment-list-item w-full rounded-xl px-3 py-2 text-left touch-manipulation"
                              onClick={() => handleSelectCustomer(customer)}
                            >
                              <div className="text-sm font-bold text-slate-900 leading-snug">
                                {customer.companyName}
                              </div>
                              <div className="text-xs font-semibold text-slate-500">
                                {customer.taxId} · {customer.email}
                              </div>
                            </HostlyButton>
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

                  <HostlyButton
                    variant="secondary"
                    size="touch"
                    className="hostly-payment-chip-btn inline-flex min-h-[42px] w-full items-center justify-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 text-sm font-extrabold text-blue-700 shadow-sm touch-manipulation"
                    onClick={() => setNewCustomerModalOpen(true)}
                  >
                    <span aria-hidden className="text-lg leading-none">
                      +
                    </span>
                    Nueva empresa
                  </HostlyButton>
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
      )}

      <NewBillingCustomerModal
        open={newCustomerModalOpen}
        onClose={handleCloseModal}
        onSave={handleCreateCustomer}
        onError={setSaveError}
      />
    </>
  );
}
