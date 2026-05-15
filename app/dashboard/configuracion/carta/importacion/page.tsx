"use client";

import Link from "next/link";
import { ConfigCard, ConfigCartaWorkbench } from "../../_components/config-carta-workbench";

const STEPS = [
  {
    title: "Captura",
    body: "Foto nítida o PDF; priorizamos precios y alérgenos legibles.",
  },
  {
    title: "IA + revisión",
    body: "Propuesta de platos y precios antes del catálogo en vivo.",
  },
  {
    title: "Publicación",
    body: "Confirmas en Productos; el TPV lee el mismo modelo.",
  },
];

export default function ConfigCartaImportacionPage() {
  return (
    <ConfigCartaWorkbench
      title="IA e importación"
      description="Importa carta desde foto o PDF, normaliza productos y revisa antes de publicar. Hub de Configuración para equipos que empiezan por la carta."
    >
      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/validacion-inteligente"
          className="inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500"
        >
          Abrir validación / importación
        </Link>
        <Link
          href="/dashboard/configuracion/carta/productos"
          className="inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] border border-slate-200/95 bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          Revisar productos
        </Link>
      </div>

      <div className="relative">
        <div
          className="pointer-events-none absolute left-[10%] right-[10%] top-[14px] hidden h-px bg-slate-200/80 md:block"
          aria-hidden
        />
        <div className="grid gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <ConfigCard key={s.title} className="relative pt-1">
              <div className="flex items-start gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-slate-700 shadow-sm">
                  {i + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{s.title}</p>
                  <p className="mt-1 text-xs leading-snug text-slate-600">{s.body}</p>
                </div>
              </div>
            </ConfigCard>
          ))}
        </div>
      </div>

      <ConfigCard className="border-slate-200 bg-slate-50/50 py-3">
        <p className="text-xs font-medium text-slate-900">Hoja de ruta</p>
        <p className="mt-1 text-[11px] leading-snug text-slate-600">
          Próximas extensiones: facturas proveedor, sugerencias de stock — siempre con revisión explícita.
        </p>
      </ConfigCard>
    </ConfigCartaWorkbench>
  );
}
