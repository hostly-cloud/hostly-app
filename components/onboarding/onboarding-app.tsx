"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import {
  HostlyAlert,
  HostlyButton,
  HostlyField,
  HostlyInput,
  HostlySection,
  HostlySectionHeader,
  HostlySelect,
  HostlySurface,
} from "@/components/ui/hostly";
import {
  loadOnboardingCheckpoints,
  onboardingActivationPercent,
  saveOnboardingCheckpoints,
  type OnboardingCheckpointKey,
  type OnboardingCheckpoints,
} from "@/lib/hostly/onboarding-checkpoints";
import {
  loadRestaurantProfile,
  saveRestaurantProfile,
  MODELOS_VENTA,
  TIPOS_NEGOCIO,
  type RestaurantProfile,
} from "@/lib/hostly/restaurant-profile";
import { saveRestaurantProfileWithUserSync } from "@/lib/firestore/save-restaurant-profile";
import { updateRestaurantProfile } from "@/lib/firestore/restaurants";

const STEPS = [
  {
    key: "negocio" as const,
    title: "Negocio",
    description: "Guarda la identidad básica del restaurante en el perfil canónico.",
  },
  {
    key: "carta" as const,
    title: "Carta",
    description: "Importa o revisa la carta desde el catálogo central de Hostly.",
  },
  {
    key: "inventario" as const,
    title: "Inventario",
    description: "Configura stock, mínimos, costes y proveedores en Firestore.",
  },
  {
    key: "usuarios" as const,
    title: "Equipo",
    description: "Invita al equipo y asigna accesos desde el módulo real de usuarios.",
  },
  {
    key: "escandallo" as const,
    title: "Escandallos",
    description: "Completa costes y márgenes desde la herramienta canónica.",
  },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const ROUTES: Record<Exclude<StepKey, "negocio">, string> = {
  carta: "/dashboard/configuracion/carta/importacion",
  inventario: "/dashboard/inventario",
  usuarios: "/dashboard/invitaciones",
  escandallo: "/dashboard/configuracion/carta/escandallos",
};

function firstIncompleteStep(checkpoints: OnboardingCheckpoints): number {
  const index = STEPS.findIndex((step) => !checkpoints[step.key]);
  return index === -1 ? STEPS.length - 1 : index;
}

export default function OnboardingApp() {
  const router = useRouter();
  const {
    user,
    restaurantId,
    restaurantName,
    refreshProfile,
  } = useAuth();
  const [checkpoints, setCheckpoints] = useState<OnboardingCheckpoints>(loadOnboardingCheckpoints);
  const [stepIndex, setStepIndex] = useState(() => firstIncompleteStep(loadOnboardingCheckpoints()));
  const [profile, setProfile] = useState<RestaurantProfile>(loadRestaurantProfile);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (profile.nombre.trim() || !restaurantName?.trim()) return;
    setProfile((current) => ({ ...current, nombre: restaurantName.trim() }));
  }, [profile.nombre, restaurantName]);

  const activation = onboardingActivationPercent(checkpoints);
  const current = STEPS[stepIndex] ?? STEPS[0];
  const allDone = STEPS.every((step) => checkpoints[step.key]);

  const completedCount = useMemo(
    () => STEPS.filter((step) => checkpoints[step.key]).length,
    [checkpoints],
  );

  function persistCheckpoint(key: OnboardingCheckpointKey, done = true) {
    const next = { ...checkpoints, [key]: done };
    if (key === "carta" && done) next.catalogo = true;
    setCheckpoints(next);
    saveOnboardingCheckpoints(next);
    return next;
  }

  function completeCurrent() {
    const next = persistCheckpoint(current.key, true);
    setSuccessMessage(`${current.title} marcado como listo.`);
    const nextIndex = STEPS.findIndex((step) => !next[step.key]);
    if (nextIndex >= 0) setStepIndex(nextIndex);
  }

  async function saveBusiness() {
    const rid = restaurantId?.trim() ?? "";
    if (!rid || !user?.uid) {
      setBusinessError("No se ha podido resolver el restaurante o la sesión activa.");
      return;
    }
    const name = profile.nombre.trim();
    if (!name) {
      setBusinessError("Escribe el nombre del negocio.");
      return;
    }

    setSavingBusiness(true);
    setBusinessError(null);
    setSuccessMessage(null);
    try {
      saveRestaurantProfile(profile);
      await saveRestaurantProfileWithUserSync(rid, user.uid, {
        name,
        businessType: profile.tipoNegocio,
      });
      await refreshProfile();
      persistCheckpoint("negocio", true);
      setSuccessMessage("Perfil del negocio guardado en Hostly.");
      const nextIndex = STEPS.findIndex((step) => step.key !== "negocio" && !checkpoints[step.key]);
      if (nextIndex >= 0) setStepIndex(nextIndex);
    } catch (error) {
      console.error("[onboarding] canonical business save failed", error);
      setBusinessError("No se ha podido guardar el perfil. Reintenta.");
    } finally {
      setSavingBusiness(false);
    }
  }

  async function finishOnboarding() {
    const rid = restaurantId?.trim() ?? "";
    if (!rid) return;
    try {
      await updateRestaurantProfile(rid, { onboardingCompleted: true });
      await refreshProfile();
    } catch (error) {
      console.error("[onboarding] completion flag failed", error);
    }
    router.push("/dashboard");
  }

  return (
    <HostlySection stack="sm" className="min-h-0">
      <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
        <HostlySurface variant="soft" className="p-3">
          <div className="mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hostly-ink-faint)]">
              Activación
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--hostly-ink-strong)]">
              {activation}%
            </div>
            <div className="text-xs text-[var(--hostly-ink-muted)]">
              {completedCount} de {STEPS.length} bloques listos
            </div>
          </div>

          <nav className="grid gap-1" aria-label="Pasos de activación">
            {STEPS.map((step, index) => {
              const active = index === stepIndex;
              const done = checkpoints[step.key];
              return (
                <HostlyButton
                  key={step.key}
                  variant="ghost"
                  size="compact"
                  aria-current={active ? "step" : undefined}
                  onClick={() => {
                    setStepIndex(index);
                    setSuccessMessage(null);
                    setBusinessError(null);
                  }}
                  className={`flex min-h-[42px] w-full items-center justify-start gap-2 rounded-lg px-2.5 text-left text-sm font-semibold transition ${
                    active
                      ? "bg-[var(--hostly-accent-soft)] text-[var(--hostly-navy-deep)]"
                      : "text-[var(--hostly-ink-muted)] hover:bg-[var(--hostly-table-row-hover)]"
                  }`}
                >
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      done
                        ? "bg-[var(--hostly-success-soft)] text-[var(--hostly-success)]"
                        : "bg-[var(--hostly-table-head-surface)]"
                    }`}
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  <span>{step.title}</span>
                </HostlyButton>
              );
            })}
          </nav>
        </HostlySurface>

        <HostlySurface variant="flat" className="min-w-0 p-4">
          <HostlySectionHeader title={current.title} description={current.description} />

          <div className="mt-4">
            {successMessage ? (
              <HostlyAlert tone="success" className="mb-3">
                {successMessage}
              </HostlyAlert>
            ) : null}

            {current.key === "negocio" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <HostlyField label="Nombre del negocio" className="md:col-span-2">
                  <HostlyInput
                    value={profile.nombre}
                    onChange={(event) =>
                      setProfile((currentProfile) => ({
                        ...currentProfile,
                        nombre: event.target.value,
                      }))
                    }
                    placeholder="Nombre del restaurante"
                  />
                </HostlyField>

                <HostlyField label="Tipo de negocio">
                  <HostlySelect
                    value={profile.tipoNegocio}
                    onChange={(event) =>
                      setProfile((currentProfile) => ({
                        ...currentProfile,
                        tipoNegocio: event.target.value as RestaurantProfile["tipoNegocio"],
                      }))
                    }
                  >
                    {TIPOS_NEGOCIO.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </HostlySelect>
                </HostlyField>

                <HostlyField label="Modelo de venta">
                  <HostlySelect
                    value={profile.modeloVenta}
                    onChange={(event) =>
                      setProfile((currentProfile) => ({
                        ...currentProfile,
                        modeloVenta: event.target.value as RestaurantProfile["modeloVenta"],
                      }))
                    }
                  >
                    {MODELOS_VENTA.map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll("_", " ")}
                      </option>
                    ))}
                  </HostlySelect>
                </HostlyField>

                {businessError ? (
                  <HostlyAlert tone="danger" className="md:col-span-2">
                    {businessError}
                  </HostlyAlert>
                ) : null}

                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <HostlyButton
                    variant="primary"
                    onClick={() => void saveBusiness()}
                    disabled={savingBusiness}
                  >
                    {savingBusiness ? "Guardando…" : "Guardar y continuar"}
                  </HostlyButton>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                <HostlyAlert tone="info">
                  Este paso utiliza el módulo canónico de Hostly. Los datos se guardan una sola vez en su fuente real; Onboarding ya no mantiene copias locales de inventario, compras ni configuración operativa.
                </HostlyAlert>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={ROUTES[current.key]}
                    className="hostly-button-primary hostly-type-button inline-flex min-h-[40px] items-center justify-center rounded-lg px-4"
                  >
                    Abrir {current.title}
                  </Link>
                  <HostlyButton variant="secondary" onClick={completeCurrent}>
                    Marcar como listo
                  </HostlyButton>
                </div>
              </div>
            )}
          </div>
        </HostlySurface>
      </div>

      <HostlySurface variant="ice" className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <div className="text-sm font-semibold text-[var(--hostly-ink-strong)]">
            {allDone ? "Hostly está listo para operar" : "Completa los bloques esenciales"}
          </div>
          <div className="text-xs text-[var(--hostly-ink-muted)]">
            El asistente ya no duplica datos: cada bloque trabaja sobre el módulo real de la aplicación.
          </div>
        </div>
        <HostlyButton variant="primary" onClick={() => void finishOnboarding()} disabled={!allDone}>
          Activar Hostly
        </HostlyButton>
      </HostlySurface>
    </HostlySection>
  );
}
