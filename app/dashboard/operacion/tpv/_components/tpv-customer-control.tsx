"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HostlyButton, HostlyInput } from "@/components/ui/hostly";
import type { CustomerCrmRecord, CustomerCrmSnapshot, TpvCustomerOrder } from "@/lib/customers/types";
import { attachCustomerToTpvOrder, detachCustomerFromTpvOrder, requestCustomerCrm, saveCustomerCrmProfile } from "@/lib/customers/request-customer-crm";

export function TpvCustomerControl() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<CustomerCrmSnapshot | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<TpvCustomerOrder | null>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await requestCustomerCrm();
      setSnapshot(next);
      setSelectedOrder((current) => {
        const orders = next.activeOrders ?? [];
        return (current && orders.find((o) => o.orderId === current.orderId)) ?? orders[0] ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar clientes");
    }
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const records = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es-ES");
    if (!needle) return (snapshot?.records ?? []).slice(0, 40);
    return (snapshot?.records ?? []).filter((r) => [r.displayName, r.phone, r.email, ...r.tags].join(" ").toLocaleLowerCase("es-ES").includes(needle)).slice(0, 40);
  }, [snapshot, query]);

  const attach = async (record: CustomerCrmRecord) => {
    if (!selectedOrder || !record.profileId) return;
    setBusy(true); setError("");
    try {
      await attachCustomerToTpvOrder({ tableId: selectedOrder.tableId, orderId: selectedOrder.orderId, profileId: record.profileId });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo asociar el cliente"); }
    finally { setBusy(false); }
  };

  const createAndAttach = async () => {
    if (!selectedOrder || !name.trim()) return;
    setBusy(true); setError("");
    try {
      const profileId = await saveCustomerCrmProfile({ profileId: null, sourceKeys: [], displayName: name.trim(), phone: phone.trim(), email: "", birthday: "", vip: false, tags: [], allergies: "", preferences: "", notes: "", marketingConsent: "unknown" });
      if (!profileId) throw new Error("CUSTOMER_SAVE_FAILED");
      await attachCustomerToTpvOrder({ tableId: selectedOrder.tableId, orderId: selectedOrder.orderId, profileId });
      setName(""); setPhone(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo crear el cliente"); }
    finally { setBusy(false); }
  };

  const detach = async () => {
    if (!selectedOrder?.customerProfileId) return;
    setBusy(true); setError("");
    try { await detachCustomerFromTpvOrder(selectedOrder.orderId); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo desvincular"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <HostlyButton
        variant="secondary"
        size="compact"
        className="fixed bottom-[88px] right-4 z-[70] shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Identificar cliente de la mesa"
      >
        Cliente
      </HostlyButton>
      {open ? (
        <div className="fixed inset-0 z-[90] bg-slate-950/30 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <section className="ml-auto flex h-full w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
              <div><h2 className="text-lg font-bold text-slate-950">Cliente de la mesa</h2><p className="text-xs text-slate-500">Asocia la comanda antes de cobrar para guardar visita y gasto.</p></div>
              <HostlyButton variant="ghost" size="compact" onClick={() => setOpen(false)}>Cerrar</HostlyButton>
            </header>
            <div className="space-y-3 border-b border-slate-100 p-4">
              <label className="text-xs font-semibold text-slate-600">Comanda activa
                <select className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={selectedOrder?.orderId ?? ""} onChange={(e) => setSelectedOrder((snapshot?.activeOrders ?? []).find(o => o.orderId === e.target.value) ?? null)}>
                  {(snapshot?.activeOrders ?? []).length === 0 ? <option value="">No hay comandas activas</option> : null}
                  {(snapshot?.activeOrders ?? []).map(o => <option key={o.orderId} value={o.orderId}>{o.tableLabel}{o.customerName ? ` · ${o.customerName}` : ""}</option>)}
                </select>
              </label>
              {selectedOrder?.customerProfileId ? (
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><span>Cliente asociado: <strong>{selectedOrder.customerName || "Cliente"}</strong></span><HostlyButton variant="secondary" size="compact" onClick={() => void detach()} disabled={busy}>Quitar</HostlyButton></div>
              ) : null}
              {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
              <HostlyInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nombre, teléfono o email" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {records.map(record => (
                <button key={record.recordId} type="button" disabled={busy || !selectedOrder || !record.profileId} onClick={() => void attach(record)} className="mb-2 w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-sky-50 disabled:opacity-50">
                  <div className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-slate-900">{record.displayName}</strong>{record.vip ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">VIP</span> : null}</div>
                  <div className="mt-1 text-xs text-slate-500">{record.phone || record.email || "Sin contacto"} · {record.completedVisits} visitas</div>
                  {record.allergies ? <div className="mt-1 text-xs font-semibold text-red-700">Alergias: {record.allergies}</div> : null}
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Cliente nuevo</div>
              <div className="grid gap-2 sm:grid-cols-2"><HostlyInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" /><HostlyInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono" /></div>
              <HostlyButton className="mt-2 w-full" onClick={() => void createAndAttach()} disabled={busy || !selectedOrder || !name.trim()}>{busy ? "Guardando…" : "Crear y asociar"}</HostlyButton>
              <p className="mt-2 text-[11px] text-slate-500">Crear una ficha operativa no implica consentimiento para comunicaciones comerciales.</p>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
