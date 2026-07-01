"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  createEmptyBillingCustomerInput,
  type BillingCustomerInput,
} from "@/types/billing-customer";

export type NewBillingCustomerModalProps = {
  open: boolean;
  onClose: () => void;
  onSave?: (input: BillingCustomerInput) => Promise<void> | void;
  onError?: (message: string | null) => void;
};

const labelClass =
  "block text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500 mb-1.5";

const inputClass =
  "hostly-input w-full min-h-[44px] rounded-2xl text-sm";

export function NewBillingCustomerModal({
  open,
  onClose,
  onSave,
  onError,
}: NewBillingCustomerModalProps) {
  const [draft, setDraft] = useState<BillingCustomerInput>(
    createEmptyBillingCustomerInput,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(createEmptyBillingCustomerInput());
    setError(null);
    setIsSaving(false);
    onError?.(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onError]);

  const updateField = useCallback(
    <K extends keyof BillingCustomerInput>(key: K, value: BillingCustomerInput[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
      setError(null);
      onError?.(null);
    },
    [onError],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSaving) return;
      const companyName = draft.companyName.trim();
      const taxId = draft.taxId.trim();
      const email = draft.email.trim();
      if (!companyName || !taxId || !email) {
        const message =
          "Razón social, CIF/NIF y email de facturación son obligatorios.";
        setError(message);
        onError?.(message);
        return;
      }
      const normalized: BillingCustomerInput = {
        companyName,
        taxId,
        email,
        phone: draft.phone?.trim() || null,
        address: draft.address?.trim() || null,
        postalCode: draft.postalCode?.trim() || null,
        city: draft.city?.trim() || null,
        province: draft.province?.trim() || null,
        country: draft.country?.trim() || null,
        notes: draft.notes?.trim() || null,
      };
      if (!onSave) {
        onClose();
        return;
      }
      setIsSaving(true);
      setError(null);
      onError?.(null);
      try {
        await onSave(normalized);
        onClose();
      } catch (saveErr) {
        const message =
          saveErr instanceof Error
            ? saveErr.message
            : "No se pudo guardar la empresa.";
        setError(message);
        onError?.(message);
      } finally {
        setIsSaving(false);
      }
    },
    [draft, isSaving, onClose, onError, onSave],
  );

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[86] flex items-end justify-center bg-slate-950/55 p-3 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hostly-new-billing-customer-title"
        className="hostly-billing-customer-modal w-full max-w-[480px] max-h-[min(92dvh,720px)] overflow-y-auto rounded-[24px] border border-white/70 bg-white p-4 sm:p-5 shadow-[0_28px_80px_rgba(2,6,23,0.34)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="hostly-new-billing-customer-title"
          className="text-lg font-extrabold tracking-tight text-slate-950"
        >
          Nueva empresa
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Los datos se guardarán para reutilizarlos en futuros cobros.
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className={labelClass} htmlFor="billing-company-name">
              Razón social *
            </label>
            <input
              id="billing-company-name"
              className={inputClass}
              value={draft.companyName}
              onChange={(e) => updateField("companyName", e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="billing-tax-id">
                CIF / NIF *
              </label>
              <input
                id="billing-tax-id"
                className={inputClass}
                value={draft.taxId}
                onChange={(e) => updateField("taxId", e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="billing-email">
                Email facturación *
              </label>
              <input
                id="billing-email"
                type="email"
                className={inputClass}
                value={draft.email}
                onChange={(e) => updateField("email", e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="billing-phone">
              Teléfono
            </label>
            <input
              id="billing-phone"
              type="tel"
              className={inputClass}
              value={draft.phone ?? ""}
              onChange={(e) => updateField("phone", e.target.value || null)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="billing-address">
              Dirección
            </label>
            <input
              id="billing-address"
              className={inputClass}
              value={draft.address ?? ""}
              onChange={(e) => updateField("address", e.target.value || null)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass} htmlFor="billing-postal-code">
                Código postal
              </label>
              <input
                id="billing-postal-code"
                className={inputClass}
                value={draft.postalCode ?? ""}
                onChange={(e) => updateField("postalCode", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="billing-city">
                Ciudad
              </label>
              <input
                id="billing-city"
                className={inputClass}
                value={draft.city ?? ""}
                onChange={(e) => updateField("city", e.target.value || null)}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass} htmlFor="billing-province">
                Provincia
              </label>
              <input
                id="billing-province"
                className={inputClass}
                value={draft.province ?? ""}
                onChange={(e) => updateField("province", e.target.value || null)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="billing-country">
              País
            </label>
            <input
              id="billing-country"
              className={inputClass}
              value={draft.country ?? ""}
              onChange={(e) => updateField("country", e.target.value || null)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="billing-notes">
              Observaciones
            </label>
            <textarea
              id="billing-notes"
              className={`${inputClass} min-h-[80px] py-2.5 resize-y`}
              value={draft.notes ?? ""}
              onChange={(e) => updateField("notes", e.target.value || null)}
            />
          </div>

          {error ? (
            <p className="text-sm font-semibold text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 pt-4">
            <button
              type="button"
              className="hostly-button-secondary min-h-[44px] px-4 rounded-2xl"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="hostly-button-primary min-h-[44px] px-5 rounded-2xl disabled:opacity-60"
              disabled={isSaving}
            >
              {isSaving ? "Guardando…" : "Guardar empresa"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
