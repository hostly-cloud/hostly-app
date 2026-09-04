"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyButton, HostlyInput, HostlyTextarea } from "@/components/ui/hostly";
import type { CustomerCrmRecord, CustomerCrmSnapshot } from "@/lib/customers/types";
import { requestCustomerCrm, saveCustomerCrmProfile } from "@/lib/customers/request-customer-crm";

function eur(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value || 0);
}
function visitMoment(visit: CustomerCrmRecord["lastVisit"]) {
  if (!visit) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(visit.date);
  return `${match ? `${match[3]}/${match[2]}/${match[1]}` : visit.date} · ${visit.time}`;
}

type Editor = {
  profileId: string | null;
  sourceKeys: string[];
  displayName: string;
  phone: string;
  email: string;
  birthday: string;
  vip: boolean;
  tagsText: string;
  allergies: string;
  preferences: string;
  notes: string;
};

function editorFromRecord(record: CustomerCrmRecord): Editor {
  return {
    profileId: record.profileId,
    sourceKeys: record.sourceKeys,
    displayName: record.displayName,
    phone: record.phone,
    email: record.email,
    birthday: record.birthday,
    vip: record.vip,
    tagsText: record.tags.join(", "),
    allergies: record.allergies,
    preferences: record.preferences,
    notes: record.notes,
  };
}

export default function CustomersPage() {
  const [snapshot, setSnapshot] = useState<CustomerCrmSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "vip" | "repeat" | "noshow">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await requestCustomerCrm();
      setSnapshot(next);
      setSelectedId((current) => current && next.records.some((record) => record.recordId === current) ? current : next.records[0]?.recordId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar Clientes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es-ES");
    return (snapshot?.records ?? []).filter((record) => {
      if (filter === "vip" && !record.vip) return false;
      if (filter === "repeat" && record.completedVisits < 2) return false;
      if (filter === "noshow" && record.noShows < 1) return false;
      if (!needle) return true;
      return [record.displayName, record.phone, record.email, ...record.tags].join(" ").toLocaleLowerCase("es-ES").includes(needle);
    });
  }, [snapshot, query, filter]);

  const selected = snapshot?.records.find((record) => record.recordId === selectedId) ?? null;
  useEffect(() => {
    setEditor(selected ? editorFromRecord(selected) : null);
  }, [selectedId, snapshot]);

  const save = async () => {
    if (!editor || !snapshot?.canEdit) return;
    setSaving(true);
    setError("");
    try {
      await saveCustomerCrmProfile({
        profileId: editor.profileId,
        sourceKeys: editor.sourceKeys,
        displayName: editor.displayName,
        phone: editor.phone,
        email: editor.email,
        birthday: editor.birthday,
        vip: editor.vip,
        tags: editor.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
        allergies: editor.allergies,
        preferences: editor.preferences,
        notes: editor.notes,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el cliente");
    } finally {
      setSaving(false);
    }
  };

  const summary = snapshot?.summary;
  return (
    <ModulePageShell title="Clientes" subtitle="CRM operativo del restaurante" maxWidth={1440} compactLayout shellSurface="configLight">
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-3 pb-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/dashboard/operacion/reservas" className="text-sm font-semibold text-sky-700 hover:underline">← Volver a Reservas</Link>
          <HostlyButton variant="secondary" size="compact" onClick={() => void load()} disabled={loading}>Actualizar</HostlyButton>
        </div>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[
            ["Clientes", summary?.totalCustomers ?? 0],
            ["VIP", summary?.vipCustomers ?? 0],
            ["Recurrentes", summary?.repeatCustomers ?? 0],
            ["Con no-show", summary?.customersWithNoShow ?? 0],
            ["Gasto atribuido", eur(summary?.totalAttributedSpend ?? 0)],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
            </div>
          ))}
        </section>

        <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.5fr)]">
          <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-3">
              <HostlyInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, teléfono, email o etiqueta" />
              <div className="mt-2 flex flex-wrap gap-2">
                {(["all", "vip", "repeat", "noshow"] as const).map((key) => (
                  <HostlyButton key={key} variant={filter === key ? "primary" : "secondary"} size="compact" onClick={() => setFilter(key)}>
                    {key === "all" ? "Todos" : key === "vip" ? "VIP" : key === "repeat" ? "Recurrentes" : "No-show"}
                  </HostlyButton>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading ? <p className="p-3 text-sm text-slate-500">Cargando clientes…</p> : null}
              {!loading && filtered.length === 0 ? <p className="p-3 text-sm text-slate-500">No hay clientes para este filtro.</p> : null}
              {filtered.map((record) => (
                <button key={record.recordId} type="button" onClick={() => setSelectedId(record.recordId)} className={`mb-2 w-full rounded-xl border p-3 text-left transition ${record.recordId === selectedId ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-slate-900">{record.displayName}</span>
                    <span className="flex shrink-0 gap-1">{record.vip ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">VIP</span> : record.vipSuggested ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700">VIP sugerido</span> : null}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{record.completedVisits} visitas · {eur(record.totalSpend)} · {record.noShows} no-show</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{record.phone || record.email || "Sin contacto"}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {!selected || !editor ? <p className="text-sm text-slate-500">Selecciona un cliente.</p> : (
              <div className="space-y-5">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><h2 className="text-2xl font-bold text-slate-950">{selected.displayName}</h2>{selected.vip ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">VIP</span> : null}</div>
                    <p className="mt-1 text-sm text-slate-500">Última visita: {visitMoment(selected.lastVisit)} · Próxima: {visitMoment(selected.nextReservation)}</p>
                  </div>
                  <div className="text-right"><div className="text-2xl font-bold text-slate-950">{eur(selected.totalSpend)}</div><div className="text-xs text-slate-500">{eur(selected.averageSpend)} de media</div></div>
                </header>

                <div className="grid gap-2 sm:grid-cols-4">
                  {[["Visitas", selected.completedVisits], ["Reservas", selected.reservations], ["Personas", selected.totalPax], ["No-show", selected.noShows]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="text-lg font-bold text-slate-900">{value}</div></div>)}
                </div>

                <section>
                  <h3 className="mb-2 font-bold text-slate-900">Ficha del cliente</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">Nombre<HostlyInput value={editor.displayName} onChange={(e) => setEditor({ ...editor, displayName: e.target.value })} disabled={!snapshot?.canEdit} /></label>
                    <label className="text-sm font-medium text-slate-700">Teléfono<HostlyInput value={editor.phone} onChange={(e) => setEditor({ ...editor, phone: e.target.value })} disabled={!snapshot?.canEdit} /></label>
                    <label className="text-sm font-medium text-slate-700">Email<HostlyInput value={editor.email} onChange={(e) => setEditor({ ...editor, email: e.target.value })} disabled={!snapshot?.canEdit} /></label>
                    <label className="text-sm font-medium text-slate-700">Cumpleaños<HostlyInput type="date" value={editor.birthday} onChange={(e) => setEditor({ ...editor, birthday: e.target.value })} disabled={!snapshot?.canEdit} /></label>
                  </div>
                  <div className="mt-3"><label className="text-sm font-medium text-slate-700">Etiquetas<HostlyInput value={editor.tagsText} onChange={(e) => setEditor({ ...editor, tagsText: e.target.value })} placeholder="terraza, vino, familia, empresa…" disabled={!snapshot?.canEdit} /></label></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">Alergias<HostlyTextarea value={editor.allergies} onChange={(e) => setEditor({ ...editor, allergies: e.target.value })} disabled={!snapshot?.canEdit} /></label>
                    <label className="text-sm font-medium text-slate-700">Preferencias<HostlyTextarea value={editor.preferences} onChange={(e) => setEditor({ ...editor, preferences: e.target.value })} disabled={!snapshot?.canEdit} /></label>
                  </div>
                  <div className="mt-3"><label className="text-sm font-medium text-slate-700">Notas internas<HostlyTextarea value={editor.notes} onChange={(e) => setEditor({ ...editor, notes: e.target.value })} disabled={!snapshot?.canEdit} /></label></div>
                  {snapshot?.canManageVip ? <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={editor.vip} onChange={(e) => setEditor({ ...editor, vip: e.target.checked })} /> Cliente VIP</label> : null}
                  {selected.vipSuggested && !selected.vip ? <p className="mt-2 text-xs text-sky-700">Hostly sugiere revisar este cliente como VIP por recurrencia o gasto atribuido. La decisión sigue siendo manual.</p> : null}
                  {snapshot?.canEdit ? <div className="mt-4"><HostlyButton onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Guardar ficha"}</HostlyButton></div> : null}
                </section>

                <section>
                  <h3 className="mb-2 font-bold text-slate-900">Historial de visitas y reservas</h3>
                  <div className="space-y-2">
                    {selected.timeline.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay visitas vinculadas.</p> : selected.timeline.map((visit) => (
                      <div key={visit.reservationId} className="grid gap-1 rounded-xl border border-slate-200 p-3 sm:grid-cols-[150px_1fr_auto] sm:items-center">
                        <div className="text-sm font-semibold text-slate-900">{visitMoment(visit)}</div>
                        <div className="text-sm text-slate-600">{visit.tableLabel || "Sin mesa"} · {visit.partySize} pax · {visit.status}{visit.occasion ? ` · ${visit.occasion}` : ""}</div>
                        <div className="text-sm font-bold text-slate-900">{visit.spend > 0 ? eur(visit.spend) : "—"}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        </section>
      </div>
    </ModulePageShell>
  );
}
