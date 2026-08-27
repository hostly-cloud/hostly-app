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
  type MouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import type { TranslateFn } from "@/lib/i18n";
import type { PlatoCarta } from "@/lib/carta/product-sale-contract";
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

function focusAndSelectInput(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus({ preventScroll: true });
  input.select();
}

function inlinePriceDraftMatchesStored(draft: string, storedPrice: number): boolean {
  const trimmed = draft.trim();
  if (trimmed === "") return false;
  if (trimmed === String(storedPrice)) return true;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed === storedPrice;
}

function handleInlineDisplayActivateKeyDown(
  e: KeyboardEvent,
  startEdit: () => void,
  cellKey: ProductInlineCellKey,
  ctx: ProductosTableInlineEditContextValue | null,
) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    startEdit();
    return;
  }
  handleTabNavigation(e, cellKey, ctx);
}

function useInlineDisplayEditActivation(args: {
  disabled?: boolean;
  saving: boolean;
  editing: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  prepare: () => void;
  setEditing: (value: boolean) => void;
}) {
  const openingRef = useRef(false);

  useEffect(() => {
    if (!args.editing) return;
    focusAndSelectInput(args.inputRef.current);
    openingRef.current = false;
  }, [args.editing, args.inputRef]);

  const startEdit = useCallback(() => {
    if (args.disabled || args.saving || args.editing || openingRef.current) return;
    openingRef.current = true;
    args.prepare();
    args.setEditing(true);
  }, [args.disabled, args.editing, args.prepare, args.saving, args.setEditing]);

  const handleDisplayClick = useCallback(
    (event: MouseEvent) => {
      if (event.detail > 1) return;
      startEdit();
    },
    [startEdit],
  );

  return { startEdit, handleDisplayClick };
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

  const prepareEdit = useCallback(() => {
    setDraft(p.nombre);
    setLocalError(null);
  }, [p.nombre]);

  const { startEdit, handleDisplayClick } = useInlineDisplayEditActivation({
    disabled,
    saving,
    editing,
    inputRef,
    prepare: prepareEdit,
    setEditing,
  });

  const editNameLabel = `Editar nombre, ${p.nombre}`;

  if (editing) {
    return (
      <span className={`hostly-productos-inline-cell hostly-productos-inline-cell--editing${saved ? " is-saved" : ""}`}>
        <input
          ref={inputRef}
          className={`hostly-productos-inline-cell__input ${className ?? ""}`}
          value={draft}
          disabled={saving}
          autoComplete="off"
          aria-label={editNameLabel}
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
        "hostly-productos-inline-cell__display--editable",
        className,
        saved ? "is-saved" : "",
        disabled ? "is-disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={title ?? `${p.nombre} — clic para editar`}
      aria-label={editNameLabel}
      onClick={handleDisplayClick}
      onKeyDown={(e) => {
        handleInlineDisplayActivateKeyDown(e, startEdit, cellKey, ctx);
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
    if (inlinePriceDraftMatchesStored(draft, p.precioVenta)) {
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
  }, [cancel, draft, onError, onSave, p.precioVenta, saving, triggerSaved]);

  const prepareEdit = useCallback(() => {
    setDraft(editSeed);
    setLocalError(null);
  }, [editSeed]);

  const { startEdit, handleDisplayClick } = useInlineDisplayEditActivation({
    disabled,
    saving,
    editing,
    inputRef,
    prepare: prepareEdit,
    setEditing,
  });

  const editPriceLabel = `Editar precio de ${p.nombre}, ${displayValue}`;

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
          aria-label={editPriceLabel}
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
        "hostly-productos-inline-cell__display--editable",
        "hostly-data-table-price",
        saved ? "is-saved" : "",
        disabled ? "is-disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={`${displayValue} — clic para editar`}
      aria-label={editPriceLabel}
      onClick={handleDisplayClick}
      onKeyDown={(e) => {
        handleInlineDisplayActivateKeyDown(e, startEdit, cellKey, ctx);
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
