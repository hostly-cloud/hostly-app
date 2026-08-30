"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { ProductosCartaReorderControls } from "@/components/productos/productos-table-cells";
import { LegacyCatalogPendingNotice } from "@/components/carta/legacy-catalog-pending-notice";
import {
  ConfigCard,
  ConfigCartaWorkbench,
} from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import { comparePlatoCarta } from "@/lib/carta/product-sort-order";
import { fetchCartaCategorias } from "@/lib/carta-categorias/api-client";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import {
  formatCentralCatalogWriteError,
  swapCentralProductSortOrderInCategory,
} from "@/lib/firestore/products";
import { resolveAuthenticatedRestaurantId } from "@/lib/hostly/restaurant-scope";
import { useAuth } from "@/components/auth/auth-context";
import type { PlatoCarta } from "@/lib/carta/product-sale-contract";

function normCatKey(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function platosInCategory(platos: PlatoCarta[], category: CartaCategoria): PlatoCarta[] {
  return platos.filter((p) => {
    if (p.categoriaCartaId === category.id) return true;
    if (!p.categoriaCartaId) {
      const a = normCatKey(p.categoria ?? "");
      const b = normCatKey(category.name);
      return a === b && a !== "";
    }
    return false;
  });
}

export type CategoriaProductosOrdenViewProps = {
  categoriaId: string;
};

export function CategoriaProductosOrdenView({ categoriaId }: CategoriaProductosOrdenViewProps) {
  const { t, locale } = useI18n();
  const { restaurantId: profileRestaurantId, profileReady } = useAuth();
  const restauranteId = useMemo(
    () => resolveAuthenticatedRestaurantId(profileReady, profileRestaurantId),
    [profileReady, profileRestaurantId],
  );
  const operationalCatalog = useCentralProductsForCarta(restauranteId, {
    scope: "management",
    requireAuthenticatedTenant: true,
  });
  const isCentralCatalog = operationalCatalog.source === "central";

  const [category, setCategory] = useState<CartaCategoria | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [reorderBusyId, setReorderBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const cid = categoriaId.trim();

  useEffect(() => {
    if (!profileReady || !restauranteId || !cid) {
      setCategory(null);
      setCategoryLoading(false);
      return;
    }
    let cancelled = false;
    setCategoryLoading(true);
    setCategoryError(null);
    void fetchCartaCategorias(restauranteId).then((list) => {
      if (cancelled) return;
      const found = list.find((c) => c.id === cid) ?? null;
      setCategory(found);
      if (!found) setCategoryError(t("cartaCategories.orderProductsCategoryNotFound"));
      setCategoryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profileReady, restauranteId, cid, t]);

  const sortedProducts = useMemo(() => {
    if (!category) return [];
    const rows = platosInCategory(operationalCatalog.platos, category);
    return [...rows].sort(comparePlatoCarta);
  }, [category, operationalCatalog.platos]);

  const moveProductInCategory = useCallback(
    async (productId: string, direction: "up" | "down") => {
      if (!restauranteId || reorderBusyId || !isCentralCatalog || sortedProducts.length === 0) {
        return;
      }
      const orderedIds = sortedProducts.map((p) => p.id);
      setReorderBusyId(productId);
      try {
        await swapCentralProductSortOrderInCategory(
          restauranteId,
          productId,
          direction,
          orderedIds,
        );
      } catch (e) {
        setNotice(formatCentralCatalogWriteError(e));
        window.setTimeout(() => setNotice(null), 4200);
      } finally {
        setReorderBusyId(null);
      }
    },
    [restauranteId, reorderBusyId, isCentralCatalog, sortedProducts],
  );

  const formatPrice = (value: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const loading = categoryLoading || operationalCatalog.loading;
  const categoryName = category?.name ?? t("cartaCategories.orderProductsTitle");

  return (
    <ConfigCartaWorkbench
      title={t("cartaCategories.orderProductsTitle")}
      description={categoryName}
      compactSectionHeader={false}
      headerActions={
        <Link
          href="/dashboard/configuracion/carta/categorias"
          className="hostly-carta-config-text-link"
        >
          {t("cartaCategories.backCategories")}
        </Link>
      }
    >
      {!restauranteId ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">
          {t("cartaCategories.orderProductsNoRestaurant")}
        </div>
      ) : null}

      {categoryError ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--error" role="alert">
          {categoryError}
        </div>
      ) : null}

      {notice ? (
        <p className="hostly-carta-config-alert hostly-carta-config-alert--error" role="status">
          {notice}
        </p>
      ) : null}

      {restauranteId ? (
        <LegacyCatalogPendingNotice
          restaurantId={restauranteId}
          catalogSource={operationalCatalog.source}
        />
      ) : null}

      {loading ? (
        <div className="hostly-carta-config-list-loading">{t("cartaCategories.orderProductsLoading")}</div>
      ) : category && !isCentralCatalog ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">
          {t("cartaCategories.orderProductsCentralOnly")}
        </div>
      ) : category && sortedProducts.length === 0 ? (
        <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
          <p className="hostly-carta-config-empty__title">{t("cartaCategories.orderProductsEmptyTitle")}</p>
          <p className="hostly-carta-config-empty__body">{t("cartaCategories.orderProductsEmptyBody")}</p>
          <Link
            href="/dashboard/configuracion/carta/productos"
            className="hostly-button-secondary hostly-button-compact"
          >
            {t("cartaCategories.orderProductsGoProducts")}
          </Link>
        </div>
      ) : category ? (
        <ConfigCard>
          <p className="hostly-productos-reorder-hint" role="status">
            {t("productos.orderModeActiveHint")}
          </p>
          <ul className="hostly-categoria-productos-orden-list">
            {sortedProducts.map((p, idx) => (
              <li key={p.id} className="hostly-categoria-productos-orden-item">
                <div className="hostly-categoria-productos-orden-item__main">
                  <span className="hostly-categoria-productos-orden-item__name" title={p.nombre}>
                    {p.nombre}
                  </span>
                  <span className="hostly-categoria-productos-orden-item__price">
                    {formatPrice(p.precioVenta)}
                  </span>
                </div>
                <ProductosCartaReorderControls
                  canMoveUp={idx > 0}
                  canMoveDown={idx < sortedProducts.length - 1}
                  busy={reorderBusyId === p.id}
                  t={t}
                  onMoveUp={() => void moveProductInCategory(p.id, "up")}
                  onMoveDown={() => void moveProductInCategory(p.id, "down")}
                />
              </li>
            ))}
          </ul>
        </ConfigCard>
      ) : null}
    </ConfigCartaWorkbench>
  );
}
