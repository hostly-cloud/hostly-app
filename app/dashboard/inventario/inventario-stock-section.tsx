"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { capabilityDeniedTitle } from "@/components/auth/capability-guard";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import {
  disableProductInventory,
  listenLatestStockMovements,
  listenProductsForInventory,
  upsertProductInventory,
  type ProductDocument,
  type StockMovementListItem,
} from "@/lib/firestore/products";
import {
  centralStockMovementSourceLabel,
  listenCentralStockMovementsForProduct,
  type CentralStockMovementListItem,
} from "@/lib/firestore/stock-movements";
import { mockInventarioProductos } from "@/lib/inventario-productos";
import { productTimelineHref } from "@/lib/inventory/product-timeline";
import { OperationStationProductSelect } from "@/components/operacion/operation-station-product-select";
import {
  ensureDefaultOperationStations,
  listenOperationStations,
} from "@/lib/firestore/operation-stations";
import {
  isNoneOperationStationSelectValue,
  operationStationSelectValueFromProduct,
  resolveOperationStationFromSelectValue,
  resolveProductOperationStationLabel,
} from "@/lib/operacion/product-operation-station";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import { fetchCartaCategorias } from "@/lib/carta-categorias/api-client";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import {
  buildProductFamilyPatchFromCategoryId,
  getProductFamilyLabel,
} from "@/lib/carta/product-category-family-resolver";
import type { ProductFamilyType } from "@/lib/carta/product-family-types";
import {
  PRODUCT_FAMILY_LIST_FILTER_OPTIONS,
  matchesProductFamilyListFilter,
  type ProductFamilyListFilter,
} from "@/lib/carta/product-family-list-filter";
import {
  PRODUCT_KIND_LIST_FILTER_OPTIONS,
  PRODUCT_KIND_OPTIONS,
  matchesProductKindListFilter,
  productKindToSelectValue,
  type ProductKind,
  type ProductKindListFilter,
} from "@/lib/carta/product-kind-options";
import {
  formatStockStatusLabel,
  matchesStockLevelListFilter,
  resolveStockStatus,
  STOCK_LEVEL_LIST_FILTER_OPTIONS,
  stockStatusBadgeClassName,
  type StockLevelListFilter,
} from "@/lib/inventory/stock-status";
import {
  calculateInventoryUnitCost,
  formatPurchaseCostEquation,
  getInventoryUnitCostLabel,
  normalizePurchaseCostInput,
  PURCHASE_UNIT_OPTIONS,
  type PurchaseUnit,
} from "@/lib/inventory/inventory-cost";
import { planInventoryUnitChange } from "@/lib/inventory/inventory-unit-change";

type Unidad = "kg" | "g" | "l" | "ml" | "ud";

type ProductoRow = {
  id: string | number;
  nombre: string | null;
  categoryId: string | null;
  categoryName: string | null;
  station: string | null;
  operationStationId: string | null;
  operationStationName: string | null;
  productKind: ProductKind | null;
  productFamilyId: string | null;
  productFamilyName: string | null;
  productFamilyType: ProductFamilyType | null;
  active: boolean;
  unidad: Unidad | string | null;
  stock_actual: number | null;
  coste_unitario: number | null;
  purchase_cost: number | null;
  purchase_quantity: number | null;
  purchase_unit: PurchaseUnit | null;
  unit_cost: number | null;
  unit_cost_unit: string | null;
  stock_minimo: number | null;
  supplierName: string | null;
  image: string | null;
};

type DraftById = Record<
  string,
  {
    nombre: string;
    categoryId: string;
    station: string;
    productKind: ProductKind;
    active: boolean;
    unidad: string;
    stock_actual: string;
    coste_unitario: string;
    purchase_cost: string;
    purchase_quantity: string;
    purchase_unit: PurchaseUnit | "";
    stock_minimo: string;
    supplierName: string;
  }
>;

const UNIDADES: Unidad[] = ["kg", "g", "l", "ml", "ud"];

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function formatMovementDelta(delta: number): string {
  if (!Number.isFinite(delta)) return "0";
  const r = roundTo(delta, 3);
  if (r === 0) return "0";
  return r > 0 ? `+${r}` : String(r);
}

function stockMovementKindLabel(m: StockMovementListItem): string {
  if (m.type === "receipt" || m.source === "inventory_receipt") return "Recepción";
  return "Ajuste manual";
}

function centralMovementContextLabel(m: CentralStockMovementListItem): string | null {
  const parts: string[] = [];
  if (m.saleProductName) parts.push(`por ${m.saleProductName}`);
  if (m.modifierOptionName) parts.push(m.modifierOptionName);
  return parts.length ? parts.join(" · ") : null;
}

function centralMovementStockRange(m: CentralStockMovementListItem): string | null {
  if (m.stockBefore == null && m.stockAfter == null) return null;
  const before =
    m.stockBefore != null ? `${roundTo(m.stockBefore, 3)} ${m.unit}` : "—";
  const after =
    m.stockAfter != null ? `${roundTo(m.stockAfter, 3)} ${m.unit}` : "—";
  return `${before} → ${after}`;
}

function stockStatusInputFromRow(
  row: Pick<ProductoRow, "stock_actual" | "stock_minimo">,
) {
  return {
    currentStock: row.stock_actual,
    minStock: row.stock_minimo,
  };
}

function formatMoney2(value: number | null | undefined): string {
  if (value == null) return "-";
  if (!Number.isFinite(value)) return "-";
  return roundTo(value, 2).toFixed(2);
}

function parseNumber(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const normalized = trimmed.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

type InventoryDraftFields = DraftById[string];

const INVENTORY_UNSAVED_CONFIRM_MESSAGE =
  "Tienes cambios sin guardar en este ingrediente. Si continúas, se perderán.";

function defaultPurchaseUnitForInventoryUnit(
  unidad: string | null | undefined,
): PurchaseUnit | "" {
  const u = String(unidad ?? "")
    .trim()
    .toLowerCase();
  if (u === "ud") return "unit";
  if (u === "ml" || u === "cl" || u === "l") return u;
  if (u === "g" || u === "kg") return u;
  return "";
}

function draftFromRow(row: ProductoRow): InventoryDraftFields {
  return {
    nombre: row.nombre ?? "",
    categoryId: row.categoryId ?? "",
    station: operationStationSelectValueFromProduct({
      operationStationId: row.operationStationId,
      operationStationName: row.operationStationName,
      station: row.station,
      preparationArea: row.station,
    }),
    productKind: productKindToSelectValue(row.productKind),
    active: row.active,
    unidad: row.unidad ?? "kg",
    stock_actual:
      row.stock_actual == null ? "" : String(roundTo(row.stock_actual, 3)),
    coste_unitario:
      row.coste_unitario == null ? "" : String(roundTo(row.coste_unitario, 2)),
    purchase_cost:
      row.purchase_cost == null ? "" : String(roundTo(row.purchase_cost, 2)),
    purchase_quantity:
      row.purchase_quantity == null
        ? ""
        : String(roundTo(row.purchase_quantity, 3)),
    purchase_unit: row.purchase_unit ?? defaultPurchaseUnitForInventoryUnit(row.unidad),
    stock_minimo:
      row.stock_minimo == null ? "" : String(roundTo(row.stock_minimo, 3)),
    supplierName: row.supplierName ?? "",
  };
}

function draftsEqual(a: InventoryDraftFields, b: InventoryDraftFields): boolean {
  return (
    a.nombre === b.nombre &&
    a.categoryId === b.categoryId &&
    a.station === b.station &&
    a.productKind === b.productKind &&
    a.active === b.active &&
    a.unidad === b.unidad &&
    a.stock_actual === b.stock_actual &&
    a.coste_unitario === b.coste_unitario &&
    a.purchase_cost === b.purchase_cost &&
    a.purchase_quantity === b.purchase_quantity &&
    a.purchase_unit === b.purchase_unit &&
    a.stock_minimo === b.stock_minimo &&
    a.supplierName === b.supplierName
  );
}

function isInventoryDraftDirty(
  row: ProductoRow,
  draft: InventoryDraftFields,
): boolean {
  return !draftsEqual(draft, draftFromRow(row));
}

function draftFromRows(rows: ProductoRow[]): DraftById {
  const next: DraftById = {};
  for (const r of rows) {
    next[String(r.id)] = draftFromRow(r);
  }
  return next;
}

function mergeDraftsPreservingDirty(
  prev: DraftById,
  rows: ProductoRow[],
): DraftById {
  const next = draftFromRows(rows);
  for (const r of rows) {
    const key = String(r.id);
    const prior = prev[key];
    if (prior && isInventoryDraftDirty(r, prior)) {
      next[key] = prior;
    }
  }
  return next;
}

function inventoryLegacyCategoryLabel(
  row: Pick<ProductoRow, "categoryId" | "categoryName">,
  categories: readonly CartaCategoria[],
): string | null {
  const id = row.categoryId?.trim() ?? "";
  if (id && categories.some((c) => c.id === id)) return null;
  const name = row.categoryName?.trim();
  return name || null;
}

function mapProductDocumentToRow(item: ProductDocument): ProductoRow {
  return {
    id: item.id,
    nombre: item.name,
    categoryId: item.categoryId,
    categoryName: item.categoryName ?? null,
    station: item.station ?? item.preparationArea ?? null,
    operationStationId: item.operationStationId ?? null,
    operationStationName: item.operationStationName ?? null,
    productKind: item.productKind ?? null,
    productFamilyId: item.productFamilyId ?? null,
    productFamilyName: item.productFamilyName ?? null,
    productFamilyType: item.productFamilyType ?? null,
    active: item.active,
    unidad: item.inventory.unit,
    stock_actual: item.inventory.currentStock,
    coste_unitario: item.inventory.costPerUnit,
    purchase_cost: item.inventory.purchaseCost ?? null,
    purchase_quantity: item.inventory.purchaseQuantity ?? null,
    purchase_unit: item.inventory.purchaseUnit ?? null,
    unit_cost: item.inventory.unitCost ?? null,
    unit_cost_unit: item.inventory.unitCostUnit ?? null,
    stock_minimo: item.inventory.minStock ?? null,
    supplierName: item.inventory.supplierName ?? null,
    image: item.inventory.image ?? null,
  };
}

type StockFilterOption<T extends string> = {
  id: T;
  label: string;
};

type InventoryStockFilterGroupConfig =
  | {
      groupKey: "kind";
      label: "Tipo";
      ariaLabel: "Filtrar por tipo de inventario";
      value: ProductKindListFilter;
      onChange: (value: ProductKindListFilter) => void;
      options: typeof PRODUCT_KIND_LIST_FILTER_OPTIONS;
    }
  | {
      groupKey: "family";
      label: "Familia";
      ariaLabel: "Filtrar por familia de producto";
      value: ProductFamilyListFilter;
      onChange: (value: ProductFamilyListFilter) => void;
      options: typeof PRODUCT_FAMILY_LIST_FILTER_OPTIONS;
    }
  | {
      groupKey: "stock";
      label: "Stock";
      ariaLabel: "Filtrar por nivel de stock";
      value: StockLevelListFilter;
      onChange: (value: StockLevelListFilter) => void;
      options: typeof STOCK_LEVEL_LIST_FILTER_OPTIONS;
    };

function StockFilterGroup<T extends string>({
  groupKey,
  label,
  ariaLabel,
  value,
  onChange,
  options,
}: {
  groupKey: InventoryStockFilterGroupConfig["groupKey"];
  label: string;
  ariaLabel: string;
  value: T;
  onChange: (next: T) => void;
  options: readonly StockFilterOption<T>[];
}) {
  return (
    <div className="hostly-stock-filter-group" role="group" aria-label={ariaLabel}>
      <span className="hostly-stock-filter-label">{label}</span>
      <div className="hostly-stock-filter-chips">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={`${groupKey}-${String(opt.id)}`}
              type="button"
              className={`hostly-stock-filter-chip${active ? " is-active" : ""}`}
              aria-pressed={active}
              onClick={() => onChange(opt.id)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function renderInventoryStockFilterGroup(group: InventoryStockFilterGroupConfig) {
  switch (group.groupKey) {
    case "kind":
      return (
        <StockFilterGroup<ProductKindListFilter>
          key={group.groupKey}
          groupKey={group.groupKey}
          label={group.label}
          ariaLabel={group.ariaLabel}
          value={group.value}
          onChange={group.onChange}
          options={group.options}
        />
      );
    case "family":
      return (
        <StockFilterGroup<ProductFamilyListFilter>
          key={group.groupKey}
          groupKey={group.groupKey}
          label={group.label}
          ariaLabel={group.ariaLabel}
          value={group.value}
          onChange={group.onChange}
          options={group.options}
        />
      );
    case "stock":
      return (
        <StockFilterGroup<StockLevelListFilter>
          key={group.groupKey}
          groupKey={group.groupKey}
          label={group.label}
          ariaLabel={group.ariaLabel}
          value={group.value}
          onChange={group.onChange}
          options={group.options}
        />
      );
  }
}

export default function InventarioStockSection() {
  const { t } = useI18n();
  const { restaurantId, ready, profileReady } = useAuth();
  const { can } = useHostlyCapabilities();
  const canEditInventory = can("inventory.edit");
  const [items, setItems] = useState<ProductoRow[]>([]);
  const [drafts, setDrafts] = useState<DraftById>({});
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [deletingById, setDeletingById] = useState<Record<string, boolean>>({});
  const [reloadNonce, setReloadNonce] = useState(0);
  const [search, setSearch] = useState("");
  const [productKindFilter, setProductKindFilter] =
    useState<ProductKindListFilter>("all");
  const [productFamilyFilter, setProductFamilyFilter] =
    useState<ProductFamilyListFilter>("all");
  const [stockLevelFilter, setStockLevelFilter] =
    useState<StockLevelListFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [operationStations, setOperationStations] = useState<
    OperationStationDocument[]
  >([]);
  const [cartaCategorias, setCartaCategorias] = useState<CartaCategoria[]>([]);
  const [saveFeedbackById, setSaveFeedbackById] = useState<
    Record<string, "saved" | "error">
  >({});
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  /** Tras crear producto, priorizar su selección cuando llegue el snapshot. */
  const preferSelectIdRef = useRef<string | null>(null);
  const [centralStockMovements, setCentralStockMovements] = useState<
    CentralStockMovementListItem[]
  >([]);
  const [legacyStockMovements, setLegacyStockMovements] = useState<
    StockMovementListItem[]
  >([]);

  const movementDateFmt = useMemo(
    () => new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" }),
    [],
  );

  useEffect(() => {
    if (!ready || !profileReady) {
      setLoading(true);
      return;
    }
    const rid = restaurantId?.trim() ?? "";
    if (!rid) {
      setItems([]);
      setDrafts({});
      setUsingMock(false);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setUsingMock(false);

    return listenProductsForInventory(
      rid,
      (rows) => {
        const mapped = rows.map(mapProductDocumentToRow);
        setItems(mapped);
        setDrafts((prev) => mergeDraftsPreservingDirty(prev, mapped));
        setLoading(false);
      },
      (e) => {
        const rows = mockInventarioProductos() as ProductoRow[];
        setItems(rows);
        setDrafts(draftFromRows(rows));
        setUsingMock(true);
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
  }, [profileReady, ready, reloadNonce, restaurantId]);

  useEffect(() => {
    const rid = restaurantId?.trim() ?? "";
    if (!rid || !ready || !profileReady || usingMock) {
      setOperationStations([]);
      return;
    }
    let defaultsEnsured = false;
    const unsub = listenOperationStations(
      rid,
      (list) => {
        setOperationStations(list);
        if (!defaultsEnsured && list.length === 0) {
          defaultsEnsured = true;
          void ensureDefaultOperationStations(rid).catch((e) =>
            console.error("ensureDefaultOperationStations", e),
          );
        }
      },
      (e) => console.error("listenOperationStations", e),
    );
    return () => unsub();
  }, [profileReady, ready, usingMock, restaurantId]);

  useEffect(() => {
    const rid = restaurantId?.trim() ?? "";
    if (!rid || !ready || !profileReady || usingMock) {
      setCartaCategorias([]);
      return;
    }
    void fetchCartaCategorias(rid)
      .then(setCartaCategorias)
      .catch(() => setCartaCategorias([]));
  }, [profileReady, ready, usingMock, restaurantId]);

  useEffect(() => {
    if (!ready || !profileReady || usingMock) {
      setLegacyStockMovements([]);
      return;
    }
    const rid = restaurantId?.trim() ?? "";
    const pid = selectedId?.trim() ?? "";
    if (!rid || !pid) {
      setLegacyStockMovements([]);
      return;
    }
    return listenLatestStockMovements(rid, pid, setLegacyStockMovements, { limit: 10 });
  }, [profileReady, ready, usingMock, restaurantId, selectedId]);

  useEffect(() => {
    if (!ready || !profileReady || usingMock) {
      setCentralStockMovements([]);
      return;
    }
    const rid = restaurantId?.trim() ?? "";
    const pid = selectedId?.trim() ?? "";
    if (!rid || !pid) {
      setCentralStockMovements([]);
      return;
    }
    return listenCentralStockMovementsForProduct(rid, pid, setCentralStockMovements, {
      limit: 50,
    });
  }, [profileReady, ready, usingMock, restaurantId, selectedId]);

  useEffect(() => {
    const prefer = preferSelectIdRef.current;
    if (prefer) {
      if (items.some((item) => String(item.id) === prefer)) {
        setSelectedId(prefer);
        preferSelectIdRef.current = null;
      }
      return;
    }
    setSelectedId((prev) => {
      if (prev && items.some((item) => String(item.id) === prev)) return prev;
      return items[0] ? String(items[0].id) : null;
    });
  }, [items]);

  function cargar() {
    setReloadNonce((n) => n + 1);
  }

  const isDraftDirtyForKey = useCallback(
    (key: string) => {
      const row = items.find((item) => String(item.id) === key);
      const draft = drafts[key];
      if (!row || !draft) return false;
      return isInventoryDraftDirty(row, draft);
    },
    [drafts, items],
  );

  const confirmDiscardUnsaved = useCallback(
    (key: string) => {
      if (!isDraftDirtyForKey(key)) return true;
      return window.confirm(INVENTORY_UNSAVED_CONFIRM_MESSAGE);
    },
    [isDraftDirtyForKey],
  );

  const trySelectProduct = useCallback(
    (key: string) => {
      if (selectedId && selectedId !== key && !confirmDiscardUnsaved(selectedId)) {
        return;
      }
      setSelectedId(key);
      setMobilePanelOpen(true);
    },
    [confirmDiscardUnsaved, selectedId],
  );

  const tryCloseInspector = useCallback(() => {
    if (selectedId && !confirmDiscardUnsaved(selectedId)) return;
    setMobilePanelOpen(false);
  }, [confirmDiscardUnsaved, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const key = selectedId;
    if (saveFeedbackById[key] !== "saved") return;
    if (isDraftDirtyForKey(key)) {
      setSaveFeedbackById((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [drafts, isDraftDirtyForKey, saveFeedbackById, selectedId]);

  useEffect(() => {
    const timers: number[] = [];
    for (const [key, state] of Object.entries(saveFeedbackById)) {
      if (state !== "saved") continue;
      timers.push(
        window.setTimeout(() => {
          setSaveFeedbackById((prev) => {
            if (prev[key] !== "saved") return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }, 2800),
      );
    }
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [saveFeedbackById]);

  function updateDraft(id: string | number, patch: Partial<DraftById[string]>) {
    const key = String(id);
    setSaveFeedbackById((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        nombre: prev[key]?.nombre ?? "",
        categoryId: prev[key]?.categoryId ?? "",
        station: prev[key]?.station ?? "",
        productKind: prev[key]?.productKind ?? "other",
        active: prev[key]?.active ?? true,
        unidad: prev[key]?.unidad ?? "kg",
        stock_actual: prev[key]?.stock_actual ?? "",
        coste_unitario: prev[key]?.coste_unitario ?? "",
        purchase_cost: prev[key]?.purchase_cost ?? "",
        purchase_quantity: prev[key]?.purchase_quantity ?? "",
        purchase_unit: prev[key]?.purchase_unit ?? "",
        stock_minimo: prev[key]?.stock_minimo ?? "",
        supplierName: prev[key]?.supplierName ?? "",
        ...patch,
      },
    }));
  }

  function changeDraftUnit(
    id: string | number,
    draft: InventoryDraftFields,
    nextUnit: string,
  ) {
    const plan = planInventoryUnitChange({
      fromUnit: draft.unidad,
      toUnit: nextUnit,
      currentStock: parseNumber(draft.stock_actual, 0),
      minStock: parseNumber(draft.stock_minimo, 0),
      costPerUnit: parseNumber(draft.coste_unitario, 0),
    });
    if (!plan.ok) {
      setError(plan.error);
      return;
    }
    setError(null);
    updateDraft(id, {
      unidad: nextUnit,
      stock_actual: String(plan.currentStock),
      stock_minimo: String(plan.minStock),
      coste_unitario: String(plan.costPerUnit),
    });
  }

  async function addProducto() {
    const rid = restaurantId?.trim() ?? "";
    setError(null);

    try {
      if (usingMock) {
        throw new Error("El servicio de inventario no está disponible: creación desactivada en modo de demostración");
      }
      if (!rid) {
        throw new Error("No hay restaurante activo para crear inventario");
      }
      const newId = await upsertProductInventory(rid, null, {
        name: "Nuevo ingrediente",
        categoryId: null,
        station: null,
        productKind: "other",
        active: true,
        price: 0,
        type: "inventory",
        unit: "ud",
        currentStock: 0,
        minStock: 0,
        costPerUnit: 0,
      });
      preferSelectIdRef.current = newId;
      setSelectedId(newId);
      setMobilePanelOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("inventory.errorSave"));
    }
  }

  async function guardarFila(id: string | number) {
    const key = String(id);
    const rid = restaurantId?.trim() ?? "";
    setError(null);
    setSaveFeedbackById((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSavingById((prev) => ({ ...prev, [key]: true }));

    try {
      if (usingMock) {
        throw new Error("El servicio de inventario no está disponible: edición desactivada en modo de demostración");
      }
      if (!rid) {
        throw new Error("No hay restaurante activo para guardar inventario");
      }
      const draft = drafts[key] ?? {
        nombre: "",
        categoryId: "",
        station: "",
        productKind: "other",
        active: true,
        unidad: "kg",
        stock_actual: "",
        coste_unitario: "",
        purchase_cost: "",
        purchase_quantity: "",
        purchase_unit: "",
        stock_minimo: "",
        supplierName: "",
      };
      const purchaseNormalized = normalizePurchaseCostInput({
        purchaseCost: draft.purchase_cost,
        purchaseQuantity: draft.purchase_quantity,
        purchaseUnit: draft.purchase_unit || undefined,
      });
      const calculatedUnitCost = purchaseNormalized
        ? calculateInventoryUnitCost(purchaseNormalized)
        : null;
      const payload = {
        nombre: draft.nombre.trim() || null,
        categoryId: draft.categoryId.trim() || null,
        station: draft.station.trim() || "none",
        active: draft.active,
        unidad: (draft.unidad || "kg").trim(),
        stock_actual: parseNumber(draft.stock_actual, 0),
        coste_unitario: parseNumber(draft.coste_unitario, 0),
        stock_minimo: parseNumber(draft.stock_minimo, 0),
        supplierName: draft.supplierName.trim() || undefined,
      };

      const resolvedStation = resolveOperationStationFromSelectValue(
        draft.station,
        operationStations,
      );
      const selectedCat = payload.categoryId
        ? cartaCategorias.find((c) => c.id === payload.categoryId)
        : undefined;
      const familyPatch = selectedCat
        ? buildProductFamilyPatchFromCategoryId(selectedCat.id, cartaCategorias)
        : null;
      const familyWrite =
        familyPatch?.clearProductFamily
          ? {
              productFamilyId: null as string | null,
              productFamilyName: null as string | null,
              productFamilyType: null,
            }
          : familyPatch?.productFamilyId
            ? {
                productFamilyId: familyPatch.productFamilyId,
                productFamilyName: familyPatch.productFamilyName ?? null,
                productFamilyType: familyPatch.productFamilyType ?? null,
              }
            : {};
      await upsertProductInventory(rid, key, {
        name: payload.nombre,
        categoryId: selectedCat ? selectedCat.id : payload.categoryId,
        ...(selectedCat ? { categoryName: selectedCat.name } : {}),
        ...(selectedCat ? familyWrite : {}),
        ...(resolvedStation
          ? {
              operationStationId: resolvedStation.id,
              operationStationName: resolvedStation.name,
              operationStationType: resolvedStation.type,
            }
          : isNoneOperationStationSelectValue(draft.station)
            ? {
                operationStationId: null,
                operationStationName: null,
                operationStationType: null,
                station: "none",
              }
            : { station: payload.station }),
        productKind: draft.productKind,
        active: payload.active,
        unit: payload.unidad,
        currentStock: payload.stock_actual,
        minStock: payload.stock_minimo,
        costPerUnit: payload.coste_unitario,
        ...(purchaseNormalized
          ? {
              purchaseCost: purchaseNormalized.purchaseCost,
              purchaseQuantity: purchaseNormalized.purchaseQuantity,
              purchaseUnit: purchaseNormalized.purchaseUnit,
            }
          : {}),
        ...(calculatedUnitCost
          ? {
              unitCost: calculatedUnitCost.unitCost,
              unitCostUnit: calculatedUnitCost.unitCostUnit,
            }
          : {}),
        supplierName: payload.supplierName,
      });
      setSaveFeedbackById((prev) => ({ ...prev, [key]: "saved" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("inventory.errorSave"));
      setSaveFeedbackById((prev) => ({ ...prev, [key]: "error" }));
    } finally {
      setSavingById((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function eliminarFila(id: string | number) {
    const key = String(id);
    const rid = restaurantId?.trim() ?? "";
    setError(null);
    setDeletingById((prev) => ({ ...prev, [key]: true }));

    try {
      if (usingMock) {
        throw new Error("El servicio de inventario no está disponible: borrado desactivado en modo de demostración");
      }
      if (!rid) {
        throw new Error("No hay restaurante activo para borrar inventario");
      }
      await disableProductInventory(rid, key);
      setItems((prev) => prev.filter((r) => String(r.id) !== key));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("inventory.errorDelete"));
    } finally {
      setDeletingById((prev) => ({ ...prev, [key]: false }));
    }
  }

  const rowsForRender = useMemo(() => items, [items]);
  const filteredRows = useMemo(() => {
    let rows = rowsForRender;
    if (productKindFilter !== "all") {
      rows = rows.filter((item) =>
        matchesProductKindListFilter(item.productKind, productKindFilter),
      );
    }
    if (productFamilyFilter !== "all") {
      rows = rows.filter((item) =>
        matchesProductFamilyListFilter(item, productFamilyFilter),
      );
    }
    if (stockLevelFilter !== "all") {
      rows = rows.filter((item) =>
        matchesStockLevelListFilter(stockStatusInputFromRow(item), stockLevelFilter),
      );
    }
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) =>
      [item.nombre, item.unidad, item.station, item.supplierName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rowsForRender, search, productKindFilter, productFamilyFilter, stockLevelFilter]);

  const listCountLabel = useMemo(() => {
    const total = rowsForRender.length;
    const shown = filteredRows.length;
    const filtered =
      productKindFilter !== "all" ||
      productFamilyFilter !== "all" ||
      stockLevelFilter !== "all" ||
      search.trim().length > 0;
    if (!filtered) return `${total} ingredientes de stock`;
    return `${shown} de ${total} ingredientes`;
  }, [
    rowsForRender.length,
    filteredRows.length,
    productKindFilter,
    productFamilyFilter,
    stockLevelFilter,
    search,
  ]);
  const showExtendedListFilters = rowsForRender.length >= 20;
  const inventoryFilterGroups = useMemo((): InventoryStockFilterGroupConfig[] => {
    const stockGroup: InventoryStockFilterGroupConfig = {
      groupKey: "stock",
      label: "Stock",
      ariaLabel: "Filtrar por nivel de stock",
      value: stockLevelFilter,
      onChange: setStockLevelFilter,
      options: STOCK_LEVEL_LIST_FILTER_OPTIONS,
    };
    if (!showExtendedListFilters) return [stockGroup];
    return [
      {
        groupKey: "kind",
        label: "Tipo",
        ariaLabel: "Filtrar por tipo de inventario",
        value: productKindFilter,
        onChange: setProductKindFilter,
        options: PRODUCT_KIND_LIST_FILTER_OPTIONS,
      },
      {
        groupKey: "family",
        label: "Familia",
        ariaLabel: "Filtrar por familia de producto",
        value: productFamilyFilter,
        onChange: setProductFamilyFilter,
        options: PRODUCT_FAMILY_LIST_FILTER_OPTIONS,
      },
      stockGroup,
    ];
  }, [
    showExtendedListFilters,
    productKindFilter,
    productFamilyFilter,
    stockLevelFilter,
  ]);

  const selectedRow = useMemo(
    () => rowsForRender.find((item) => String(item.id) === selectedId) ?? null,
    [rowsForRender, selectedId],
  );

  const activeCartaCategorias = useMemo(
    () =>
      [...cartaCategorias]
        .filter((c) => c.isActive)
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
        ),
    [cartaCategorias],
  );

  const selectedKey = selectedRow ? String(selectedRow.id) : "";
  const selectedDraft = selectedRow
    ? (drafts[selectedKey] ?? draftFromRow(selectedRow))
    : null;

  const selectedIsDirty = selectedRow
    ? isInventoryDraftDirty(selectedRow, selectedDraft!)
    : false;

  const renderConfigPanel = () => {
    if (!selectedRow || !selectedDraft) {
      return (
        <div className="hostly-inventory-panel-empty">
          {loading ? t("inventory.loadingProducts") : t("inventory.selectToConfigure")}
        </div>
      );
    }

    const isSaving = Boolean(savingById[selectedKey]);
    const isDeleting = Boolean(deletingById[selectedKey]);
    const saveFeedback = saveFeedbackById[selectedKey];
    const saveButtonDisabled =
      usingMock || isSaving || isDeleting || !selectedIsDirty || !canEditInventory;
    const saveButtonLabel = isSaving
      ? "Guardando…"
      : saveFeedback === "saved"
        ? "Guardado"
        : saveFeedback === "error"
          ? "Error al guardar"
          : "Guardar cambios";
    const stationTrim = resolveProductOperationStationLabel(
      {
        operationStationId: selectedRow.operationStationId,
        operationStationName: selectedRow.operationStationName,
        station: selectedRow.station,
        preparationArea: selectedRow.station,
      },
      operationStations,
    );
    const productFamilyLabel = getProductFamilyLabel(selectedRow);
    const legacyCategoryLabel = inventoryLegacyCategoryLabel(
      selectedRow,
      cartaCategorias,
    );
    const draftPurchaseNormalized = normalizePurchaseCostInput({
      purchaseCost: selectedDraft.purchase_cost,
      purchaseQuantity: selectedDraft.purchase_quantity,
      purchaseUnit: selectedDraft.purchase_unit || undefined,
    });
    const draftCalculatedUnitCost = draftPurchaseNormalized
      ? calculateInventoryUnitCost(draftPurchaseNormalized)
      : null;
    const draftPurchaseEquation = formatPurchaseCostEquation(
      draftPurchaseNormalized,
      draftCalculatedUnitCost,
    );
    const storedUnitCostLabel =
      selectedRow.unit_cost != null && selectedRow.unit_cost_unit
        ? getInventoryUnitCostLabel(selectedRow.unit_cost, selectedRow.unit_cost_unit as "unit" | "ml" | "g")
        : null;

    return (
      <div className="hostly-inventory-config-panel">
        <div className="hostly-inventory-config-body hostly-inventory-config-body--compact">
          <section className="hostly-inventory-compact-fiche">
            <div className="hostly-inventory-compact-mobile-bar">
              <button
                type="button"
                className="hostly-inventory-mobile-close"
                onClick={tryCloseInspector}
              >
                Cerrar
              </button>
            </div>

            <div className="hostly-inventory-compact-sheet">
              <div className="hostly-inventory-compact-grid hostly-inventory-compact-grid--2">
                <label className="hostly-inventory-field">
                  <span className="hostly-inventory-field-label">{t("common.name")}</span>
                  <input
                    value={selectedDraft.nombre}
                    onChange={(e) => updateDraft(selectedRow.id, { nombre: e.target.value })}
                    placeholder={selectedRow.nombre ?? t("inventory.placeholderProduct")}
                    className="hostly-inventory-field-input"
                  />
                </label>
                <label className="hostly-inventory-field">
                  <span className="hostly-inventory-field-label">Proveedor</span>
                  <input
                    value={selectedDraft.supplierName}
                    onChange={(e) => updateDraft(selectedRow.id, { supplierName: e.target.value })}
                    placeholder="Proveedor habitual"
                    className="hostly-inventory-field-input"
                  />
                </label>
              </div>

              <div className="hostly-inventory-compact-grid hostly-inventory-compact-grid--3">
                <label className="hostly-inventory-field">
                  <span className="hostly-inventory-field-label">{t("common.currentStock")}</span>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={selectedDraft.stock_actual}
                    onChange={(e) => updateDraft(selectedRow.id, { stock_actual: e.target.value })}
                    className="hostly-inventory-field-input"
                  />
                </label>
                <label className="hostly-inventory-field">
                  <span className="hostly-inventory-field-label">{t("common.minStock")}</span>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={selectedDraft.stock_minimo}
                    onChange={(e) => updateDraft(selectedRow.id, { stock_minimo: e.target.value })}
                    className="hostly-inventory-field-input"
                    placeholder="—"
                  />
                </label>
                <label className="hostly-inventory-field">
                  <span className="hostly-inventory-field-label">Unidad stock</span>
                  <select
                    value={selectedDraft.unidad}
                    onChange={(e) =>
                      changeDraftUnit(selectedRow.id, selectedDraft, e.target.value)
                    }
                    className="hostly-inventory-field-input"
                  >
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="hostly-inventory-compact-grid hostly-inventory-compact-grid--3">
                <label className="hostly-inventory-field">
                  <span className="hostly-inventory-field-label">Precio compra (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={selectedDraft.purchase_cost}
                    onChange={(e) =>
                      updateDraft(selectedRow.id, { purchase_cost: e.target.value })
                    }
                    className="hostly-inventory-field-input"
                    placeholder="18"
                  />
                </label>
                <label className="hostly-inventory-field">
                  <span className="hostly-inventory-field-label">Cantidad compra</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={selectedDraft.purchase_quantity}
                    onChange={(e) =>
                      updateDraft(selectedRow.id, { purchase_quantity: e.target.value })
                    }
                    className="hostly-inventory-field-input"
                    placeholder="700"
                  />
                </label>
                <label className="hostly-inventory-field">
                  <span className="hostly-inventory-field-label">Unidad compra</span>
                  <select
                    value={selectedDraft.purchase_unit}
                    onChange={(e) =>
                      updateDraft(selectedRow.id, {
                        purchase_unit: e.target.value as PurchaseUnit | "",
                      })
                    }
                    className="hostly-inventory-field-input"
                    style={{ cursor: "pointer" }}
                  >
                    <option value="">—</option>
                    {PURCHASE_UNIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="hostly-inventory-compact-cost-inline">
                <span className="hostly-inventory-compact-cost-inline__label">
                  Coste unitario calculado
                </span>
                <span className="hostly-inventory-compact-cost-inline__value">
                  {draftPurchaseEquation ? (
                    draftPurchaseEquation
                  ) : draftCalculatedUnitCost ? (
                    getInventoryUnitCostLabel(
                      draftCalculatedUnitCost.unitCost,
                      draftCalculatedUnitCost.unitCostUnit,
                    )
                  ) : storedUnitCostLabel ? (
                    storedUnitCostLabel
                  ) : (
                    "Indica precio, cantidad y unidad de compra."
                  )}
                </span>
              </div>

              <div
                className="hostly-inventory-compact-footer"
                data-dirty={selectedIsDirty ? "true" : "false"}
                data-feedback={saveFeedback ?? "idle"}
              >
                <button
                  type="button"
                  className="hostly-inventory-primary-btn hostly-inventory-compact-footer-save"
                  disabled={saveButtonDisabled}
                  title={capabilityDeniedTitle(canEditInventory)}
                  onClick={() => void guardarFila(selectedRow.id)}
                >
                  {saveButtonLabel}
                </button>
                <details className="hostly-inventory-advanced-details hostly-inventory-advanced-details--inline">
                  <summary className="hostly-inventory-advanced-summary">
                    Configuración avanzada
                  </summary>
                  <div className="hostly-inventory-advanced-body">
              <section className="hostly-inventory-inspector-block">
                <h3 className="hostly-inventory-inspector-section-title hostly-kpi-label">
                  Catálogo y operación
                </h3>
                <div className="hostly-inventory-fiche-grid">
                  <label className="hostly-inventory-field hostly-inventory-field--full">
                    <span className="hostly-inventory-field-label">Categoría carta</span>
                    <select
                      value={selectedDraft.categoryId}
                      onChange={(e) =>
                        updateDraft(selectedRow.id, { categoryId: e.target.value })
                      }
                      className="hostly-inventory-field-input"
                      style={{ cursor: "pointer" }}
                    >
                      <option value="">Sin categoría de carta</option>
                      {activeCartaCategorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {legacyCategoryLabel ? (
                      <p className="mt-1 text-xs text-amber-800">
                        Legacy: {legacyCategoryLabel}
                      </p>
                    ) : null}
                    <p className="hostly-inventory-field-hint">
                      Familia menú: {productFamilyLabel}
                      {stationTrim && stationTrim !== "Sin estación"
                        ? ` · ${stationTrim}`
                        : ""}
                    </p>
                  </label>
                  <label className="hostly-inventory-field">
                    <span className="hostly-inventory-field-label">Estación operativa</span>
                    <OperationStationProductSelect
                      restaurantId={restaurantId}
                      value={selectedDraft.station}
                      onChange={(value) =>
                        updateDraft(selectedRow.id, { station: value })
                      }
                      className="hostly-inventory-field-input"
                    />
                  </label>
                  <label className="hostly-inventory-field">
                    <span className="hostly-inventory-field-label">Tipo de ingrediente</span>
                    <select
                      value={selectedDraft.productKind}
                      onChange={(e) =>
                        updateDraft(selectedRow.id, {
                          productKind: e.target.value as ProductKind,
                        })
                      }
                      className="hostly-inventory-field-input"
                      style={{ cursor: "pointer" }}
                    >
                      {PRODUCT_KIND_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="hostly-inventory-switch-row hostly-inventory-switch-row--compact hostly-inventory-field--full">
                    <span className="hostly-inventory-switch-label">
                      <strong>Activo</strong>
                      <small>Visible cuando el ingrediente esté enlazado al catálogo.</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedDraft.active}
                      onChange={(e) => updateDraft(selectedRow.id, { active: e.target.checked })}
                    />
                  </label>
                  <label className="hostly-inventory-switch-row hostly-inventory-switch-row--compact hostly-inventory-field--full">
                    <span className="hostly-inventory-switch-label">
                      <strong>Inventario activo</strong>
                      <small>Control de stock habilitado para este artículo.</small>
                    </span>
                    <input type="checkbox" checked readOnly />
                  </label>
                </div>
              </section>

          <section className="hostly-inventory-inspector-block hostly-inventory-inspector-block--movements">
            <div className="hostly-inventory-inspector-section-head">
              <h3 className="hostly-inventory-inspector-section-title hostly-kpi-label">
                Movimientos de stock
              </h3>
              <Link
                href={productTimelineHref(selectedKey)}
                className="hostly-inventory-timeline-link"
                prefetch
              >
                Ver historial
              </Link>
            </div>
            {centralStockMovements.length === 0 && legacyStockMovements.length === 0 ? (
              <p className="hostly-inventory-movements-empty">Sin movimientos recientes</p>
            ) : (
              <>
                {centralStockMovements.length > 0 ? (
                  <ul className="hostly-inventory-movements-list">
                    {centralStockMovements.map((m) => {
                      const when =
                        m.createdAtMs != null
                          ? movementDateFmt.format(m.createdAtMs)
                          : "—";
                      const deltaStr = `${formatMovementDelta(m.quantityDelta)} ${m.unit}`;
                      const deltaTone =
                        m.quantityDelta > 0
                          ? "plus"
                          : m.quantityDelta < 0
                            ? "minus"
                            : "zero";
                      const context = centralMovementContextLabel(m);
                      const stockRange = centralMovementStockRange(m);
                      return (
                        <li
                          key={`central-${m.id}`}
                          className="hostly-inventory-movements-row hostly-inventory-movements-row--central"
                        >
                          <div className="hostly-inventory-movements-main">
                            <div className="hostly-inventory-movements-head">
                              <span className="hostly-inventory-movements-date">{when}</span>
                              <span
                                className="hostly-inventory-movements-delta"
                                data-sign={deltaTone}
                              >
                                {deltaStr}
                              </span>
                              <span className="hostly-inventory-movements-kind">
                                {centralStockMovementSourceLabel(m.source, m.type)}
                              </span>
                            </div>
                            {context ? (
                              <p className="hostly-inventory-movements-context">{context}</p>
                            ) : null}
                            {stockRange ? (
                              <p className="hostly-inventory-movements-stock-range">{stockRange}</p>
                            ) : null}
                            {m.applyError ? (
                              <p className="hostly-inventory-movements-apply-error" role="alert">
                                {m.applyError}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {legacyStockMovements.length > 0 ? (
                  <div className="hostly-inventory-movements-legacy">
                    <p className="hostly-inventory-movements-legacy-title">Movimientos antiguos</p>
                    <ul className="hostly-inventory-movements-list">
                      {legacyStockMovements.map((m) => {
                        const when =
                          m.createdAtMs != null
                            ? movementDateFmt.format(m.createdAtMs)
                            : "—";
                        const deltaStr = formatMovementDelta(m.delta);
                        const finalStr = `${roundTo(m.newStock, 3)} ${m.unit}`;
                        const deltaTone =
                          m.delta > 0 ? "plus" : m.delta < 0 ? "minus" : "zero";
                        return (
                          <li key={`legacy-${m.id}`} className="hostly-inventory-movements-row">
                            <span className="hostly-inventory-movements-date">{when}</span>
                            <span
                              className="hostly-inventory-movements-delta"
                              data-sign={deltaTone}
                            >
                              {deltaStr}
                            </span>
                            <span
                              className="hostly-inventory-movements-final"
                              title="Stock tras el movimiento"
                            >
                              → {finalStr}
                            </span>
                            <span className="hostly-inventory-movements-kind">
                              {stockMovementKindLabel(m)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="hostly-inventory-inspector-block hostly-inventory-inspector-block--media">
            <h3 className="hostly-inventory-inspector-section-title hostly-kpi-label">Media</h3>
            <div className="hostly-inventory-media-card">
              <div className="hostly-inventory-media-icon-wrap" aria-hidden>
                <span className="hostly-inventory-media-icon">✦</span>
              </div>
              <div className="hostly-inventory-media-copy">
                <p className="hostly-inventory-media-cta">Imagen e identificación por IA</p>
                <p className="hostly-inventory-media-hint">
                  Próximamente: foto, OCR y enriquecimiento automático de ficha.
                </p>
                <span className="hostly-inventory-media-chip">Placeholder · sin subida</span>
              </div>
            </div>
          </section>

          <section className="hostly-inventory-inspector-block hostly-inventory-inspector-block--future">
            <h3 className="hostly-inventory-inspector-section-title hostly-kpi-label">Próximamente</h3>
            <div className="hostly-inventory-future-chips">
              {["Recetas", "IA", "Escandallos", "Compras"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </section>

              <div className="hostly-inventory-advanced-footer">
                <button
                  type="button"
                  onClick={() => eliminarFila(selectedRow.id)}
                  disabled={isDeleting}
                  className="hostly-inventory-secondary-btn"
                >
                  {isDeleting ? t("common.deleting") : "Desactivar inventario"}
                </button>
              </div>
                  </div>
                </details>
                {selectedIsDirty ? (
                  <span className="hostly-inventory-compact-footer-status" role="status">
                    Sin guardar
                  </span>
                ) : saveFeedback === "saved" ? (
                  <span
                    className="hostly-inventory-compact-footer-status hostly-inventory-compact-footer-status--ok"
                    role="status"
                  >
                    Guardado
                  </span>
                ) : saveFeedback === "error" && error ? (
                  <span
                    className="hostly-inventory-compact-footer-status hostly-inventory-compact-footer-status--error"
                    role="alert"
                  >
                    Error
                  </span>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  };

  return (
    <ModulePageShell
      {...inventoryHubShellLayout}
      title={t("inventory.title")}
      subtitle={t("inventory.subtitle")}
      headerBelow={<InventarioRouteTabs />}
    >
      <div className="hostly-inventory-workbench">
        <div className="hostly-inventory-toolbar">
          <p className="hostly-inventory-toolbar-count">{listCountLabel}</p>
          <div className="hostly-inventory-toolbar-actions">
            <button onClick={cargar} type="button" className="hostly-inventory-secondary-btn">
              {t("common.reload")}
            </button>
            <button onClick={addProducto} type="button" className="hostly-inventory-primary-btn">
              {t("inventory.addProduct")}
            </button>
          </div>
        </div>

        {error ? <div className="hostly-inventory-error">{error}</div> : null}
        {usingMock ? (
          <div className="hostly-inventory-warning">
            No se pudo cargar el inventario. Mostrando datos de ejemplo temporalmente.
          </div>
        ) : null}

        <div className="hostly-inventory-split">
          <aside className="hostly-inventory-list-panel">
            <div className="hostly-inventory-search-wrap">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar ingrediente, proveedor o unidad..."
                className="hostly-inventory-search"
              />
            </div>
            <div className="hostly-stock-filter-panel">
              {inventoryFilterGroups.map(renderInventoryStockFilterGroup)}
            </div>
            <div className="hostly-inventory-list">
              {filteredRows.length === 0 ? (
                <div className="hostly-inventory-empty">
                  {loading ? t("inventory.loadingProducts") : t("inventory.emptyProducts")}
                </div>
              ) : (
                filteredRows.map((item) => {
                  const key = String(item.id);
                  const stock = item.stock_actual;
                  const stockStatus = resolveStockStatus(stockStatusInputFromRow(item));
                  const stockBadgeLabel = formatStockStatusLabel(stockStatus);
                  const stockBadgeClass = stockStatusBadgeClassName(stockStatus);
                  const selected = key === selectedId;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`hostly-inventory-product-row${selected ? " is-selected" : ""}`}
                      onClick={() => trySelectProduct(key)}
                    >
                      <span className="hostly-inventory-row-image">P</span>
                      <span className="hostly-inventory-row-main">
                        <span className="hostly-inventory-row-name">
                          {item.nombre?.trim() || "Ingrediente sin nombre"}
                        </span>
                        <span className="hostly-inventory-row-meta">
                          {formatMoney2(item.coste_unitario)} €/{item.unidad ?? "ud"}
                        </span>
                      </span>
                      <span className="hostly-inventory-row-side">
                        <span className="hostly-inventory-row-stock">
                          {stock == null
                            ? "—"
                            : `${roundTo(stock, 3)} ${item.unidad ?? "ud"}`}
                        </span>
                        <span
                          className={`hostly-inventory-badge hostly-inventory-stock-badge ${stockBadgeClass}`}
                        >
                          {stockBadgeLabel}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section
            className="hostly-inventory-panel-shell"
            data-mobile-open={mobilePanelOpen ? "true" : "false"}
          >
            {renderConfigPanel()}
          </section>
        </div>
      </div>

      <style jsx global>{`
        .hostly-inventory-workbench {
          display: grid;
          gap: 10px;
        }
        .hostly-inventory-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 9px 10px;
          border: 1px solid rgba(77, 107, 128, 0.14);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.72);
          box-shadow: 0 12px 30px rgba(49, 95, 125, 0.06);
        }
        .hostly-inventory-split {
          display: grid;
          grid-template-columns: minmax(300px, 1.02fr) minmax(280px, 1.06fr);
          gap: 16px;
          align-items: start;
        }
        @media (min-width: 768px) {
          .hostly-inventory-panel-shell {
            display: flex;
            flex-direction: column;
            max-height: min(82vh, 720px);
            min-height: 280px;
          }
        }
        .hostly-inventory-list-panel,
        .hostly-inventory-panel-shell {
          border: 1px solid rgba(77, 107, 128, 0.14);
          border-radius: 20px;
          overflow: hidden;
        }
        .hostly-inventory-list-panel {
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 16px 38px rgba(49, 95, 125, 0.085);
        }
        .hostly-inventory-panel-shell {
          border-color: rgba(77, 107, 128, 0.1);
          background: rgba(252, 252, 253, 0.86);
          box-shadow: 0 6px 20px rgba(49, 95, 125, 0.045);
        }
        .hostly-inventory-search-wrap {
          padding: 8px 10px;
          border-bottom: 1px solid rgba(77, 107, 128, 0.1);
          background: rgba(244, 248, 252, 0.7);
        }
        .hostly-inventory-search {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(77, 107, 128, 0.16);
          border-radius: 12px;
          padding: 7px 10px;
          outline: none;
          background: white;
          color: #102033;
          font-weight: 700;
        }
        .hostly-stock-filter-panel .hostly-stock-filter-group {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          min-width: 0;
          width: 100%;
        }
        .hostly-stock-filter-panel .hostly-stock-filter-label {
          display: block;
          width: 100%;
        }
        .hostly-stock-filter-panel .hostly-stock-filter-chips {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          min-width: 0;
          width: 100%;
          max-width: 100%;
        }
        .hostly-stock-filter-panel button.hostly-stock-filter-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
        }
        .hostly-inventory-list {
          display: grid;
          max-height: 650px;
          overflow: auto;
        }
        .hostly-inventory-product-row {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          width: 100%;
          border: 0;
          border-bottom: 1px solid rgba(77, 107, 128, 0.09);
          background: transparent;
          padding: 11px 12px;
          text-align: left;
          cursor: pointer;
        }
        .hostly-inventory-product-row.is-selected {
          background: linear-gradient(90deg, rgba(219, 238, 250, 0.82), rgba(255,255,255,0.72));
          box-shadow: inset 3px 0 0 #4f9fc8;
        }
        .hostly-inventory-row-image {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(180deg, #e9f5fb, #d9ecf7);
          color: #2f6f91;
          border: 1px solid rgba(77, 107, 128, 0.12);
          font-weight: 950;
        }
        .hostly-inventory-row-main {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .hostly-inventory-row-name {
          color: #102033;
          font-weight: 900;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .hostly-inventory-row-meta {
          color: #6a7f8f;
          font-size: 12px;
          font-weight: 700;
        }
        .hostly-inventory-row-side {
          display: grid;
          justify-items: end;
          gap: 5px;
        }
        .hostly-inventory-row-stock {
          color: #102033;
          font-size: 12px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }
        .hostly-inventory-badge {
          display: inline-flex;
          align-items: center;
          min-height: 20px;
          padding: 0 8px;
          border-radius: 999px;
          background: rgba(216, 239, 226, 0.78);
          color: #2f6a45;
          font-size: 10px;
          font-weight: 900;
        }
        .hostly-inventory-badge.is-low {
          background: rgba(251, 230, 198, 0.9);
          color: #9a5d11;
        }
        .hostly-inventory-stock-badge.is-ok,
        .hostly-inventory-stock-status.is-ok {
          background: rgba(216, 239, 226, 0.78);
          color: #2f6a45;
        }
        .hostly-inventory-stock-badge.is-low,
        .hostly-inventory-stock-status.is-low {
          background: rgba(251, 230, 198, 0.92);
          color: #9a5d11;
        }
        .hostly-inventory-stock-badge.is-out,
        .hostly-inventory-stock-status.is-out {
          background: rgba(254, 226, 226, 0.92);
          color: #b91c1c;
        }
        .hostly-inventory-stock-badge.is-unknown,
        .hostly-inventory-stock-status.is-unknown {
          background: rgba(241, 245, 249, 0.92);
          color: #64748b;
        }
        .hostly-inventory-field-hint {
          margin: 0;
          font-size: 10px;
          font-weight: 600;
          color: rgba(100, 116, 139, 0.88);
          line-height: 1.3;
        }
        .hostly-inventory-cost-summary {
          padding: 7px 8px;
          border-radius: 8px;
          border: 1px solid var(--hostly-table-divider-faint);
          background: color-mix(in srgb, var(--hostly-surface-page-soft) 55%, transparent);
        }
        .hostly-inventory-cost-equation {
          margin: 0;
          font-size: 12px;
          font-weight: 750;
          color: #0f766e;
          font-variant-numeric: tabular-nums;
          line-height: 1.35;
        }
        .hostly-inventory-config-panel {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1;
        }
        .hostly-inventory-config-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-gutter: stable;
          scrollbar-width: thin;
          scrollbar-color: rgba(100, 116, 139, 0.32) transparent;
          padding: 6px 8px 18px 10px;
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .hostly-inventory-config-body--compact {
          overflow: visible;
          padding: 6px 10px 8px;
          flex: 0 1 auto;
        }
        .hostly-inventory-config-body--compact .hostly-inventory-field-input {
          min-height: 0;
          max-height: 34px;
          height: 34px;
          padding: 3px 7px;
          font-size: 11px;
          line-height: 1.2;
        }
        .hostly-inventory-config-body--compact .hostly-inventory-field {
          gap: 1px;
        }
        .hostly-inventory-config-body--compact .hostly-inventory-field-label {
          font-size: 8px;
          letter-spacing: 0.05em;
          line-height: 1.1;
        }
        .hostly-inventory-compact-fiche {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .hostly-inventory-compact-sheet {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .hostly-inventory-compact-mobile-bar {
          display: none;
          justify-content: flex-end;
          margin-bottom: 2px;
        }
        .hostly-inventory-compact-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 4px 6px;
          align-items: start;
        }
        .hostly-inventory-compact-grid--2 {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .hostly-inventory-compact-grid--3 {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .hostly-inventory-compact-cost-inline {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 26px;
          padding: 3px 0 2px;
          border-top: 1px solid var(--hostly-table-divider-faint);
        }
        .hostly-inventory-compact-cost-inline__label {
          flex-shrink: 0;
          font-size: 8px;
          font-weight: 750;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--hostly-ink-muted) 90%, transparent);
          line-height: 1.1;
          max-width: 88px;
        }
        .hostly-inventory-compact-cost-inline__value {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 11px;
          font-weight: 750;
          color: #0f766e;
          font-variant-numeric: tabular-nums;
          line-height: 1.2;
        }
        .hostly-inventory-compact-footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          padding-top: 4px;
          border-top: 1px solid var(--hostly-table-divider-faint);
        }
        .hostly-inventory-compact-footer[data-dirty="true"] {
          background: color-mix(in srgb, #fffbeb 45%, transparent);
          margin: 0 -4px;
          padding: 4px 4px 0;
          border-radius: 8px;
        }
        .hostly-inventory-compact-footer-save {
          flex: 1 1 120px;
          min-width: 0;
          min-height: 34px;
          max-height: 34px;
          padding: 0 10px;
          font-size: 12px;
          font-weight: 800;
        }
        .hostly-inventory-compact-footer-status {
          flex: 0 0 auto;
          font-size: 9px;
          font-weight: 700;
          color: #b45309;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }
        .hostly-inventory-compact-footer-status--ok {
          color: #047857;
        }
        .hostly-inventory-compact-footer-status--error {
          color: #b91c1c;
        }
        .hostly-inventory-advanced-details--inline {
          flex: 0 0 auto;
          margin: 0;
          border: none;
        }
        .hostly-inventory-advanced-details--inline[open] {
          flex-basis: 100%;
          width: 100%;
        }
        .hostly-inventory-advanced-details--inline .hostly-inventory-advanced-summary {
          padding: 6px 4px;
          margin: 0;
          border: 0;
          font-size: 9px;
          white-space: nowrap;
        }
        .hostly-inventory-advanced-details--inline[open] .hostly-inventory-advanced-body {
          margin-top: 4px;
        }
        .hostly-inventory-advanced-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 2px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--hostly-ink-muted) 92%, transparent);
          cursor: pointer;
          list-style: none;
          user-select: none;
        }
        .hostly-inventory-advanced-summary::-webkit-details-marker {
          display: none;
        }
        .hostly-inventory-advanced-summary::after {
          content: "▸";
          font-size: 10px;
          color: var(--hostly-ink-soft);
          transition: transform 0.15s ease;
        }
        .hostly-inventory-advanced-details[open] .hostly-inventory-advanced-summary::after {
          transform: rotate(90deg);
        }
        .hostly-inventory-advanced-body {
          padding: 0 0 8px;
          max-height: min(40vh, 340px);
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: thin;
        }
        .hostly-inventory-advanced-footer {
          display: flex;
          justify-content: flex-end;
          padding: 10px 0 4px;
          border-top: 1px solid var(--hostly-table-divider-faint);
          margin-top: 4px;
        }
        .hostly-inventory-panel-head--compact {
          padding: 6px 10px;
        }
        .hostly-inventory-panel-head--compact .hostly-inventory-head-badges {
          margin-top: 4px;
        }
        @media (max-width: 1100px) {
          .hostly-inventory-compact-grid--3 {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .hostly-inventory-compact-grid--3 .hostly-inventory-field:last-child {
            grid-column: 1 / -1;
          }
        }
        .hostly-inventory-config-body::-webkit-scrollbar {
          width: 7px;
        }
        .hostly-inventory-config-body::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.26);
          border-radius: 99px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .hostly-inventory-config-body::-webkit-scrollbar-thumb:hover {
          background: rgba(71, 85, 105, 0.35);
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .hostly-inventory-panel-head {
          flex-shrink: 0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          padding: 7px 10px;
          border-bottom: 1px solid var(--hostly-table-divider-faint);
          background: color-mix(in srgb, var(--hostly-surface-page-soft) 55%, transparent);
        }
        .hostly-inventory-save-strip {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          padding: 10px 12px;
          border-bottom: 1px solid var(--hostly-table-divider-faint);
          background: color-mix(in srgb, #f0f9ff 72%, white);
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .hostly-inventory-save-strip[data-dirty="true"] {
          background: color-mix(in srgb, #fffbeb 78%, white);
          border-bottom-color: rgba(217, 119, 6, 0.22);
        }
        .hostly-inventory-save-strip-meta {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          flex: 1;
        }
        .hostly-inventory-unsaved-hint {
          font-size: 12px;
          font-weight: 700;
          color: #b45309;
          letter-spacing: 0.01em;
        }
        .hostly-inventory-save-ok {
          font-size: 12px;
          font-weight: 700;
          color: #047857;
        }
        .hostly-inventory-save-idle {
          font-size: 11px;
          font-weight: 600;
        }
        .hostly-inventory-save-error {
          font-size: 11px;
          font-weight: 600;
          color: #b91c1c;
          line-height: 1.35;
        }
        .hostly-inventory-save-strip-btn {
          flex-shrink: 0;
          min-width: 148px;
          min-height: 40px;
          font-size: 13px;
          font-weight: 800;
        }
        .hostly-inventory-save-strip-btn:disabled {
          opacity: 0.52;
          cursor: not-allowed;
        }
        .hostly-inventory-save-strip[data-feedback="saved"]
          .hostly-inventory-save-strip-btn:not(:disabled) {
          background: #047857;
          border-color: #047857;
        }
        .hostly-inventory-save-strip[data-feedback="error"]
          .hostly-inventory-save-strip-btn:not(:disabled) {
          background: #b91c1c;
          border-color: #b91c1c;
        }
        .hostly-inventory-head-main {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          min-width: 0;
        }
        .hostly-inventory-avatar {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 780;
          letter-spacing: -0.02em;
          color: #1e4d67;
          background: radial-gradient(
            circle at 30% 28%,
            rgba(255, 255, 255, 0.95) 0%,
            rgba(227, 242, 252, 0.92) 45%,
            rgba(207, 231, 245, 0.85) 100%
          );
          border: 1px solid rgba(100, 116, 139, 0.14);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }
        .hostly-inventory-avatar-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: rgba(56, 142, 184, 0.55);
          box-shadow: 0 0 0 3px rgba(186, 224, 240, 0.45);
        }
        .hostly-inventory-head-text {
          min-width: 0;
        }
        .hostly-inventory-head-title {
          margin: 0;
          font-size: 14px;
          font-weight: 780;
          line-height: 1.22;
          color: color-mix(in srgb, var(--hostly-ink-strong) 92%, var(--hostly-ink-muted));
          letter-spacing: -0.02em;
        }
        .hostly-inventory-head-sub {
          margin: 2px 0 0;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.25;
          letter-spacing: 0.02em;
        }
        .hostly-inventory-head-sub.hostly-muted {
          font-size: 10px;
          font-weight: 600;
          line-height: 1.25;
          color: var(--hostly-ink-soft);
        }
        .hostly-inventory-head-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 6px;
        }
        .hostly-inventory-head-badge {
          display: inline-flex;
          align-items: center;
          min-height: 18px;
          padding: 0 7px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 0.04em;
          border: 1px solid rgba(100, 116, 139, 0.14);
          background: rgba(255, 255, 255, 0.72);
          color: #475569;
        }
        .hostly-inventory-head-badge.is-active {
          background: rgba(224, 242, 254, 0.65);
          border-color: rgba(125, 211, 252, 0.35);
          color: #0c4a6e;
        }
        .hostly-inventory-head-badge.is-inactive {
          background: rgba(241, 245, 249, 0.85);
          color: #64748b;
        }
        .hostly-inventory-head-badge.is-neutral {
          font-variant-numeric: tabular-nums;
        }
        /* Side inspector: secciones técnicas con hairline (sin “mega-card”) */
        .hostly-inventory-inspector-block {
          padding: 10px 0 11px;
          margin: 0;
          border: none;
          border-radius: 0;
          border-top: 1px solid var(--hostly-table-divider-faint);
          background: transparent;
          box-shadow: none;
        }
        .hostly-inventory-config-body > .hostly-inventory-inspector-block:first-of-type {
          border-top: none;
          padding-top: 4px;
        }
        .hostly-inventory-inspector-block--movements {
          padding-bottom: 9px;
          background: color-mix(in srgb, var(--hostly-surface-page-soft) 42%, transparent);
        }
        .hostly-inventory-inspector-block--media {
          padding-top: 9px;
        }
        .hostly-inventory-inspector-block--future {
          padding: 9px 0 6px;
          margin-top: 2px;
          border-top-style: dashed;
          border-top-color: color-mix(in srgb, var(--hostly-table-divider-soft) 75%, transparent);
          background: color-mix(in srgb, var(--hostly-surface-page-soft) 35%, transparent);
          border-radius: 0;
        }
        .hostly-inventory-inspector-section-title.hostly-kpi-label {
          margin: 0 0 5px;
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.1em;
          line-height: 1.2;
          color: color-mix(in srgb, var(--hostly-ink-muted) 88%, transparent);
        }
        .hostly-inventory-inspector-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 5px;
        }
        .hostly-inventory-inspector-section-head .hostly-inventory-inspector-section-title {
          margin: 0;
        }
        .hostly-inventory-timeline-link {
          font-size: 11px;
          font-weight: 700;
          color: var(--hostly-ink-strong);
          text-decoration: none;
          padding: 4px 8px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: var(--hostly-surface-card-solid);
          white-space: nowrap;
        }
        .hostly-inventory-timeline-link:hover {
          background: color-mix(in srgb, var(--hostly-surface-card-solid) 88%, #3b82f6 12%);
        }
        .hostly-inventory-fiche-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px 8px;
          align-items: start;
        }
        .hostly-inventory-field {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .hostly-inventory-field--full {
          grid-column: 1 / -1;
        }
        .hostly-inventory-field-label {
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--hostly-ink-muted) 90%, transparent);
          line-height: 1.15;
        }
        .hostly-inventory-field-input {
          width: 100%;
          box-sizing: border-box;
          padding: 5px 8px;
          min-height: 32px;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--hostly-table-divider-soft) 92%, var(--hostly-ink-muted) 4%);
          outline: none;
          background: color-mix(in srgb, var(--hostly-surface-card-solid) 96%, transparent);
          color: var(--hostly-ink-strong);
          font-size: 12px;
          font-weight: 650;
        }
        .hostly-inventory-field-input:focus {
          border-color: color-mix(in srgb, var(--hostly-accent) 38%, var(--hostly-table-divider-soft));
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--hostly-accent) 18%, transparent);
        }
        .hostly-inventory-switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 5px 8px;
          min-height: 32px;
          border-radius: 8px;
          background: color-mix(in srgb, var(--hostly-surface-page-soft) 65%, transparent);
          border: 1px solid var(--hostly-table-divider-faint);
          color: var(--hostly-ink-strong);
          box-sizing: border-box;
        }
        .hostly-inventory-switch-row--compact {
          min-height: 0;
        }
        .hostly-inventory-switch-label {
          min-width: 0;
        }
        .hostly-inventory-switch-label strong {
          font-size: 11px;
          font-weight: 780;
        }
        .hostly-inventory-switch-label small {
          display: block;
          margin-top: 1px;
          color: color-mix(in srgb, var(--hostly-ink-muted) 88%, transparent);
          font-size: 9px;
          font-weight: 600;
          line-height: 1.28;
        }
        .hostly-inventory-media-card {
          display: flex;
          align-items: stretch;
          gap: 10px;
          padding: 7px 8px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--hostly-surface-page-soft) 45%, transparent);
          border: 1px solid var(--hostly-table-divider-faint);
        }
        .hostly-inventory-media-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(224, 242, 254, 0.45);
          border: 1px solid rgba(125, 211, 252, 0.25);
        }
        .hostly-inventory-media-icon {
          font-size: 22px;
          line-height: 1;
          color: rgba(14, 116, 144, 0.55);
          font-weight: 300;
        }
        .hostly-inventory-media-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 3px;
        }
        .hostly-inventory-media-cta {
          margin: 0;
          font-size: 12px;
          font-weight: 750;
          color: color-mix(in srgb, var(--hostly-ink-strong) 90%, var(--hostly-ink-muted));
          letter-spacing: -0.01em;
          line-height: 1.2;
        }
        .hostly-inventory-media-hint {
          margin: 0;
          font-size: 10px;
          font-weight: 620;
          color: var(--hostly-ink-muted);
          line-height: 1.32;
        }
        .hostly-inventory-media-chip {
          display: inline-flex;
          align-self: flex-start;
          margin-top: 3px;
          padding: 2px 7px;
          border-radius: 999px;
          font-size: 8.5px;
          font-weight: 750;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(14, 116, 144, 0.85);
          background: rgba(224, 242, 254, 0.5);
          border: 1px solid rgba(125, 211, 252, 0.28);
        }
        .hostly-inventory-future-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .hostly-inventory-future-chips span {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 750;
          color: rgba(71, 85, 105, 0.78);
          background: rgba(255, 255, 255, 0.55);
          border: 1px solid var(--hostly-table-divider-soft);
        }
        .hostly-inventory-movements-empty {
          margin: 0;
          font-size: 11px;
          font-weight: 650;
          color: rgba(100, 116, 139, 0.88);
          line-height: 1.35;
        }
        .hostly-inventory-movements-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 6px;
        }
        .hostly-inventory-movements-row {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) auto auto auto;
          gap: 6px 8px;
          align-items: center;
          padding: 5px 7px;
          border-radius: 7px;
          background: color-mix(in srgb, var(--hostly-surface-card-solid) 88%, transparent);
          border: 1px solid var(--hostly-table-divider-faint);
          font-size: 11px;
        }
        .hostly-inventory-movements-row--central {
          grid-template-columns: 1fr;
          align-items: stretch;
          padding: 6px 8px;
        }
        .hostly-inventory-movements-main {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .hostly-inventory-movements-head {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) auto auto;
          gap: 6px 8px;
          align-items: center;
        }
        .hostly-inventory-movements-context,
        .hostly-inventory-movements-stock-range {
          margin: 0;
          font-size: 10px;
          font-weight: 650;
          color: #64748b;
          line-height: 1.3;
        }
        .hostly-inventory-movements-stock-range {
          font-variant-numeric: tabular-nums;
          color: #475569;
        }
        .hostly-inventory-movements-apply-error {
          margin: 0;
          font-size: 10px;
          font-weight: 700;
          color: #b91c1c;
          line-height: 1.3;
        }
        .hostly-inventory-movements-legacy {
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px dashed var(--hostly-table-divider-faint);
        }
        .hostly-inventory-movements-legacy-title {
          margin: 0 0 6px;
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(100, 116, 139, 0.85);
        }
        .hostly-inventory-movements-date {
          color: #64748b;
          font-weight: 650;
          font-variant-numeric: tabular-nums;
        }
        .hostly-inventory-movements-delta {
          font-weight: 850;
          font-variant-numeric: tabular-nums;
          color: var(--hostly-ink-strong);
        }
        .hostly-inventory-movements-delta[data-sign="plus"] {
          color: #0f766e;
        }
        .hostly-inventory-movements-delta[data-sign="minus"] {
          color: #b45309;
        }
        .hostly-inventory-movements-final {
          font-weight: 750;
          color: #334155;
          font-variant-numeric: tabular-nums;
        }
        .hostly-inventory-movements-kind {
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: rgba(100, 116, 139, 0.85);
          justify-self: end;
          white-space: nowrap;
        }
        .hostly-inventory-panel-footer {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 8px;
          padding: 10px 12px;
          border-top: 1px solid rgba(100, 116, 139, 0.12);
          background: rgba(247, 252, 255, 0.92);
          backdrop-filter: blur(8px);
        }
        .hostly-inventory-panel-footer .hostly-inventory-primary-btn {
          min-width: 112px;
        }
        .hostly-inventory-panel-footer .hostly-inventory-primary-btn,
        .hostly-inventory-panel-footer .hostly-inventory-secondary-btn {
          padding: 7px 12px;
          min-height: 36px;
          box-sizing: border-box;
          font-size: 12px;
        }
        .hostly-inventory-primary-btn,
        .hostly-inventory-secondary-btn,
        .hostly-inventory-mobile-close {
          border-radius: 10px;
          border: 1px solid rgba(77, 107, 128, 0.14);
          padding: 9px 12px;
          font-weight: 850;
          cursor: pointer;
        }
        .hostly-inventory-primary-btn {
          background: #102033;
          color: white;
        }
        .hostly-inventory-secondary-btn,
        .hostly-inventory-mobile-close {
          background: rgba(255,255,255,0.82);
          color: #102033;
        }
        .hostly-inventory-error,
        .hostly-inventory-warning,
        .hostly-inventory-empty,
        .hostly-inventory-panel-empty {
          padding: 12px;
          border-radius: 14px;
          font-weight: 750;
        }
        .hostly-inventory-error {
          border: 1px solid rgba(220, 38, 38, 0.28);
          background: rgba(220, 38, 38, 0.06);
          color: rgb(153, 27, 27);
        }
        .hostly-inventory-warning {
          border: 1px solid rgba(234, 179, 8, 0.28);
          background: rgba(234, 179, 8, 0.09);
          color: rgba(15, 23, 42, 0.74);
        }
        .hostly-inventory-empty,
        .hostly-inventory-panel-empty {
          color: #6a7f8f;
        }
        .hostly-inventory-mobile-close {
          display: none;
        }
        @media (max-width: 767.98px) {
          .hostly-inventory-split {
            display: block;
          }
          .hostly-inventory-list {
            max-height: none;
          }
          .hostly-inventory-product-row {
            grid-template-columns: 38px minmax(0, 1fr);
          }
          .hostly-inventory-row-side {
            grid-column: 2;
            justify-items: start;
            grid-auto-flow: column;
            align-items: center;
          }
          .hostly-inventory-panel-shell {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 80;
            max-height: 88dvh;
            border-radius: 22px 22px 0 0;
            transform: translateY(105%);
            transition: transform 180ms ease;
            overflow: auto;
          }
          .hostly-inventory-panel-shell[data-mobile-open="true"] {
            transform: translateY(0);
          }
          .hostly-inventory-mobile-close {
            display: inline-flex;
          }
          .hostly-inventory-compact-mobile-bar {
            display: flex;
          }
          .hostly-inventory-config-panel {
            flex: none;
          }
          .hostly-inventory-config-body {
            flex: none;
            overflow: visible;
            min-height: 0;
          }
          .hostly-inventory-fiche-grid {
            grid-template-columns: 1fr;
          }
          .hostly-inventory-panel-footer {
            align-items: stretch;
            flex-direction: column;
          }
          .hostly-inventory-movements-row {
            grid-template-columns: 1fr;
            justify-items: start;
          }
          .hostly-inventory-movements-head {
            grid-template-columns: 1fr;
            justify-items: start;
          }
          .hostly-inventory-movements-kind {
            justify-self: start;
          }
          .hostly-inventory-primary-btn,
          .hostly-inventory-secondary-btn {
            width: 100%;
          }
        }
      `}</style>
    </ModulePageShell>
  );
}
