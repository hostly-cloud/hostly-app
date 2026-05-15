"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfigCard, ConfigCartaWorkbench, ConfigBtnSecondary } from "../../_components/config-carta-workbench";
import { fetchCartaCategorias, fetchCartaFamilias } from "@/lib/carta-categorias/api-client";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { loadPlatos } from "@/lib/platos-local";

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
      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/configuracion/carta/productos"
          className="inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500"
        >
          Ir a Productos
        </Link>
        <ConfigBtnSecondary disabled title="Próximamente: alta desde esta pantalla" className="cursor-not-allowed opacity-50">
          Nueva familia
        </ConfigBtnSecondary>
        <Link
          href="/dashboard/configuracion/carta/importacion"
          className="inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] border border-slate-200/95 bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          IA e importación
        </Link>
      </div>

      {!restauranteId ? (
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          Selecciona un restaurante para listar familias.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200/90 bg-red-50/90 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}

      {restauranteId && !loading && !error ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          <div className="rounded-[var(--hostly-config-radius)] border border-slate-200 bg-white px-3 py-2 shadow-[var(--hostly-config-card-shadow)]">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Familias activas</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-slate-900">{stats.activeFamilies}</p>
          </div>
          <div className="rounded-[var(--hostly-config-radius)] border border-slate-200 bg-white px-3 py-2 shadow-[var(--hostly-config-card-shadow)]">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Categorías vinculadas</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-slate-900">{stats.linkedCategories}</p>
          </div>
          <div className="rounded-[var(--hostly-config-radius)] border border-slate-200 bg-white px-3 py-2 shadow-[var(--hostly-config-card-shadow)]">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Productos organizados</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-slate-900">{stats.organizedProducts}</p>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
        <ConfigCard flush>
          <div className="hostly-config-table-head grid grid-cols-[minmax(0,1fr)_minmax(0,0.4fr)_minmax(0,0.45fr)] gap-2 px-4 py-2.5">
            <span>Nombre</span>
            <span>Orden</span>
            <span>Estado</span>
          </div>
          <div className="max-h-[min(48vh,480px)] overflow-auto">
            {loading ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Cargando…</div>
            ) : items.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  FM
                </div>
                <p className="mt-4 text-sm font-semibold tracking-tight text-slate-900">Sin familias todavía</p>
                <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
                  Importa carta con IA o estructura categorías; aquí aparecerá el listado.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <Link
                    href="/dashboard/configuracion/carta/importacion"
                    className="inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500"
                  >
                    IA e importación
                  </Link>
                  <Link
                    href="/dashboard/configuracion/carta/categorias"
                    className="inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Categorías
                  </Link>
                </div>
              </div>
            ) : (
              items.map((f) => (
                <div
                  key={f.id}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.4fr)_minmax(0,0.45fr)] items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm text-slate-700 last:border-0"
                >
                  <span className="truncate font-medium text-slate-900">{f.name}</span>
                  <span className="tabular-nums text-slate-500">{f.sortOrder}</span>
                  <span>
                    {f.isActive ? (
                      <span className="inline-flex rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Activa
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        Inactiva
                      </span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </ConfigCard>

        <ConfigCard className="border-slate-200 bg-slate-50/40 p-4 shadow-[var(--hostly-config-card-shadow)]">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Relación</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Las categorías pueden enlazarse a una familia para ordenar la carta y agrupar reglas en TPV.
          </p>
          <p className="mt-3 text-[10px] leading-snug text-slate-500">Alta desde esta pantalla: en cuanto el endpoint esté enlazado.</p>
        </ConfigCard>
      </div>
    </ConfigCartaWorkbench>
  );
}
