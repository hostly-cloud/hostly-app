/**
 * Hitos completados en la configuración inicial (persistencia local).
 */

export const ONBOARDING_CHECKPOINTS_KEY = "hostly.onboarding.checkpoints.v1";

export type OnboardingCheckpointKey =
  | "negocio"
  | "carta"
  | "catalogo"
  | "inventario"
  | "usuarios"
  | "escandallo";

export type OnboardingCheckpoints = Record<OnboardingCheckpointKey, boolean>;

const KEYS: OnboardingCheckpointKey[] = ["negocio", "carta", "catalogo", "inventario", "usuarios", "escandallo"];

const EMPTY: OnboardingCheckpoints = {
  negocio: false,
  carta: false,
  catalogo: false,
  inventario: false,
  usuarios: false,
  escandallo: false,
};

export function loadOnboardingCheckpoints(): OnboardingCheckpoints {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = localStorage.getItem(ONBOARDING_CHECKPOINTS_KEY);
    if (!raw) return { ...EMPTY };
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out = { ...EMPTY };
    for (const k of KEYS) {
      out[k] = o[k] === true;
    }
    return out;
  } catch {
    return { ...EMPTY };
  }
}

export function saveOnboardingCheckpoints(c: OnboardingCheckpoints): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ONBOARDING_CHECKPOINTS_KEY, JSON.stringify(c));
  } catch {
    /* noop */
  }
}

export function setOnboardingCheckpoint(key: OnboardingCheckpointKey, done: boolean): OnboardingCheckpoints {
  const next = { ...loadOnboardingCheckpoints(), [key]: done };
  saveOnboardingCheckpoints(next);
  return next;
}

export function onboardingActivationPercent(cp: OnboardingCheckpoints): number {
  let n = 0;
  for (const k of KEYS) {
    if (cp[k]) n += 1;
  }
  return Math.round((n / KEYS.length) * 100);
}
