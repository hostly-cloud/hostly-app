import { HostlyCard } from "@/components/ui/hostly/HostlyCard";
import { HostlySurface } from "@/components/ui/hostly/HostlySurface";
import { HostlyStatusBadge } from "@/components/ui/hostly/data-table/HostlyStatusBadge";
import { ConfigModulePageHeader } from "../../../_components/config-module-page-header";

const importSources = [
  {
    title: "Foto",
    icon: "📷",
    description: "Arrastra una foto de la carta o selecciónala cuando el flujo esté activo.",
  },
  {
    title: "PDF",
    icon: "📄",
    description: "Preparado para cartas digitales, escaneadas o enviadas por proveedores.",
  },
  {
    title: "Página web",
    icon: "🌐",
    description: "Pensado para importar desde una URL pública de la carta del restaurante.",
  },
  {
    title: "Código QR",
    icon: "🔗",
    description: "Reservado para resolver el QR y continuar por el mismo pipeline.",
  },
  {
    title: "Texto pegado",
    icon: "📋",
    description: "Para copiar una carta desde un documento, email o web y revisarla aquí.",
  },
] as const;

const progressSteps = [
  { label: "Preparando importación", done: true },
  { label: "Analizando documento", done: false },
  { label: "Detectando categorías", done: false },
  { label: "Detectando productos", done: false },
  { label: "Validando información", done: false },
  { label: "Preparando borrador", done: false },
] as const;

const expectedOutputs = [
  "Categorías",
  "Productos",
  "Precios",
  "Descripciones",
  "Familias",
  "Destinos",
  "IVA",
  "Alérgenos",
  "Variantes",
  "Extras",
  "Menús",
] as const;

const futurePreviews = ["Preview TPV", "Preview Cocina", "Preview Barra"] as const;

export function ImportWorkspacePageContent() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--hostly-surface-page)] text-[var(--hostly-ink)]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[var(--hostly-page-pad-x)] py-[var(--hostly-page-pad-y)]">
        <div className="hostly-config-page-body mx-auto flex w-full max-w-6xl flex-col gap-3">
        <ConfigModulePageHeader
          secondaryActions={<HostlyStatusBadge tone="info">Workspace futuro</HostlyStatusBadge>}
        />

        <HostlySurface
          variant="ice"
          className="hostly-config-import-workspace-source-panel border border-[rgba(148,163,184,0.2)] p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] sm:p-6"
        >
          <section aria-labelledby="import-workspace-source-title" className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="hostly-section-label hostly-type-caption">Elige una entrada</p>
                <h2
                  id="import-workspace-source-title"
                  className="hostly-heading hostly-type-section-title"
                >
                  Un solo espacio para cualquier carta
                </h2>
              </div>
              <p className="hostly-muted text-sm font-semibold">Sin conexión todavía. Las tarjetas están preparadas visualmente para drag & drop.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {importSources.map((source) => (
                <div
                  key={source.title}
                  className="hostly-config-import-source-card group flex min-h-[210px] flex-col justify-between rounded-[28px] border border-dashed border-[rgba(148,163,184,0.5)] bg-white/82 p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(59,130,246,0.34)] hover:bg-white hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--hostly-surface-soft)] text-2xl shadow-inner">
                      {source.icon}
                    </span>
                    <span className="rounded-full border border-[var(--hostly-line)] bg-[var(--hostly-surface-soft)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--hostly-ink-muted)]">
                      Próximamente
                    </span>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-black tracking-[-0.02em] text-[var(--hostly-ink)]">{source.title}</h3>
                    <p className="text-sm font-semibold leading-5 text-[var(--hostly-ink-muted)]">{source.description}</p>
                    <div className="mt-4 rounded-2xl border border-[rgba(148,163,184,0.22)] bg-[rgba(248,250,252,0.72)] px-3 py-2 text-xs font-bold text-[var(--hostly-ink-muted)] group-hover:border-[rgba(59,130,246,0.18)]">
                      Arrastrar aquí
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </HostlySurface>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <HostlyCard family="configuration" className="p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="hostly-section-label hostly-type-caption">Asistente</p>
                <h2 className="hostly-heading hostly-type-section-title">Hostly está preparando tu workspace</h2>
                <p className="hostly-muted mt-2 text-sm font-semibold leading-6">
                  Este bloque reservará el seguimiento del análisis cuando la IA esté conectada.
                </p>
              </div>
              <HostlyStatusBadge tone="muted">Placeholder</HostlyStatusBadge>
            </div>
            <ol className="mt-6 space-y-3">
              {progressSteps.map((step) => (
                <li key={step.label} className="flex items-center gap-3 rounded-2xl bg-[var(--hostly-surface-soft)] px-4 py-3">
                  <span
                    className={
                      step.done
                        ? "flex h-7 w-7 items-center justify-center rounded-full bg-[var(--hostly-accent)] text-sm font-black text-white"
                        : "flex h-7 w-7 items-center justify-center rounded-full border border-[var(--hostly-line)] bg-white text-sm font-black text-[var(--hostly-ink-muted)]"
                    }
                    aria-hidden
                  >
                    {step.done ? "✓" : "○"}
                  </span>
                  <span className="text-sm font-bold text-[var(--hostly-ink)]">{step.label}</span>
                </li>
              ))}
            </ol>
          </HostlyCard>

          <HostlyCard family="configuration" className="p-6 sm:p-7">
            <p className="hostly-section-label hostly-type-caption">Qué obtendrás</p>
            <h2 className="hostly-heading hostly-type-section-title">Un borrador listo para revisar</h2>
            <p className="hostly-muted mt-2 text-sm font-semibold leading-6">
              Hostly organizará la información para que el equipo revise, ajuste y publique con seguridad.
            </p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {expectedOutputs.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--hostly-line)] bg-white/78 px-4 py-3 text-sm font-bold text-[var(--hostly-ink)]"
                >
                  <span className="text-[var(--hostly-accent)]" aria-hidden>
                    ✓
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </HostlyCard>
        </section>

        <HostlyCard family="configuration" className="overflow-hidden p-0">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
            <div className="p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--hostly-surface-soft)] text-2xl">
                  🛡️
                </span>
                <div className="min-w-0">
                  <p className="hostly-section-label hostly-type-caption">Control humano</p>
                  <h2 className="hostly-heading hostly-type-section-title">Nada se publicará automáticamente</h2>
                  <p className="hostly-muted mt-3 max-w-3xl text-sm font-semibold leading-6">
                    Todo se importará primero a un Workspace de revisión. Tú tendrás siempre la última decisión antes de publicar.
                  </p>
                </div>
              </div>
            </div>
            <div className="border-t border-[var(--hostly-line)] bg-[var(--hostly-surface-soft)] p-6 lg:border-l lg:border-t-0">
              <p className="hostly-section-label hostly-type-caption">Próximamente</p>
              <div className="mt-4 grid gap-3">
                {futurePreviews.map((preview) => (
                  <div
                    key={preview}
                    className="rounded-2xl border border-[var(--hostly-line)] bg-white/80 px-4 py-3 text-sm font-black text-[var(--hostly-ink)]"
                  >
                    {preview}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </HostlyCard>

        <p className="pb-4 text-center text-xs font-bold uppercase tracking-[0.16em] text-[var(--hostly-ink-muted)]">
          Import Workspace · Arquitectura visual sin datos conectados
        </p>
        </div>
      </div>
    </main>
  );
}
