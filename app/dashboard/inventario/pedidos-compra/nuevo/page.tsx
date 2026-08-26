"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import ModulePageShell from "@/components/module-page-shell";
import { listenProductsForInventory, type ProductDocument } from "@/lib/firestore/products";
import { createManualPurchaseOrder } from "@/lib/firestore/purchase-orders";
import type { PurchaseOrderLine } from "@/lib/purchases/purchase-order-types";

type DraftLine = {
  productId: string;
  quantity: string;
  unitCost: string;
};

const inputStyle = {
  width: "100%",
  minHeight: 40,
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  padding: "8px 10px",
  background: "var(--hostly-surface-card-solid)",
  color: "var(--hostly-ink-strong)",
} as const;

function parsePositive(raw: string): number | null {
  const value = Number(raw.trim().replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default function NuevoPedidoCompraPage() {
  const router = useRouter();
  const { restaurantId, ready, profileReady } = useAuth();
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { productId: "", quantity: "", unitCost: "" },
  ]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !profileReady) return;
    const rid = restaurantId?.trim() ?? "";
    if (!rid) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }
    setLoadingProducts(true);
    return listenProductsForInventory(
      rid,
      (items) => {
        setProducts(items.filter((item) => item.inventory.enabled));
        setLoadingProducts(false);
      },
      () => {
        setError("No se pudo cargar el inventario.");
        setLoadingProducts(false);
      },
    );
  }, [profileReady, ready, restaurantId]);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line, currentIndex) =>
        currentIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function removeLine(index: number) {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  async function handleSave() {
    const rid = restaurantId?.trim() ?? "";
    if (!rid || saving) return;
    setError(null);

    const orderLines: PurchaseOrderLine[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const product = productById.get(line.productId);
      const quantity = parsePositive(line.quantity);
      if (!product || quantity == null) continue;
      if (seen.has(product.id)) {
        setError(`El producto ${product.name} está repetido.`);
        return;
      }
      seen.add(product.id);
      const unitCost = parsePositive(line.unitCost);
      orderLines.push({
        productId: product.id,
        productName: product.name,
        quantity,
        unit: product.inventory.unit,
        receivedQuantity: 0,
        estimatedUnitCost: unitCost,
        estimatedTotalCost: unitCost == null ? null : quantity * unitCost,
        supplierName: supplierName.trim() || product.inventory.supplierName || null,
        currentStock: product.inventory.currentStock,
      });
    }

    if (orderLines.length === 0) {
      setError("Añade al menos un producto y una cantidad válida.");
      return;
    }

    setSaving(true);
    try {
      const result = await createManualPurchaseOrder({
        restaurantId: rid,
        supplierName: supplierName.trim() || null,
        notes: notes.trim() || null,
        lines: orderLines,
      });
      router.push(`/dashboard/inventario/pedidos-compra/${encodeURIComponent(result.purchaseOrderId)}`);
    } catch {
      setError("No se pudo crear el pedido de compra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModulePageShell
      title="Nuevo pedido de compra"
      subtitle="Creación manual · Firestore canónico"
      {...inventoryHubShellLayout}
      headerBelow={<InventarioRouteTabs />}
    >
      <div className="hostly-mobile-op-page-stack">
        <div className="hostly-panel p-4" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
                Pedido manual
              </div>
              <div style={{ marginTop: 3, fontSize: 12, color: "var(--hostly-ink-muted)" }}>
                El pedido se guarda en Firestore y después puede recibirse total o parcialmente.
              </div>
            </div>
            <Link href="/dashboard/inventario/pedidos-compra" style={{ fontSize: 13, fontWeight: 700 }}>
              Volver a pedidos
            </Link>
          </div>

          {error ? (
            <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <label>
              <span style={{ display: "block", marginBottom: 5, fontSize: 12, fontWeight: 700 }}>Proveedor</span>
              <input
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                placeholder="Nombre del proveedor"
                style={inputStyle}
                maxLength={160}
              />
            </label>
            <label>
              <span style={{ display: "block", marginBottom: 5, fontSize: 12, fontWeight: 700 }}>Notas</span>
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Opcional"
                style={inputStyle}
                maxLength={500}
              />
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Productos</div>
            {loadingProducts ? (
              <div style={{ fontSize: 13, color: "var(--hostly-ink-muted)" }}>Cargando inventario…</div>
            ) : null}
            {lines.map((line, index) => {
              const product = productById.get(line.productId);
              return (
                <div
                  key={index}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(180px, 2fr) minmax(90px, .7fr) minmax(110px, .8fr) auto",
                    gap: 8,
                    alignItems: "end",
                  }}
                >
                  <label>
                    <span style={{ display: "block", marginBottom: 5, fontSize: 11, fontWeight: 700 }}>Producto</span>
                    <select
                      value={line.productId}
                      onChange={(event) => patchLine(index, { productId: event.target.value })}
                      style={inputStyle}
                    >
                      <option value="">Seleccionar…</option>
                      {products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · stock {item.inventory.currentStock} {item.inventory.unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span style={{ display: "block", marginBottom: 5, fontSize: 11, fontWeight: 700 }}>
                      Cantidad {product ? `(${product.inventory.unit})` : ""}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(event) => patchLine(index, { quantity: event.target.value })}
                      style={inputStyle}
                    />
                  </label>
                  <label>
                    <span style={{ display: "block", marginBottom: 5, fontSize: 11, fontWeight: 700 }}>Coste/u €</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.unitCost}
                      onChange={(event) => patchLine(index, { unitCost: event.target.value })}
                      placeholder={product?.inventory.costPerUnit ? String(product.inventory.costPerUnit) : "Opcional"}
                      style={inputStyle}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    disabled={lines.length <= 1}
                    style={{ minHeight: 40, padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(148,163,184,.28)" }}
                  >
                    Quitar
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, { productId: "", quantity: "", unitCost: "" }])}
              style={{ minHeight: 40, padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(148,163,184,.28)" }}
            >
              + Añadir producto
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loadingProducts}
              style={{ minHeight: 40, padding: "8px 16px", borderRadius: 10, border: 0, background: "var(--hostly-ink-strong)", color: "white", fontWeight: 800 }}
            >
              {saving ? "Creando…" : "Crear pedido"}
            </button>
          </div>
        </div>
      </div>
    </ModulePageShell>
  );
}
