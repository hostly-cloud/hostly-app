"use client";

import Link from "next/link";
import { useHostlySubscription } from "@/components/subscription/hostly-subscription-context";
import { subscriptionAccessHasEntitlement } from "@/lib/subscription/hostly-subscription-access";
import { PosLayoutMigrationPanel } from "./_components/pos-layout-migration-panel";
import { PosMigrationPageContent } from "./_components/pos-migration-page-content";

function LockedMigration({
  title,
  description,
  targetPlan,
}: {
  title: string;
  description: string;
  targetPlan: "Pro" | "Ultra";
}) {
  return (
    <section className="mx-auto w-full max-w-[1600px] px-3 pb-6 sm:px-4 lg:px-6">
      <div className="rounded-2xl border border-[var(--hostly-line)] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--hostly-navy-deep)]">{title}</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--hostly-ink-muted)]">{description}</p>
          </div>
          <Link
            href="/dashboard/configuracion/cuenta"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[var(--hostly-radius-button)] bg-[var(--hostly-navy-deep)] px-4 text-sm font-semibold text-white"
          >
            Ver Hostly {targetPlan}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function ConfigCartaMigracionTpvPage() {
  const { access, state } = useHostlySubscription();
  const canMigrateProducts =
    state === "ready" && access
      ? subscriptionAccessHasEntitlement(access, "migration.products")
      : false;
  const canMigrateFull =
    state === "ready" && access
      ? subscriptionAccessHasEntitlement(access, "migration.full")
      : false;

  if (state === "idle" || state === "loading") {
    return (
      <section className="mx-auto w-full max-w-[1600px] px-3 py-6 sm:px-4 lg:px-6">
        <div className="rounded-2xl border border-[var(--hostly-line)] bg-white p-5 text-sm text-[var(--hostly-ink-muted)]">
          Comprobando las funciones incluidas en tu plan…
        </div>
      </section>
    );
  }

  if (state === "error" || !access) {
    return (
      <section className="mx-auto w-full max-w-[1600px] px-3 py-6 sm:px-4 lg:px-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
          No hemos podido verificar tu plan. La migración permanece bloqueada hasta poder comprobar la suscripción de forma segura.
        </div>
      </section>
    );
  }

  return (
    <>
      {canMigrateProducts ? (
        <PosMigrationPageContent />
      ) : (
        <LockedMigration
          title="Migración desde otro TPV"
          description="Hostly Básico mantiene el alta manual. La migración automática de carta, productos, categorías, precios, stock y datos asociados está incluida desde Hostly Pro."
          targetPlan="Pro"
        />
      )}

      {canMigrateFull ? (
        <div className="mx-auto w-full max-w-[1600px] px-3 pb-6 sm:px-4 lg:px-6">
          <PosLayoutMigrationPanel />
        </div>
      ) : canMigrateProducts ? (
        <LockedMigration
          title="Migra también tu restaurante completo"
          description="Tu plan permite migrar la carta. Hostly Ultra añade la migración completa de salas, planos, zonas y mesas, con revisión previa y rollback seguro."
          targetPlan="Ultra"
        />
      ) : null}
    </>
  );
}
