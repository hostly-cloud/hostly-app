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
    <div className="hostly-sala-editor-inspector">
      <section className="hostly-sala-editor-inspector__section">
        <h4 className="hostly-sala-editor-inspector__section-title">Instancia</h4>
        <dl className="hostly-sala-editor-inspector__card grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
          <div className="col-span-2">
            <dt className="font-bold text-slate-600">Nombre</dt>
            <dd className="font-semibold text-slate-800">{instance.name}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">Tipo</dt>
            <dd className="font-semibold text-slate-800">
              {catalogItem?.label ?? instance.elementType}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">Capacidad</dt>
            <dd className="font-semibold text-slate-800">
              {instance.capacity > 0 ? `${instance.capacity} pax` : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">X</dt>
            <dd className="font-mono font-semibold text-slate-600">
              {Math.round(instance.position.x)}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">Y</dt>
            <dd className="font-mono font-semibold text-slate-600">
              {Math.round(instance.position.y)}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">Rotación</dt>
            <dd className="font-mono font-semibold text-slate-600">{instance.rotation}°</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
