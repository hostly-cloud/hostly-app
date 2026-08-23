"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchProductCommercialIdentity,
  saveProductCommercialIdentity,
} from "@/lib/productos/product-commercial-identity-api";

export function ProductCommercialIdentityPanel({
  productId,
  disabled = false,
  inputClassName,
}: {
  productId: string | null;
  disabled?: boolean;
  inputClassName: string;
}) {
  const [brand, setBrand] = useState("");
  const [quantity, setQuantity] = useState("");
  const [barcode, setBarcode] = useState("");
  const [initialKey, setInitialKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const currentKey = useMemo(
    () => `${brand.trim()}\n${quantity.trim()}\n${barcode.replace(/\D/g, "")}`,
    [brand, quantity, barcode],
  );
  const dirty = Boolean(productId) && currentKey !== initialKey;

  const load = useCallback(async () => {
    if (!productId) {
      setBrand("");
      setQuantity("");
      setBarcode("");
      setInitialKey("");
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const identity = await fetchProductCommercialIdentity(productId);
      setBrand(identity.brand);
      setQuantity(identity.quantity);
      setBarcode(identity.barcode);
      setInitialKey(
        `${identity.brand.trim()}\n${identity.quantity.trim()}\n${identity.barcode.replace(/\D/g, "")}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la identidad comercial.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!productId || !dirty || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const identity = await saveProductCommercialIdentity({
        productId,
        brand,
        quantity,
        barcode,
      });
      setBrand(identity.brand);
      setQuantity(identity.quantity);
      setBarcode(identity.barcode);
      setInitialKey(
        `${identity.brand.trim()}\n${identity.quantity.trim()}\n${identity.barcode.replace(/\D/g, "")}`,
      );
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la identidad comercial.");
    } finally {
      setSaving(false);
    }
  }, [barcode, brand, dirty, productId, quantity, saving]);

  if (!productId) {
    return (
      <section className="hostly-product-commercial-modal__field" aria-label="Identidad comercial">
        <span className="hostly-product-commercial-modal__label">Identidad comercial</span>
        <p className="hostly-product-commercial-modal__hint">
          Guarda primero el producto para añadir marca, formato y EAN / GTIN.
        </p>
      </section>
    );
  }

  return (
    <section className="hostly-product-commercial-modal__field" aria-label="Identidad comercial">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <span className="hostly-product-commercial-modal__label">Identidad comercial</span>
        <span className="hostly-product-commercial-modal__hint" style={{ margin: 0 }}>
          Opcional · mejora coincidencias reales
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        <label className="hostly-carta-config-form-field">
          <span className="hostly-carta-config-form-label">Marca</span>
          <input
            className={inputClassName}
            value={brand}
            maxLength={120}
            onChange={(event) => {
              setBrand(event.target.value);
              setSaved(false);
            }}
            placeholder="Ej. Coca-Cola"
            disabled={disabled || loading || saving}
          />
        </label>
        <label className="hostly-carta-config-form-field">
          <span className="hostly-carta-config-form-label">Formato</span>
          <input
            className={inputClassName}
            value={quantity}
            maxLength={60}
            onChange={(event) => {
              setQuantity(event.target.value);
              setSaved(false);
            }}
            placeholder="Ej. 33 cl"
            disabled={disabled || loading || saving}
          />
        </label>
        <label className="hostly-carta-config-form-field">
          <span className="hostly-carta-config-form-label">EAN / GTIN</span>
          <input
            className={inputClassName}
            value={barcode}
            inputMode="numeric"
            autoComplete="off"
            onChange={(event) => {
              setBarcode(event.target.value);
              setSaved(false);
            }}
            placeholder="Ej. 5449000131805"
            disabled={disabled || loading || saving}
          />
        </label>
      </div>
      <p className="hostly-product-commercial-modal__hint">
        Si existe EAN / GTIN, Hostly lo prioriza sobre el nombre al buscar una imagen real.
      </p>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          className="hostly-button-secondary hostly-button-compact"
          disabled={disabled || loading || saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? "Guardando…" : "Guardar identidad"}
        </button>
        {loading ? <span className="hostly-product-commercial-modal__hint">Cargando…</span> : null}
        {saved ? <span className="hostly-product-commercial-modal__hint" role="status">Identidad guardada.</span> : null}
        {error ? <span className="hostly-carta-config-alert hostly-carta-config-alert--error" role="alert">{error}</span> : null}
      </div>
    </section>
  );
}
