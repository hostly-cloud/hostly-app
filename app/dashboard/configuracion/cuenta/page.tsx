"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase/client";
import type { HostlyPlan } from "@/lib/subscription/hostly-plan";

type BillingInterval = "month" | "year";

type BillingStatus = {
  ok: boolean;
  effectivePlan: HostlyPlan;
  subscription: null | {
    status: string | null;
    interval: string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: number | null;
    trialEnd: number | null;
    trialUsed: boolean;
    lastPaymentFailedAt: number | null;
    customerLinked: boolean;
    subscriptionLinked: boolean;
  };
  billing: {
    enabled: boolean;
    secretKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
    prices: Record<HostlyPlan, { month: boolean; year: boolean }>;
  };
};

type PlanCard = {
  id: HostlyPlan;
  name: string;
  monthly: number;
  annual: number;
  description: string;
  features: string[];
  trial?: string;
};

const PLANS: PlanCard[] = [
  {
    id: "basic",
    name: "Hostly Básico",
    monthly: 39,
    annual: 390,
    description: "La operativa esencial para empezar con Hostly.",
    features: ["TPV, carta y reservas", "Hasta 5 empleados", "Alta manual de carta y configuración", "Operativa esencial"],
  },
  {
    id: "pro",
    name: "Hostly Pro",
    monthly: 79,
    annual: 790,
    description: "Más automatización e IA para equipos en crecimiento.",
    features: ["Hasta 25 empleados", "Migración de carta y productos desde otro TPV", "100 imágenes IA/mes", "5 importaciones IA/mes", "Soporte prioritario"],
    trial: "30 días de prueba",
  },
  {
    id: "ultra",
    name: "Hostly Ultra",
    monthly: 139,
    annual: 1390,
    description: "La experiencia Hostly más completa para operaciones exigentes.",
    features: ["Empleados ilimitados", "Migración completa del restaurante desde otro TPV", "500 imágenes IA/mes", "20 importaciones IA/mes", "Imágenes IA en lote", "Analítica multiubicación"],
  },
];

function formatDate(timestamp: number | null): string | null {
  if (!timestamp) return null;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

async function authHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error("Necesitas iniciar sesión de nuevo.");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, ...extra };
}

function randomIdempotencyKey(plan: HostlyPlan, interval: BillingInterval): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `hostly-checkout:${plan}:${interval}:${random}`;
}

export default function CuentaYFacturacionPage() {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<HostlyPlan | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/subscription/status", {
        headers: await authHeaders(),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as BillingStatus | null;
      if (!response.ok || !payload?.ok) throw new Error("No se pudo cargar tu suscripción.");
      setStatus(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar tu suscripción.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const params = new URLSearchParams(window.location.search);
    const result = params.get("subscription");
    if (result === "success") setMessage("Stripe ha recibido la suscripción. Hostly actualizará el plan en cuanto llegue la confirmación segura.");
    if (result === "cancelled") setMessage("El proceso de contratación se canceló. No se ha cambiado tu plan.");
  }, [loadStatus]);

  const currentPlanName = useMemo(
    () => PLANS.find((plan) => plan.id === status?.effectivePlan)?.name ?? "Hostly",
    [status?.effectivePlan],
  );

  async function startCheckout(plan: HostlyPlan) {
    setBusyPlan(plan);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: await authHeaders({
          "Content-Type": "application/json",
          "Idempotency-Key": randomIdempotencyKey(plan, interval),
        }),
        body: JSON.stringify({ plan, interval }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; checkoutUrl?: string; error?: string }
        | null;
      if (response.status === 409 && payload?.error === "STRIPE_SUBSCRIPTION_ALREADY_LINKED") {
        throw new Error("Tu restaurante ya tiene una suscripción Stripe vinculada. Usa “Gestionar suscripción”.");
      }
      if (!response.ok || !payload?.checkoutUrl) {
        throw new Error(payload?.error === "SUBSCRIPTION_ADMIN_REQUIRED" ? "Solo un propietario o administrador puede cambiar el plan." : "No se pudo abrir Stripe Checkout.");
      }
      window.location.assign(payload.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "No se pudo abrir Stripe Checkout.");
      setBusyPlan(null);
    }
  }

  async function openPortal() {
    setOpeningPortal(true);
    setError(null);
    try {
      const response = await fetch("/api/subscription/portal", {
        method: "POST",
        headers: await authHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; portalUrl?: string; error?: string }
        | null;
      if (!response.ok || !payload?.portalUrl) {
        throw new Error(payload?.error === "STRIPE_CUSTOMER_NOT_LINKED" ? "Todavía no hay una cuenta de facturación Stripe vinculada." : "No se pudo abrir la gestión de la suscripción.");
      }
      window.location.assign(payload.portalUrl);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "No se pudo abrir la gestión de la suscripción.");
      setOpeningPortal(false);
    }
  }

  const subscription = status?.subscription;
  const billingReady =
    status?.billing.enabled &&
    status.billing.secretKeyConfigured &&
    status.billing.webhookSecretConfigured;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Cuenta Hostly</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Plan y facturación</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Elige tu plan, cambia entre mensual y anual y gestiona pagos y cancelación desde Stripe.
            </p>
          </div>
          <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {(["month", "year"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${interval === value ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:text-slate-950"}`}
              >
                {value === "month" ? "Mensual" : "Anual · 2 meses gratis"}
              </button>
            ))}
          </div>
        </div>
      </section>

      {message ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Plan actual</p>
            <p className="mt-1 text-xl font-semibold">{loading ? "Cargando…" : currentPlanName}</p>
            {subscription?.status ? <p className="mt-1 text-sm text-slate-300">Estado Stripe: {subscription.status}</p> : null}
            {subscription?.trialEnd ? <p className="mt-1 text-sm text-slate-300">Prueba hasta {formatDate(subscription.trialEnd)}</p> : null}
            {!subscription?.trialEnd && subscription?.currentPeriodEnd ? <p className="mt-1 text-sm text-slate-300">Periodo hasta {formatDate(subscription.currentPeriodEnd)}</p> : null}
            {subscription?.lastPaymentFailedAt ? <p className="mt-2 text-sm font-semibold text-amber-300">Hay un pago fallido pendiente de revisar.</p> : null}
            {subscription?.cancelAtPeriodEnd ? <p className="mt-2 text-sm font-semibold text-amber-300">La suscripción se cancelará al terminar el periodo actual.</p> : null}
          </div>
          {subscription?.customerLinked ? (
            <button
              type="button"
              onClick={() => void openPortal()}
              disabled={openingPortal || !billingReady}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {openingPortal ? "Abriendo…" : "Gestionar suscripción"}
            </button>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const current = status?.effectivePlan === plan.id;
          const price = interval === "month" ? plan.monthly : plan.annual;
          const configured = status?.billing.prices?.[plan.id]?.[interval] ?? false;
          return (
            <article key={plan.id} className={`flex flex-col rounded-3xl border bg-white p-5 shadow-sm ${plan.id === "ultra" ? "border-sky-300 ring-1 ring-sky-100" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-semibold text-slate-950">{plan.name}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{plan.description}</p>
                </div>
                {current ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Actual</span> : null}
              </div>
              <div className="mt-5">
                <span className="text-4xl font-semibold tracking-tight text-slate-950">{price} €</span>
                <span className="ml-1 text-sm text-slate-500">/{interval === "month" ? "mes" : "año"}</span>
              </div>
              {plan.trial ? <p className="mt-2 text-sm font-semibold text-sky-700">{plan.trial}</p> : null}
              <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm text-slate-700">
                {plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}
              </ul>
              <button
                type="button"
                onClick={() => void startCheckout(plan.id)}
                disabled={current || busyPlan !== null || !billingReady || !configured || Boolean(subscription?.subscriptionLinked)}
                className="mt-6 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {current ? "Plan actual" : busyPlan === plan.id ? "Abriendo Stripe…" : plan.id === "pro" && !subscription?.trialUsed ? "Probar Pro 30 días" : `Elegir ${plan.name.replace("Hostly ", "")}`}
              </button>
            </article>
          );
        })}
      </section>

      {!billingReady ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          La contratación todavía está en modo seguro: faltan variables sandbox de Stripe en el entorno. Los planes se muestran, pero Hostly no abrirá Checkout hasta completar esa configuración.
        </section>
      ) : null}
    </main>
  );
}
