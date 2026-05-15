"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfigCard, ConfigCartaWorkbench, ConfigBtnSecondary } from "../../_components/config-carta-workbench";
import { fetchCartaCategorias } from "@/lib/carta-categorias/api-client";
import type { CartaCategoria, CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { CARTA_CATEGORIAS_CHANGED_EVENT } from "@/lib/carta-categorias/local-store";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { loadPlatos } from "@/lib/platos-local";

function tipoLabel(t: CartaCategoriaTipo): string {
  if (t === "food") return "Comida";
  if (t === "drink") return "Bebida";
  return "General";
}

export default function ConfigCartaCategoriasPage() {
  const restauranteId = useMemo(() => getBrowserRestauranteId()?.trim() ?? "", []);
  const [items, setItems] = useState<CartaCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!restauranteId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchCartaCategorias(restauranteId);
      setItems(list);
    } catch {
      setError("No se pudieron cargar las categorías. Revisa la conexión.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [restauranteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChanged = () => void refresh();
    window.addEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const countsByCatId = useMemo(() => {
    if (!restauranteId) return new Map<string, number>();
    const platos = loadPlatos(restauranteId);
    const m = new Map<string, number>();
    for (const p of platos) {
      const id = p.categoriaCartaId?.trim();
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [restauranteId, items]);

  return (
    <ConfigCartaWorkbench
      title="Categorías de carta"
      description="Orden, visibilidad y vínculo con productos. La edición masiva de platos sigue centralizada en Productos; aquí tienes una vista clara del catálogo estructurado."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/configuracion/carta/productos"
          className="inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500"
        >
          Ir a Productos
        </Link>
        <ConfigBtnSecondary disabled={loading || !restauranteId} onClick={() => void refresh()}>
          Recargar
        </ConfigBtnSecondary>
      </div>

      {!restauranteId ? (
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          Selecciona un restaurante en la barra superior para ver categorías.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200/90 bg-red-50/90 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <ConfigCard flush>
        <div className="hostly-config-table-head grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.5fr)_minmax(0,0.45fr)_minmax(0,0.45fr)_minmax(0,0.55fr)] gap-2 px-4 py-2.5">
          <span>Nombre</span>
          <span>Tipo</span>
          <span>Orden</span>
          <span>Estado</span>
          <span className="text-right">Productos</span>
        </div>
        <div className="max-h-[min(52vh,520px)] overflow-auto">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">Cargando categorías…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-semibold text-slate-900">Aún no hay categorías registradas</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-600">
                Crea la primera desde Productos o importa una carta con IA. Las categorías definen cómo se agrupa el menú en TPV y reservas.
              </p>
              <Link
                href="/dashboard/configuracion/carta/productos"
                className="mt-5 inline-flex rounded-[var(--hostly-config-radius)] border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                Abrir Productos
              </Link>
            </div>
          ) : (
            items.map((c) => {
              const n = countsByCatId.get(c.id) ?? 0;
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.5fr)_minmax(0,0.45fr)_minmax(0,0.45fr)_minmax(0,0.55fr)] items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-xs text-slate-700 last:border-0"
                >
                  <span className="truncate font-medium text-slate-900">{c.name}</span>
                  <span className="text-slate-500">{tipoLabel(c.type)}</span>
                  <span className="tabular-nums text-slate-500">{c.sortOrder}</span>
                  <span>
                    {c.isActive ? (
                      <span className="inline-flex rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Activa
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        Inactiva
                      </span>
                    )}
                  </span>
                  <span className="text-right tabular-nums text-slate-500">{n}</span>
                </div>
              );
            })
          )}
        </div>
      </ConfigCard>

      <p className="text-[11px] leading-relaxed text-slate-600">
        El recuento de productos usa los vínculos guardados en cada artículo (
        <span className="font-mono text-[10px] text-slate-500">categoriaCartaId</span>). Los datos legados solo con texto de categoría pueden mostrar 0 hasta normalizar en Productos.
      </p>
    </ConfigCartaWorkbench>
  );
}
