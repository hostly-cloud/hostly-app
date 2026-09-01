"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProductBarcodeScanner } from "@/components/productos/product-barcode-scanner";
import { ProductExactCatalogImageSuggestion } from "@/components/productos/product-exact-catalog-image-suggestion";
import {
  fetchProductCommercialIdentity,
  saveProductCommercialIdentity,
} from "@/lib/productos/product-commercial-identity-api";
import { fetchProductImageReviewState } from "@/lib/productos/product-image-review-api";

function identityKey(values: {
  brand: string;
  quantity: string;
  barcode: string;
  wineProducer: string;
  wineAppellation: string;
  wineVintage: string;
}) {
  return [
    values.brand.trim(),
    values.quantity.trim(),
    values.barcode.replace(/\D/g, ""),
    values.wineProducer.trim(),
    values.wineAppellation.trim(),
    values.wineVintage.trim(),
  ].join("\n");
}

export function ProductCommercialIdentityPanel({
  productId,
  productName,
  disabled = false,
  inputClassName,
  onExactImageAttached,
}: {
  productId?: string | null;
  productName: string;
  disabled?: boolean;
  inputClassName: string;
  onExactImageAttached?: (imageUrl: string) => void;
}) {
  const [resolvedProductId, setResolvedProductId] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [quantity, setQuantity] = useState("");
  const [barcode, setBarcode] = useState("");
  const [wineProducer, setWineProducer] = useState("");
  const [wineAppellation, setWineAppellation] = useState("");
  const [wineVintage, setWineVintage] = useState("");
  const [persistedBarcode, setPersistedBarcode] = useState("");
  const [exactImageRefreshKey, setExactImageRefreshKey] = useState(0);
  const [initialKey, setInitialKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const currentKey = useMemo(
    () =>
      identityKey({
        brand,
        quantity,
        barcode,
        wineProducer,
        wineAppellation,
        wineVintage,
      }),
    [brand, quantity, barcode, wineProducer, wineAppellation, wineVintage],
  );
  const dirty = Boolean(resolvedProductId) && currentKey !== initialKey;

  const clear = useCallback(() => {
    setResolvedProductId(null);
    setBrand("");
    setQuantity("");
    setBarcode("");
    setWineProducer("");
    setWineAppellation("");
    setWineVintage("");
    setPersistedBarcode("");
    setInitialKey("");
  }, []);

  const load = useCallback(async () => {
    const explicitId = productId?.trim() || "";
    const name = productName.trim();
    if (!explicitId && !name) {
      clear();
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      let id = explicitId;
      if (!id) {
        const { state } = await fetchProductImageReviewState(name);
        if (state.resolution === "ambiguous") {
          throw new Error(
            "Hay varios productos con este nombre. Guarda un nombre único antes de editar su identidad.",
          );
        }
        if (state.resolution !== "resolved") {
          clear();
          return;
        }
        id = state.productId;
      }

      const identity = await fetchProductCommercialIdentity(id);
      setResolvedProductId(identity.productId);
      setBrand(identity.brand);
      setQuantity(identity.quantity);
      setBarcode(identity.barcode);
      setWineProducer(identity.wineProducer);
      setWineAppellation(identity.wineAppellation);
      setWineVintage(identity.wineVintage);
      setPersistedBarcode(identity.barcode);
      setInitialKey(identityKey(identity));
    } catch (cause) {
      clear();
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo cargar la identidad comercial.",
      );
    } finally {
      setLoading(false);
    }
  }, [clear, productId, productName]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!resolvedProductId || !dirty || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const identity = await saveProductCommercialIdentity({
        productId: resolvedProductId,
        brand,
        quantity,
        barcode,
        wineProducer,
        wineAppellation,
        wineVintage,
      });
      setBrand(identity.brand);
      setQuantity(identity.quantity);
      setBarcode(identity.barcode);
      setWineProducer(identity.wineProducer);
      setWineAppellation(identity.wineAppellation);
      setWineVintage(identity.wineVintage);
      setPersistedBarcode(identity.barcode);
      setInitialKey(identityKey(identity));
      setExactImageRefreshKey((value) => value + 1);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar la identidad comercial.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    barcode,
    brand,
    dirty,
    quantity,
    resolvedProductId,
    saving,
    wineAppellation,
    wineProducer,
    wineVintage,
  ]);

  if (!resolvedProductId && !loading) {
    return (
      <section
        className="hostly-product-commercial-modal__field"
        aria-label="Identidad comercial"
      >
        <span className="hostly-product-commercial-modal__label">
          Identidad comercial
        </span>
        <p className="hostly-product-commercial-modal__hint">
          {error ??
            "Guarda primero el producto para añadir marca, formato y EAN / GTIN."}
        </p>
      </section>
    );
  }

  return (
    <section
      className="hostly-product-commercial-modal__field"
      aria-label="Identidad comercial"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        <span className="hostly-product-commercial-modal__label">
          Identidad comercial
        </span>
        <span
          className="hostly-product-commercial-modal__hint"
          style={{ margin: 0 }}
        >
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
        <div className="hostly-carta-config-form-field">
          <span className="hostly-carta-config-form-label">EAN / GTIN</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
              style={{ minWidth: 0, flex: "1 1 auto" }}
            />
            <ProductBarcodeScanner
              disabled={disabled || loading || saving}
              onDetected={(gtin) => {
                setBarcode(gtin);
                setSaved(false);
                setError(null);
              }}
            />
          </div>
        </div>
      </div>

      <details
        style={{
          marginTop: 4,
          border: "1px solid rgba(148,163,184,.2)",
          borderRadius: 10,
          padding: "8px 10px",
        }}
      >
        <summary
          style={{ cursor: "pointer", fontSize: 11, fontWeight: 720, color: "#334155" }}
        >
          Datos de vino · opcional
        </summary>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 10,
            marginTop: 10,
          }}
        >
          <label className="hostly-carta-config-form-field">
            <span className="hostly-carta-config-form-label">Bodega / productor</span>
            <input
              className={inputClassName}
              value={wineProducer}
              maxLength={140}
              onChange={(event) => {
                setWineProducer(event.target.value);
                setSaved(false);
              }}
              placeholder="Ej. Marqués de Riscal"
              disabled={disabled || loading || saving}
            />
          </label>
          <label className="hostly-carta-config-form-field">
            <span className="hostly-carta-config-form-label">Denominación</span>
            <input
              className={inputClassName}
              value={wineAppellation}
              maxLength={140}
              onChange={(event) => {
                setWineAppellation(event.target.value);
                setSaved(false);
              }}
              placeholder="Ej. Rioja DOCa"
              disabled={disabled || loading || saving}
            />
          </label>
          <label className="hostly-carta-config-form-field">
            <span className="hostly-carta-config-form-label">Añada</span>
            <input
              className={inputClassName}
              value={wineVintage}
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => {
                setWineVintage(event.target.value.replace(/\D/g, "").slice(0, 4));
                setSaved(false);
              }}
              placeholder="Ej. 2019"
              disabled={disabled || loading || saving}
            />
          </label>
        </div>
        <p className="hostly-product-commercial-modal__hint" style={{ marginBottom: 0 }}>
          Si los completas, Hostly exigirá evidencia de bodega, denominación y añada antes de ofrecer una coincidencia por texto.
        </p>
      </details>

      <p className="hostly-product-commercial-modal__hint">
        Si existe EAN / GTIN, Hostly lo prioriza sobre el nombre al buscar una
        imagen real. En navegadores compatibles puedes escanearlo con la cámara.
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <button
          type="button"
          className="hostly-button-secondary hostly-button-compact"
          disabled={disabled || loading || saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? "Guardando…" : "Guardar identidad"}
        </button>
        {loading ? (
          <span className="hostly-product-commercial-modal__hint">
            Cargando…
          </span>
        ) : null}
        {saved ? (
          <span
            className="hostly-product-commercial-modal__hint"
            role="status"
          >
            Identidad guardada. Buscando coincidencia exacta…
          </span>
        ) : null}
        {error ? (
          <span
            className="hostly-carta-config-alert hostly-carta-config-alert--error"
            role="alert"
          >
            {error}
          </span>
        ) : null}
      </div>

      {resolvedProductId && persistedBarcode ? (
        <ProductExactCatalogImageSuggestion
          productId={resolvedProductId}
          barcode={persistedBarcode}
          disabled={disabled || loading || saving}
          refreshKey={exactImageRefreshKey}
          onAttached={onExactImageAttached}
        />
      ) : null}
    </section>
  );
}
