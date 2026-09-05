"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyButton } from "@/components/ui/hostly/HostlyButton";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type {
  SommelierApiResponse,
  SommelierCatalogItem,
  SommelierPairing,
  SommelierSnapshot,
  SommelierWineProfile,
} from "@/lib/sommelier/sommelier-types";

type Mode = "dish" | "wine";

const STYLE_LABELS: Record<SommelierWineProfile["style"], string> = {
  red: "Tinto",
  white: "Blanco",
  rose: "Rosado",
  sparkling: "Espumoso",
  sweet: "Dulce",
  fortified: "Generoso",
  unknown: "Estilo por confirmar",
};
const BODY_LABELS: Record<SommelierWineProfile["body"], string> = {
  light: "Ligero",
  medium: "Medio",
  full: "Con cuerpo",
  unknown: "Cuerpo por confirmar",
};
const SWEETNESS_LABELS: Record<SommelierWineProfile["sweetness"], string> = {
  dry: "Seco",
  off_dry: "Semiseco",
  sweet: "Dulce",
  unknown: "Dulzor por confirmar",
};

function itemSubtitle(item: SommelierCatalogItem) {
  const parts = [item.categoryName, item.familyName].filter(Boolean);
  if (item.price != null) parts.push(new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(item.price));
  return parts.join(" · ");
}

function emptySnapshot(): SommelierSnapshot {
  return {
    catalogHash: "",
    generatedAtMs: null,
    generatedBy: null,
    model: null,
    source: null,
    wines: [],
    dishes: [],
    pairings: [],
    wineProfiles: {},
  };
}

function PairingScore({ score }: { score: number }) {
  return <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-extrabold text-sky-800">{score}% afinidad</span>;
}

function WineProfileChips({ profile }: { profile?: SommelierWineProfile }) {
  if (!profile) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-xs font-bold text-slate-600">
      <span className="rounded-full bg-slate-100 px-2 py-1">{STYLE_LABELS[profile.style]}</span>
      <span className="rounded-full bg-slate-100 px-2 py-1">{BODY_LABELS[profile.body]}</span>
      <span className="rounded-full bg-slate-100 px-2 py-1">{SWEETNESS_LABELS[profile.sweetness]}</span>
      {profile.grapes.slice(0, 3).map((grape) => <span key={grape} className="rounded-full bg-violet-50 px-2 py-1 text-violet-800">{grape}</span>)}
    </div>
  );
}

function RecommendationCard({
  pairing,
  opposite,
  profile,
}: {
  pairing: SommelierPairing;
  opposite: "wine" | "dish";
  profile?: SommelierWineProfile;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{opposite === "wine" ? "Vino recomendado" : "Plato recomendado"}</p>
          <h3 className="mt-1 text-lg font-extrabold text-slate-950">{opposite === "wine" ? pairing.wineName : pairing.dishName}</h3>
        </div>
        <PairingScore score={pairing.score} />
      </div>
      {opposite === "wine" && <div className="mt-3"><WineProfileChips profile={profile} /></div>}
      <p className="mt-3 text-sm font-medium leading-6 text-slate-700">{pairing.reason}</p>
      {pairing.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pairing.tags.map((tag) => <span key={tag} className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">{tag}</span>)}
        </div>
      )}
      <p className="mt-3 text-[11px] font-semibold text-slate-400">{pairing.source === "ai" ? "Sugerencia de Sommelier IA · confirmar preferencias del cliente" : "Sugerencia orientativa · IA no disponible durante el último análisis"}</p>
    </article>
  );
}

export default function SommelierPage() {
  const [payload, setPayload] = useState<Extract<SommelierApiResponse, { ok: true }> | null>(null);
  const [mode, setMode] = useState<Mode>("dish");
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedApiFetch("/api/ai/sommelier", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as SommelierApiResponse | null;
      if (!response.ok || !data || data.ok !== true) {
        throw new Error(data && data.ok === false ? data.error : "No se pudo cargar Sommelier IA");
      }
      setPayload(data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar Sommelier IA");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const snapshot = payload?.snapshot ?? emptySnapshot();
  const items = mode === "dish" ? snapshot.dishes : snapshot.wines;
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const filteredItems = useMemo(
    () => items.filter((item) => !normalizedQuery || `${item.name} ${item.categoryName} ${item.familyName}`.toLocaleLowerCase("es").includes(normalizedQuery)),
    [items, normalizedQuery],
  );

  useEffect(() => {
    const source = mode === "dish" ? snapshot.dishes : snapshot.wines;
    if (!source.length) {
      setSelectedId("");
      return;
    }
    if (!source.some((item) => item.id === selectedId)) setSelectedId(source[0]!.id);
  }, [mode, selectedId, snapshot.dishes, snapshot.wines]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const recommendations = useMemo(() => {
    const matching = snapshot.pairings.filter((pairing) => mode === "dish" ? pairing.dishProductId === selectedId : pairing.wineProductId === selectedId);
    return matching.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [mode, selectedId, snapshot.pairings]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await authenticatedApiFetch("/api/ai/sommelier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = (await response.json().catch(() => null)) as SommelierApiResponse | null;
      if (!response.ok || !data || data.ok !== true) {
        throw new Error(data && data.ok === false ? data.error : "No se pudo analizar la carta");
      }
      setPayload(data);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "No se pudo analizar la carta");
    } finally {
      setGenerating(false);
    }
  }, []);

  const generatedLabel = snapshot.generatedAtMs
    ? new Date(snapshot.generatedAtMs).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })
    : null;

  return (
    <ModulePageShell title="Sommelier IA" subtitle="Maridajes prácticos usando únicamente tu carta real" maxWidth={1320} compactLayout operationalFocus shellSurface="configLight">
      <div className="grid gap-4">
        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}

        {!loading && payload && !payload.entitled && (
          <section className="rounded-3xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-6 shadow-sm">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-violet-700">Hostly Ultra</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Sommelier IA está incluido en Ultra</h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-700">El módulo utiliza los vinos y platos reales de tu carta. En Básico y Pro puedes ver el módulo, pero la generación de maridajes queda reservada a Ultra.</p>
            <div className="mt-4"><Link href="/dashboard/configuracion" className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-extrabold text-white">Ver mi plan</Link></div>
          </section>
        )}

        {payload?.entitled && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-950">Carta analizada</h2>
                  <p className="text-sm font-medium text-slate-600">{snapshot.wines.length} vinos · {snapshot.dishes.length} platos · {snapshot.pairings.length} maridajes{generatedLabel ? ` · ${generatedLabel}` : ""}</p>
                </div>
                {payload.canRegenerate && <HostlyButton variant="primary" onClick={() => void generate()} disabled={generating}>{generating ? "Analizando…" : snapshot.pairings.length ? "Actualizar maridajes" : "Analizar carta"}</HostlyButton>}
              </div>
              {snapshot.source === "heuristic" && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">El último análisis usó el modo de respaldo porque el proveedor IA no estaba disponible. Los maridajes siguen siendo utilizables, pero son más generales.</p>}
            </section>

            {(snapshot.wines.length === 0 || snapshot.dishes.length === 0) && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
                Para crear maridajes Hostly necesita al menos un vino y un plato activos en la carta. Revisa categorías/familias de vino si tus vinos no aparecen.
              </section>
            )}

            {snapshot.wines.length > 0 && snapshot.dishes.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
                  <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Modo de consulta">
                    <button type="button" role="tab" aria-selected={mode === "dish"} onClick={() => { setMode("dish"); setQuery(""); }} className={`min-h-10 rounded-lg px-3 text-sm font-extrabold ${mode === "dish" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}>Por plato</button>
                    <button type="button" role="tab" aria-selected={mode === "wine"} onClick={() => { setMode("wine"); setQuery(""); }} className={`min-h-10 rounded-lg px-3 text-sm font-extrabold ${mode === "wine" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}>Por vino</button>
                  </div>
                  <label className="mt-3 block text-xs font-extrabold uppercase tracking-wide text-slate-500">Buscar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "dish" ? "Ej. lubina, entrecot…" : "Ej. Rioja, cava…"} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-sky-500" /></label>
                  <div className="mt-3 grid max-h-[58vh] gap-2 overflow-y-auto pr-1">
                    {filteredItems.map((item) => (
                      <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`min-h-14 rounded-xl border p-3 text-left transition ${selectedId === item.id ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                        <span className="block text-sm font-extrabold text-slate-950">{item.name}</span>
                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">{itemSubtitle(item)}</span>
                      </button>
                    ))}
                    {filteredItems.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">No hay coincidencias.</p>}
                  </div>
                </aside>

                <main className="min-w-0">
                  {selectedItem && (
                    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{mode === "dish" ? "Plato" : "Vino"}</p>
                      <h2 className="mt-1 text-2xl font-black text-slate-950">{selectedItem.name}</h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{itemSubtitle(selectedItem)}</p>
                      {selectedItem.description && <p className="mt-3 text-sm font-medium leading-6 text-slate-700">{selectedItem.description}</p>}
                      {mode === "wine" && <div className="mt-3"><WineProfileChips profile={snapshot.wineProfiles[selectedItem.id]} /></div>}
                    </section>
                  )}
                  <div className="grid gap-3 xl:grid-cols-2">
                    {recommendations.map((pairing) => <RecommendationCard key={pairing.id} pairing={pairing} opposite={mode === "dish" ? "wine" : "dish"} profile={snapshot.wineProfiles[pairing.wineProductId]} />)}
                  </div>
                  {selectedItem && recommendations.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm font-semibold text-slate-600">No hay maridajes vigentes para esta selección. {payload.canRegenerate ? "Actualiza los maridajes para recalcular la carta." : "Pide a un encargado que actualice Sommelier IA."}</div>
                  )}
                </main>
              </div>
            )}
          </>
        )}

        {loading && <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600">Cargando Sommelier IA…</div>}
      </div>
    </ModulePageShell>
  );
}
