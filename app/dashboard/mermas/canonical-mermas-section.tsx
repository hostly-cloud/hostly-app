"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import {
  HostlyAlert,
  HostlyButton,
  HostlyField,
  HostlyInput,
  HostlyKpiCard,
  HostlyOperationalEmptyState,
  HostlyPermissionState,
  HostlySection,
  HostlySectionHeader,
  HostlySelect,
  HostlySurface,
  HostlyTextarea,
} from "@/components/ui/hostly";
import {
  listenProductsForInventory,
  type ProductDocument,
} from "@/lib/firestore/products";
import {
  MERMA_MOTIVOS,
  formatFechaMerma,
  loadMermas,
  type MermaLocal,
  type MermaMotivo,
} from "@/lib/mermas-local";

type WasteRecord = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  reason: MermaMotivo;
  notes: string | null;
  occurredOn: string;
  stockBefore: number;
  stockAfter: number;
  createdAt: number | null;
  createdBy: string | null;
};

type InventoryProduct = {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  costPerUnit: number;
};

type DisplayWaste = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  reason: MermaMotivo;
  notes: string | null;
  occurredOn: string;
  source: "canonical" | "legacy";
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parsePositiveNumber(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function reasonLabel(reason: MermaMotivo): string {
  return reason
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function mapProduct(product: ProductDocument): InventoryProduct | null {
  if (product.inventory.enabled !== true) return null;
  return {
    id: product.id,
    name: product.name || "Sin nombre",
    unit: product.inventory.unit || "ud",
    currentStock: Number.isFinite(product.inventory.currentStock)
      ? product.inventory.currentStock
      : 0,
    costPerUnit: Number.isFinite(product.inventory.costPerUnit)
      ? product.inventory.costPerUnit
      : 0,
  };
}

function legacyToDisplay(item: MermaLocal): DisplayWaste {
  return {
    id: `legacy-${item.id}`,
    productId: item.producto_stock_id,
    productName: item.producto_stock_nombre || item.producto_stock_id,
    quantity: item.cantidad,
    unit: item.unidad === "uds" ? "ud" : item.unidad,
    reason: item.motivo,
    notes: item.notas ?? null,
    occurredOn: item.fecha,
    source: "legacy",
  };
}

function canonicalToDisplay(item: WasteRecord): DisplayWaste {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unit: item.unit,
    reason: item.reason,
    notes: item.notes,
    occurredOn: item.occurredOn,
    source: "canonical",
  };
}

function apiErrorMessage(code: string): string {
  switch (code) {
    case "INSUFFICIENT_STOCK":
      return "Stock insuficiente para registrar esta merma.";
    case "INVENTORY_DISABLED":
      return "El producto ya no está habilitado en inventario.";
    case "PRODUCT_NOT_FOUND":
      return "El producto ya no existe en el inventario central.";
    case "INVENTORY_EDIT_REQUIRED":
      return "No tienes permiso para registrar mermas.";
    case "UNAUTHORIZED":
      return "La sesión ha caducado. Vuelve a iniciar sesión.";
    default:
      return "No se pudo registrar la merma. Inténtalo de nuevo.";
  }
}

export default function CanonicalMermasSection() {
  const { t } = useI18n();
  const { user, restaurantId, ready, profileReady } = useAuth();
  const { can } = useHostlyCapabilities();
  const canViewInventory = can("inventory.view");
  const canEditInventory = can("inventory.edit");

  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [canonical, setCanonical] = useState<WasteRecord[]>([]);
  const [legacy, setLegacy] = useState<MermaLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<MermaMotivo>("otro");
  const [notes, setNotes] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [search, setSearch] = useState("");

  const loadCanonical = useCallback(async () => {
    if (!user || !canViewInventory) return;
    const token = await user.getIdToken();
    const response = await fetch("/api/inventory/waste", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; items?: WasteRecord[]; error?: string }
      | null;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || "WASTE_LIST_FAILED");
    }
    setCanonical(Array.isArray(body.items) ? body.items : []);
  }, [canViewInventory, user]);

  useEffect(() => {
    setLegacy(loadMermas());
  }, []);

  useEffect(() => {
    if (!ready || !profileReady) return;
    if (!restaurantId || !canViewInventory) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const unsubscribe = listenProductsForInventory(
      restaurantId,
      (items) => {
        const next = items
          .map(mapProduct)
          .filter((item): item is InventoryProduct => item != null)
          .sort((a, b) => a.name.localeCompare(b.name, "es"));
        setProducts(next);
      },
      () => setLoadError("No se pudo cargar el inventario central."),
    );
    void loadCanonical()
      .catch(() => setLoadError("No se pudo cargar el historial de mermas."))
      .finally(() => setLoading(false));
    return unsubscribe;
  }, [canViewInventory, loadCanonical, profileReady, ready, restaurantId]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [productId, products],
  );

  const displayItems = useMemo<DisplayWaste[]>(() => {
    const items = [
      ...canonical.map(canonicalToDisplay),
      ...legacy.map(legacyToDisplay),
    ];
    const query = search.trim().toLocaleLowerCase("es");
    return items
      .filter((item) => {
        if (!query) return true;
        return [item.productName, item.productId, item.reason, item.notes ?? "", item.occurredOn]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(query);
      })
      .sort((a, b) => {
        if (a.occurredOn !== b.occurredOn) return b.occurredOn.localeCompare(a.occurredOn);
        return b.id.localeCompare(a.id);
      });
  }, [canonical, legacy, search]);

  const lostCost = useMemo(() => {
    const costByProduct = new Map(products.map((product) => [product.id, product.costPerUnit]));
    return canonical.reduce(
      (sum, item) => sum + item.quantity * (costByProduct.get(item.productId) ?? 0),
      0,
    );
  }, [canonical, products]);

  const topProduct = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of canonical) {
      totals.set(item.productName, (totals.get(item.productName) ?? 0) + item.quantity);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  }, [canonical]);

  const topReason = useMemo(() => {
    const totals = new Map<MermaMotivo, number>();
    for (const item of canonical) {
      totals.set(item.reason, (totals.get(item.reason) ?? 0) + 1);
    }
    const value = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return value ? reasonLabel(value) : "—";
  }, [canonical]);

  function resetForm() {
    setProductId("");
    setQuantity("");
    setReason("otro");
    setNotes("");
    setOccurredOn(todayIso());
    setFormError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || !canEditInventory) return;
    setFormError(null);
    const parsedQuantity = parsePositiveNumber(quantity);
    if (!productId) {
      setFormError("Selecciona un producto del inventario central.");
      return;
    }
    if (parsedQuantity == null) {
      setFormError("La cantidad debe ser mayor que cero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
      setFormError("Selecciona una fecha válida.");
      return;
    }
    if (selectedProduct && parsedQuantity > selectedProduct.currentStock) {
      setFormError(
        `Stock insuficiente: hay ${selectedProduct.currentStock} ${selectedProduct.unit}.`,
      );
      return;
    }

    setSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/inventory/waste", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          quantity: parsedQuantity,
          reason,
          notes: notes.trim() || null,
          occurredOn,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || "WASTE_CREATE_FAILED");
      }
      await loadCanonical();
      resetForm();
      setFormOpen(false);
    } catch (error) {
      setFormError(apiErrorMessage(error instanceof Error ? error.message : "WASTE_CREATE_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <ModulePageShell
      {...inventoryHubShellLayout}
      title={t("mermas.title")}
      subtitle="Mermas conectadas al inventario central y registradas con trazabilidad."
      headerBelow={<InventarioRouteTabs />}
    >
      {children}
    </ModulePageShell>
  );

  if (!ready || !profileReady || loading) {
    return shell(
      <div className="hostly-ds-state is-embedded" role="status">
        Cargando mermas…
      </div>,
    );
  }

  if (!restaurantId || !canViewInventory) {
    return shell(
      <HostlyPermissionState embedded>
        No tienes permiso para consultar el inventario y sus mermas.
      </HostlyPermissionState>,
    );
  }

  return shell(
    <div style={{ height: "100%", minHeight: 0, overflow: "auto", paddingBottom: 12 }}>
      <HostlySection stack="sm">
        {loadError ? <HostlyAlert tone="danger">{loadError}</HostlyAlert> : null}
        {legacy.length > 0 ? (
          <HostlyAlert tone="info" title="Histórico local conservado">
            Hay {legacy.length} registro{legacy.length === 1 ? "" : "s"} anterior{legacy.length === 1 ? "" : "es"}. Se muestran en solo lectura y no vuelven a modificar stock.
          </HostlyAlert>
        ) : null}

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <HostlyKpiCard
            title="Mermas canónicas"
            value={canonical.length}
            helper="Persistidas y auditables"
            accentColor="#60a5fa"
          />
          <HostlyKpiCard
            title="Coste registrado"
            value={`${lostCost.toFixed(2)} €`}
            helper="Según coste unitario actual"
            accentColor="#fbbf24"
          />
          <HostlyKpiCard
            title="Producto con más merma"
            value={topProduct}
            helper="Historial canónico"
            accentColor="#a78bfa"
          />
          <HostlyKpiCard
            title="Motivo principal"
            value={topReason}
            helper="Historial canónico"
            accentColor="var(--hostly-ink-muted)"
          />
        </div>

        {canEditInventory ? (
          <HostlySurface variant="flat" style={{ padding: 12 }}>
            <HostlySectionHeader
              title="Registrar merma"
              description="El descuento de stock y el movimiento de inventario se guardan juntos en una única operación."
            >
              <HostlyButton
                variant={formOpen ? "ghost" : "primary"}
                onClick={() => {
                  setFormOpen((value) => !value);
                  setFormError(null);
                }}
              >
                {formOpen ? "Cerrar" : "Nueva merma"}
              </HostlyButton>
            </HostlySectionHeader>

            {formOpen ? (
              <form onSubmit={submit} className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <HostlyField label="Producto">
                  <HostlySelect
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                    disabled={saving}
                  >
                    <option value="">Selecciona producto</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.currentStock} {product.unit}
                      </option>
                    ))}
                  </HostlySelect>
                </HostlyField>
                <HostlyField
                  label="Cantidad"
                  hint={selectedProduct ? `Disponible: ${selectedProduct.currentStock} ${selectedProduct.unit}` : undefined}
                >
                  <HostlyInput
                    inputMode="decimal"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    disabled={saving}
                    placeholder="0"
                  />
                </HostlyField>
                <HostlyField label="Motivo">
                  <HostlySelect
                    value={reason}
                    onChange={(event) => setReason(event.target.value as MermaMotivo)}
                    disabled={saving}
                  >
                    {MERMA_MOTIVOS.map((value) => (
                      <option key={value} value={value}>{reasonLabel(value)}</option>
                    ))}
                  </HostlySelect>
                </HostlyField>
                <HostlyField label="Fecha">
                  <HostlyInput
                    type="date"
                    value={occurredOn}
                    onChange={(event) => setOccurredOn(event.target.value)}
                    disabled={saving}
                  />
                </HostlyField>
                <div className="flex items-end">
                  <HostlyButton type="submit" variant="primary" disabled={saving || products.length === 0}>
                    {saving ? "Guardando…" : "Registrar"}
                  </HostlyButton>
                </div>
                <div className="md:col-span-2 lg:col-span-5">
                  <HostlyField label="Notas">
                    <HostlyTextarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      disabled={saving}
                      rows={2}
                      maxLength={500}
                      placeholder="Opcional"
                    />
                  </HostlyField>
                  {formError ? <HostlyAlert tone="danger" className="mt-2">{formError}</HostlyAlert> : null}
                </div>
              </form>
            ) : null}
          </HostlySurface>
        ) : (
          <HostlyAlert tone="neutral">
            Puedes consultar el historial, pero tu rol no puede registrar nuevas mermas.
          </HostlyAlert>
        )}

        <HostlySurface variant="flat" style={{ padding: 12 }}>
          <HostlySectionHeader
            title="Historial"
            description="Los registros canónicos son auditables; los anteriores se conservan como archivo local de solo lectura."
          >
            <HostlyInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto, motivo o nota"
              aria-label="Buscar mermas"
              style={{ minWidth: 260 }}
            />
          </HostlySectionHeader>

          {displayItems.length === 0 ? (
            <HostlyOperationalEmptyState
              title="Sin mermas registradas"
              text="Cuando registres una merma aparecerá aquí y el stock central quedará actualizado en la misma operación."
            />
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--hostly-line)] text-left text-[var(--hostly-ink-muted)]">
                    <th className="px-2 py-2 font-semibold">Fecha</th>
                    <th className="px-2 py-2 font-semibold">Producto</th>
                    <th className="px-2 py-2 font-semibold">Cantidad</th>
                    <th className="px-2 py-2 font-semibold">Motivo</th>
                    <th className="px-2 py-2 font-semibold">Notas</th>
                    <th className="px-2 py-2 font-semibold">Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--hostly-table-divider-soft)] last:border-0">
                      <td className="px-2 py-2 tabular-nums">{formatFechaMerma(item.occurredOn)}</td>
                      <td className="px-2 py-2 font-medium">{item.productName}</td>
                      <td className="px-2 py-2 tabular-nums">{item.quantity} {item.unit}</td>
                      <td className="px-2 py-2">{reasonLabel(item.reason)}</td>
                      <td className="px-2 py-2 text-[var(--hostly-ink-muted)]">{item.notes || "—"}</td>
                      <td className="px-2 py-2">
                        <span className={item.source === "canonical" ? "hostly-status-pill hostly-status-pill--success" : "hostly-status-pill"}>
                          {item.source === "canonical" ? "Canónico" : "Histórico local"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HostlySurface>
      </HostlySection>
    </div>,
  );
}
