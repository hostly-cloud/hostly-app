"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ConfigCard, ConfigCartaWorkbench } from "../../_components/config-carta-workbench";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { loadPlatos, type PlatoCarta } from "@/lib/platos-local";

export default function ConfigCartaEscandallosPage() {
  const restauranteId = useMemo(() => getBrowserRestauranteId()?.trim() ?? "", []);

  const stats = useMemo(() => {
    const base = {
      total: 0,
      con: 0,
      sin: 0,
      activos: 0,
      sinLista: [] as PlatoCarta[],
    };
    if (!restauranteId) return base;
    const platos = loadPlatos(restauranteId);
    const activos = platos.filter((p) => p.activo);
    const con = activos.filter((p) => p.tieneEscandallo === true || p.escandalloSupabaseId != null);
    const sin = activos.filter((p) => !(p.tieneEscandallo === true || p.escandalloSupabaseId != null));
    return {
      total: platos.length,
      con: con.length,
      sin: sin.length,
      activos: activos.length,
      sinLista: sin.slice(0, 12),
    };
  }, [restauranteId]);

  return (
    <ConfigCartaWorkbench
      title="Escandallos y mermas"
      description="Control de coste y margen ligado al catálogo local. El motor completo sigue en Escandallos; aquí un resumen ejecutivo del estado."
    >
      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/escandallos"
          className="inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500"
        >
          Abrir escandallos
        </Link>
        <Link
          href="/dashboard/configuracion/carta/productos"
          className="inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] border border-slate-200/95 bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          Revisar productos
        </Link>
      </div>

      {!restauranteId ? (
        <div className="rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950">
          Selecciona un restaurante para calcular KPIs desde el catálogo local.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          <ConfigCard className="border-slate-200 py-3 shadow-sm">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Productos activos</p>
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-slate-900">{stats.activos}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Total almacén: {stats.total}</p>
          </ConfigCard>
          <ConfigCard className="border-slate-200 bg-emerald-50/40 py-3 shadow-sm">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-emerald-800/90">Con escandallo</p>
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-emerald-950">{stats.con}</p>
            <p className="mt-0.5 text-[10px] text-emerald-900/70">Local / Supabase según datos.</p>
          </ConfigCard>
          <ConfigCard className="border-slate-200 bg-amber-50/35 py-3 shadow-sm">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-amber-950/85">Sin escandallo</p>
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-amber-950">{stats.sin}</p>
            <p className="mt-0.5 text-[10px] text-amber-900/75">Prioriza alto coste o ticket medio.</p>
          </ConfigCard>
        </div>
      )}

      {restauranteId && stats.sinLista.length > 0 ? (
        <ConfigCard>
          <h2 className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Sin escandallo (muestra)</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {stats.sinLista.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-xs text-slate-800">
                <span className="truncate font-medium">{p.nombre}</span>
                <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {p.categoria}
                </span>
              </li>
            ))}
          </ul>
          {stats.sin > stats.sinLista.length ? (
            <p className="mt-1.5 text-[10px] text-slate-500">+{stats.sin - stats.sinLista.length} más en Productos.</p>
          ) : null}
        </ConfigCard>
      ) : restauranteId && stats.sin === 0 && stats.activos > 0 ? (
        <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950">
          Todos los activos tienen señal de escandallo o vínculo Supabase.
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] leading-snug text-slate-700">
        <span className="font-medium text-slate-900">Mermas: </span>
        prevé pérdidas por fileteado o cocción; la UI detallada vive en Escandallos.
      </div>
    </ConfigCartaWorkbench>
  );
}
