"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ManagerAutomationItem } from "@/lib/operations/manager-automations";

type AutomationsResponse = {
  ok: boolean;
  entitled?: boolean;
  active?: ManagerAutomationItem[];
};

function priorityLabel(priority: ManagerAutomationItem["priority"]): string {
  if (priority === "urgent") return "Urgente";
  if (priority === "high") return "Alta";
  return "Media";
}

function priorityClass(priority: ManagerAutomationItem["priority"]): string {
  if (priority === "urgent") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

export function ManagerAutomationsPanel() {
  const [loading, setLoading] = useState(true);
  const [entitled, setEntitled] = useState(false);
  const [active, setActive] = useState<ManagerAutomationItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/operations/automations", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json() as AutomationsResponse;
      setEntitled(payload.entitled === true);
      setActive(Array.isArray(payload.active) ? payload.active.slice(0, 3) : []);
    } catch {
      // Home must remain usable if the automation service is temporarily unavailable.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const acknowledge = async (automationId: string) => {
    setBusyId(automationId);
    try {
      const response = await fetch("/api/operations/automations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId, action: "acknowledge" }),
      });
      if (response.ok) await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading || !entitled) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm" aria-label="Automatizaciones inteligentes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                <path d="M7.8 7.8l2.7 2.7M13.5 13.5l2.7 2.7" />
                <path d="M16.2 7.8l-2.1 2.1" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Automatizaciones Hostly</p>
              <p className="text-xs text-slate-500">
                {active.length === 0
                  ? "Vigilando la operación. No hay acciones pendientes."
                  : `${active.length} ${active.length === 1 ? "acción preparada" : "acciones preparadas"}`}
              </p>
            </div>
          </div>
        </div>
        <Link href="/dashboard/operacion/activity/alerts" className="text-xs font-semibold text-sky-700 hover:text-sky-900">
          Centro de operaciones
        </Link>
      </div>

      {active.length > 0 && (
        <div className="mt-3 grid gap-2">
          {active.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityClass(item.priority)}`}>
                      {priorityLabel(item.priority)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void acknowledge(item.id)}
                    disabled={busyId === item.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {busyId === item.id ? "Guardando…" : "Revisada"}
                  </button>
                  <Link
                    href={item.action.href}
                    className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
                  >
                    {item.action.label}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
