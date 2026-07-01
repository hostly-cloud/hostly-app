"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import type { TranslateFn } from "@/lib/i18n";
import type { PlatoCarta } from "@/lib/platos-local";
import { getPublicationFlags } from "@/components/productos/productos-table-cells";
import type {
  ProductTableInlinePersistResult,
} from "@/components/productos/use-product-table-inline-persist";

export type ProductosTableInlineEditConfig = {
  enabled: boolean;
  restaurantId: string;
  isCentralCatalog: boolean;
  messages: {
    errorNombre: string;
    errorPrecio: string;
  };
  onError?: (message: string) => void;
};

const INLINE_SUCCESS_MS = 800;

export type ProductInlineEditField = "nombre" | "precio" | "activo";

export type ProductInlineCellKey = `${string}:${ProductInlineEditField}`;

function buildCellKey(productId: string, field: ProductInlineEditField): ProductInlineCellKey {
  return `${productId}:${field}`;
}

function useInlineSuccessFlash() {
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<number | null>(null);

  const triggerSaved = useCallback(() => {
    setSaved(true);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setSaved(false);
      timerRef.current = null;
    }, INLINE_SUCCESS_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return { saved, triggerSaved };
}

type ProductosTableInlineEditContextValue = {
  registerTabStop: (key: ProductInlineCellKey, el: HTMLElement | null) => void;
  focusAdjacentTabStop: (key: ProductInlineCellKey, direction: 1 | -1) => void;
};

const ProductosTableInlineEditContext =
  createContext<ProductosTableInlineEditContextValue | null>(null);

function useProductosTableInlineEditContext() {
  return useContext(ProductosTableInlineEditContext);
}

export function ProductosTableInlineEditProvider({
  productIds,
  children,
}: {
  productIds: readonly string[];
  children: ReactNode;
}) {
  const tabStopRefs = useRef(new Map<ProductInlineCellKey, HTMLElement>());
  const orderedKeys = useMemo(() => {
    const keys: ProductInlineCellKey[] = [];
    for (const productId of productIds) {
      keys.push(buildCellKey(productId, "nombre"));
      keys.push(buildCellKey(productId, "precio"));
      keys.push(buildCellKey(productId, "activo"));
    }
    return keys;
  }, [productIds]);

  const registerTabStop = useCallback(
    (key: ProductInlineCellKey, el: HTMLElement | null) => {
      if (el) {
        tabStopRefs.current.set(key, el);
      } else {
        tabStopRefs.current.delete(key);
      }
    },
    [],
  );

  const focusAdjacentTabStop = useCallback(
    (key: ProductInlineCellKey, direction: 1 | -1) => {
      const index = orderedKeys.indexOf(key);
      if (index < 0) return;
      const nextKey = orderedKeys[index + direction];
      if (!nextKey) return;
      tabStopRefs.current.get(nextKey)?.focus();
    },
    [orderedKeys],
  );

  const value = useMemo(
    () => ({ registerTabStop, focusAdjacentTabStop }),
    [registerTabStop, focusAdjacentTabStop],
  );

  return (
    <ProductosTableInlineEditContext.Provider value={value}>
      {children}
    </ProductosTableInlineEditContext.Provider>
  );
}

function InlineSavedMark({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="hostly-productos-inline-cell__saved" aria-hidden>
      ✓
    </span>
  );
}

function useRegisterTabStop(cellKey: ProductInlineCellKey) {
  const ctx = useProductosTableInlineEditContext();
  const ref = useCallback(
    (el: HTMLElement | null) => {
      ctx?.registerTabStop(cellKey, el);
    },
    [ctx, cellKey],
  );
  return ref;
}

function handleTabNavigation(
  e: KeyboardEvent,
  cellKey: ProductInlineCellKey,
  ctx: ProductosTableInlineEditContextValue | null,
) {
  if (e.key !== "Tab" || !ctx) return false;
  e.preventDefault();
  ctx.focusAdjacentTabStop(cellKey, e.shiftKey ? -1 : 1);
  return true;
}

export function ProductosInlineEditableName({
  p,
  disabled,
  className,
  title,
  onSave,
  onError,
}: {
  p: PlatoCarta;
  disabled?: boolean;
  className?: string;
  title?: string;
  onSave: (raw: string) => Promise<ProductTableInlinePersistResult>;
  onError?: (message: string) => void;
}) {
  const cellKey = buildCellKey(p.id, "nombre");
  const ctx = useProductosTableInlineEditContext();
  const tabRef = useRegisterTabStop(cellKey);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelOnBlurRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.nombre);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { saved, triggerSaved } = useInlineSuccessFlash();

  useEffect(() => {
    if (!editing) setDraft(p.nombre);
  }, [p.nombre, editing]);

  const cancel = useCallback(() => {
    setDraft(p.nombre);
    setLocalError(null);
    setEditing(false);
  }, [p.nombre]);

  const commit = useCallback(async () => {
    if (saving) return;
    if (draft.trim() === p.nombre.trim()) {
      cancel();
      return;
    }
    setSaving(true);
    setLocalError(null);
    const result = await onSave(draft);
    setSaving(false);
    if (!result.ok) {
      setLocalError(result.error);
      onError?.(result.error);
      return;
    }
    setEditing(false);
    triggerSaved();
  }, [cancel, draft, onError, onSave, p.nombre, saving, triggerSaved]);

  const startEdit = useCallback(() => {
    if (disabled || saving) return;
    setDraft(p.nombre);
    setLocalError(null);
    setEditing(true);
    window.requestAnimationFrame(() => inputRef.current?.select());
  }, [disabled, p.nombre, saving]);

  if (editing) {
    return (
      <span className={`hostly-productos-inline-cell hostly-productos-inline-cell--editing${saved ? " is-saved" : ""}`}>
        <input
          ref={inputRef}
          className={`hostly-productos-inline-cell__input ${className ?? ""}`}
          value={draft}
          disabled={saving}
          autoComplete="off"
          aria-label={title ?? p.nombre}
          onChange={(e) => {
            setDraft(e.target.value);
            setLocalError(null);
          }}
          onBlur={() => {
            if (cancelOnBlurRef.current) {
              cancelOnBlurRef.current = false;
              return;
            }
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelOnBlurRef.current = true;
              cancel();
              return;
            }
            if (e.key === "Tab") {
              e.preventDefault();
              void commit().then(() => {
                handleTabNavigation(e, cellKey, ctx);
              });
            }
          }}
        />
        {localError ? (
          <span className="hostly-productos-inline-cell__error" role="alert">
            {localError}
          </span>
        ) : null}
        <InlineSavedMark visible={saved} />
      </span>
    );
  }

  return (
    <span
      ref={tabRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={[
        "hostly-productos-inline-cell__display",
        "hostly-productos-inline-cell__display--name",
        className,
        saved ? "is-saved" : "",
        disabled ? "is-disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={title ?? `${p.nombre} — doble clic para editar`}
      onDoubleClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          startEdit();
          return;
        }
        handleTabNavigation(e, cellKey, ctx);
      }}
    >
      {p.nombre}
      <InlineSavedMark visible={saved} />
    </span>
  );
}

export function ProductosInlineEditablePrice({
  p,
  disabled,
  displayValue,
  onSave,
  onError,
}: {
  p: PlatoCarta;
  disabled?: boolean;
  displayValue: string;
  onSave: (raw: string) => Promise<ProductTableInlinePersistResult>;
  onError?: (message: string) => void;
}) {
  const cellKey = buildCellKey(p.id, "precio");
  const ctx = useProductosTableInlineEditContext();
  const tabRef = useRegisterTabStop(cellKey);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelOnBlurRef = useRef(false);
  const editSeed = String(p.precioVenta);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editSeed);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { saved, triggerSaved } = useInlineSuccessFlash();

  useEffect(() => {
    if (!editing) setDraft(editSeed);
  }, [editSeed, editing]);

  const cancel = useCallback(() => {
    setDraft(editSeed);
    setLocalError(null);
    setEditing(false);
  }, [editSeed]);

  const commit = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setLocalError(null);
    const result = await onSave(draft);
    setSaving(false);
    if (!result.ok) {
      setLocalError(result.error);
      onError?.(result.error);
      return;
    }
    setEditing(false);
    triggerSaved();
  }, [draft, onError, onSave, saving, triggerSaved]);

  const startEdit = useCallback(() => {
    if (disabled || saving) return;
    setDraft(editSeed);
    setLocalError(null);
    setEditing(true);
    window.requestAnimationFrame(() => inputRef.current?.select());
  }, [disabled, editSeed, saving]);

  if (editing) {
    return (
      <span className={`hostly-productos-inline-cell hostly-productos-inline-cell--editing hostly-productos-inline-cell--price${saved ? " is-saved" : ""}`}>
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          className="hostly-productos-inline-cell__input hostly-productos-inline-cell__input--price tabular-nums"
          value={draft}
          disabled={saving}
          aria-label={`Precio de ${p.nombre}`}
          onChange={(e) => {
            setDraft(e.target.value);
            setLocalError(null);
          }}
          onBlur={() => {
            if (cancelOnBlurRef.current) {
              cancelOnBlurRef.current = false;
              return;
            }
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelOnBlurRef.current = true;
              cancel();
              return;
            }
            if (e.key === "Tab") {
              e.preventDefault();
              void commit().then(() => {
                handleTabNavigation(e, cellKey, ctx);
              });
            }
          }}
        />
        {localError ? (
          <span className="hostly-productos-inline-cell__error" role="alert">
            {localError}
          </span>
        ) : null}
        <InlineSavedMark visible={saved} />
      </span>
    );
  }

  return (
    <span
      ref={tabRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={[
        "hostly-productos-inline-cell__display",
        "hostly-productos-inline-cell__display--price",
        "hostly-data-table-price",
        saved ? "is-saved" : "",
        disabled ? "is-disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={`${displayValue} — doble clic para editar`}
      onDoubleClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          startEdit();
          return;
        }
        handleTabNavigation(e, cellKey, ctx);
      }}
    >
      {displayValue}
      <InlineSavedMark visible={saved} />
    </span>
  );
}

export function ProductosInlineActiveToggle({
  p,
  disabled,
  t,
  onToggle,
  onError,
}: {
  p: PlatoCarta;
  disabled?: boolean;
  t: TranslateFn;
  onToggle: () => Promise<ProductTableInlinePersistResult>;
  onError?: (message: string) => void;
}) {
  const cellKey = buildCellKey(p.id, "activo");
  const ctx = useProductosTableInlineEditContext();
  const tabRef = useRegisterTabStop(cellKey);
  const { isActive } = getPublicationFlags(p);
  const [busy, setBusy] = useState(false);
  const { saved, triggerSaved } = useInlineSuccessFlash();

  const handleToggle = useCallback(async () => {
    if (disabled || busy) return;
    setBusy(true);
    const result = await onToggle();
    setBusy(false);
    if (!result.ok) {
      onError?.(result.error);
      return;
    }
    triggerSaved();
  }, [busy, disabled, onError, onToggle, triggerSaved]);

  const label = isActive ? t("carta.estadoActivo") : t("carta.estadoInactivo");

  return (
    <button
      ref={tabRef as Ref<HTMLButtonElement>}
      type="button"
      tabIndex={disabled ? -1 : 0}
      disabled={disabled || busy}
      aria-pressed={isActive}
      aria-label={label}
      title={label}
      className={[
        "hostly-productos-inline-active",
        isActive ? "is-active" : "is-inactive",
        saved ? "is-saved" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => void handleToggle()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void handleToggle();
          return;
        }
        handleTabNavigation(e, cellKey, ctx);
      }}
    >
      {saved ? "✓" : label}
    </button>
  );
}
