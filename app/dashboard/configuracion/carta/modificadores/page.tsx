"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfigCard, ConfigCartaWorkbench } from "../../_components/config-carta-workbench";
import { fetchModifierFamiliesForRestaurante } from "@/lib/modificadores/default-modifier-family";
import type { ModifierFamilyRow } from "@/lib/modificadores/default-modifier-family";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";

const CAPABILITIES = [
  { title: "Extras y suplementos", body: "Importe fijo o relativo al plato base." },
  { title: "Punto de cocción", body: "Poco hecho / hecho / muy hecho con un solo grupo." },
  { title: "Guarniciones y salsas", body: "Listas rápidas en TPV con límite de selección." },
  { title: "Grupos reutilizables", body: "Asigna el mismo grupo a varios productos." },
];

export default function ConfigCartaModificadoresPage() {
  const restauranteId = useMemo(() => getBrowserRestauranteId()?.trim() ?? "", []);
  const [families, setFamilies] = useState<ModifierFamilyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!restauranteId) {
      setFamilies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchModifierFamiliesForRestaurante(restauranteId);
      setFamilies(list);
    } finally {
      setLoading(false);
    }
  }, [restauranteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ConfigCartaWorkbench
      title="Modificadores"
      description="Hostly separa familias de modificadores (bebidas vs platos) de los grupos concretos que ves en TPV: extras, cocción, salsas y suplementos. Esta área centralizará el diseño de grupos; hoy la asignación vive en cada producto."
    >
      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/configuracion/carta/productos"
          className="inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500"
        >
          Gestionar en Productos
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ConfigCard>
          <h2 className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Familias detectadas</h2>
          {!restauranteId ? (
            <p className="mt-2 text-xs text-amber-900">Selecciona restaurante para cargar datos.</p>
          ) : loading ? (
            <p className="mt-2 text-xs text-slate-500">Cargando…</p>
          ) : families.length === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Sin familias en almacén local o remoto. Se crearán al usar productos con modificadores o al completar onboarding.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {families.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs text-slate-800"
                >
                  <span className="truncate font-medium">{f.nombre?.trim() || "Sin nombre"}</span>
                  <span className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
                    {f.id.slice(0, 8)}…
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ConfigCard>

        <ConfigCard>
          <h2 className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Casos de uso TPV</h2>
          <ul className="mt-2 grid gap-2">
            {CAPABILITIES.map((c) => (
              <li key={c.title} className="rounded-md border border-slate-200 bg-slate-50/70 px-2.5 py-2">
                <p className="text-xs font-medium text-slate-900">{c.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{c.body}</p>
              </li>
            ))}
          </ul>
        </ConfigCard>
      </div>

      <p className="text-[11px] leading-snug text-slate-500">
        Próximo paso: editor de grupos enlazado a la misma API que consume Productos, sin duplicar reglas de venta.
      </p>
    </ConfigCartaWorkbench>
  );
}
