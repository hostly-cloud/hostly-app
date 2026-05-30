"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfigCard, ConfigCartaWorkbench, ConfigBtnSecondary } from "../../_components/config-carta-workbench";
import { fetchCartaCategorias, fetchCartaFamilias } from "@/lib/carta-categorias/api-client";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { loadPlatos } from "@/lib/platos-local";
import { FamiliasCartaDataView } from "@/components/carta/familias-carta-data-view";

export default function ConfigCartaFamiliasPage() {
  const restauranteId = useMemo(() => getBrowserRestauranteId()?.trim() ?? "", []);
  const [items, setItems] = useState<CartaFamilia[]>([]);
  const [categorias, setCategorias] = useState<CartaCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!restauranteId) {
      setItems([]);
      setCategorias([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [list, cats] = await Promise.all([
        fetchCartaFamilias(restauranteId),
        fetchCartaCategorias(restauranteId),
      ]);
      setItems(list);
      setCategorias(cats);
    } catch {
      setError("No se pudieron cargar las familias.");
      setItems([]);
      setCategorias([]);
    } finally {
      setLoading(false);
    }
  }, [restauranteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stats = useMemo(() => {
    if (!restauranteId) {
      return { activeFamilies: 0, linkedCategories: 0, organizedProducts: 0 };
    }
    const activeFamilies = items.filter((f) => f.isActive).length;
    const linkedCategories = categorias.filter((c) => Boolean(c.cartaFamiliaId?.trim())).length;
    const platos = loadPlatos(restauranteId);
    const organizedProducts = platos.filter((p) => Boolean(p.categoriaCartaId?.trim())).length;
    return { activeFamilies, linkedCategories, organizedProducts };
  }, [restauranteId, items, categorias]);

  return (
    <ConfigCartaWorkbench
      title="Familias de menú"
      description="Las familias agrupan categorías (por ejemplo Platos y Bebidas) para ordenar la carta en Hostly y alimentar reglas de TPV. La creación avanzada seguirá evolucionando aquí; de momento puedes revisar el inventario y enlazar con Productos."
    >
      <div className="hostly-carta-config-actions-row">
        <Link
          href="/dashboard/configuracion/carta/productos"
          className="hostly-button-primary hostly-button-compact"
        >
          Ir a Productos
        </Link>
        <ConfigBtnSecondary disabled title="Próximamente: alta desde esta pantalla" className="cursor-not-allowed opacity-50">
          Nueva familia
        </ConfigBtnSecondary>
        <Link
          href="/dashboard/configuracion/carta/importacion"
          className="hostly-button-secondary hostly-button-compact"
        >
          IA e importación
        </Link>
      </div>

      {!restauranteId ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">
          Selecciona un restaurante para listar familias.
        </div>
      ) : null}

      {error ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--error">{error}</div>
      ) : null}

      {restauranteId && !loading && !error ? (
        <div className="hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense">
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Familias activas</span>
            <span className="hostly-carta-config-kpi-pill__value">{stats.activeFamilies}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Categorías vinculadas</span>
            <span className="hostly-carta-config-kpi-pill__value">{stats.linkedCategories}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Productos organizados</span>
            <span className="hostly-carta-config-kpi-pill__value">{stats.organizedProducts}</span>
          </div>
        </div>
      ) : null}

      <div className="hostly-carta-config-layout-panels">
        <ConfigCard flush>
          <FamiliasCartaDataView items={items} loading={loading} />
        </ConfigCard>

        <ConfigCard compact className="hostly-carta-config-card--muted">
          <p className="hostly-carta-config-section-title">Relación</p>
          <p className="hostly-carta-config-section-body">
            Las categorías pueden enlazarse a una familia para ordenar la carta y agrupar reglas en TPV.
          </p>
          <p className="hostly-carta-config-form-hint">Alta desde esta pantalla: en cuanto el endpoint esté enlazado.</p>
        </ConfigCard>
      </div>
    </ConfigCartaWorkbench>
  );
}
