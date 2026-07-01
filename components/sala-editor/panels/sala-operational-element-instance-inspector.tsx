"use client";

import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";

export type SalaOperationalElementInstanceInspectorProps = {
  instance: OperationalElementInstance;
};

export function SalaOperationalElementInstanceInspector({
  instance,
}: SalaOperationalElementInstanceInspectorProps) {
  const catalogItem = getOperationalElementCatalogItem(instance.elementType);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-0.5">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">Inspector</h3>
        <p className="mt-1 text-xs text-slate-500">Instancia seleccionada</p>
      </div>

      <section className="space-y-3">
        <h4 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
          Instancia
        </h4>
        <dl className="space-y-2.5 rounded-xl border border-slate-200/80 bg-white px-3 py-3 text-xs">
          <div>
            <dt className="font-bold text-slate-700">Nombre</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">{instance.name}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-700">Tipo</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">
              {catalogItem?.label ?? instance.elementType}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-700">Capacidad</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">
              {instance.capacity > 0 ? `${instance.capacity} personas` : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-700">Posición X</dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-600">
              {Math.round(instance.position.x)} px
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-700">Posición Y</dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-600">
              {Math.round(instance.position.y)} px
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-700">Rotación</dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-600">
              {instance.rotation}°
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
