import { FieldValue } from "firebase-admin/firestore";
import type { AuthorizedTpvRestaurantContext } from "@/lib/server/tpv/require-authorized-tpv-restaurant";
import {
  requireTpvCapability,
  type TpvMutationError,
} from "@/lib/server/tpv/handle-tpv-order-mutations";

export type ReleaseSideEffect = "print" | "activity";

/** Lease corto por defecto (ms) para print/activity. */
export const RELEASE_EFFECT_LEASE_MS = 60_000;

export type AcquireReleaseEffectLeaseResult = {
  releaseEventId: string;
  effect: ReleaseSideEffect;
  /** true = este cliente debe ejecutar el efecto ahora. */
  acquired: boolean;
  alreadyCompleted: boolean;
  leaseHeld: boolean;
  leaseOwner: string | null;
  leaseUntil: number | null;
  /** Compat 3B-2B tests/clientes: alias de acquired. */
  claimed: boolean;
  /** Compat: completed o lease ajeno vigente. */
  alreadyProcessed: boolean;
};

export type CompleteReleaseEffectResult = {
  releaseEventId: string;
  effect: ReleaseSideEffect;
  completed: boolean;
};

type EffectState = {
  completed: boolean;
  leaseOwner: string | null;
  leaseUntil: number | null;
};

function releaseEffectDocRef(
  ctx: AuthorizedTpvRestaurantContext,
  releaseEventId: string,
) {
  return ctx.db
    .collection("restaurants")
    .doc(ctx.restaurantId)
    .collection("tpvReleaseEffects")
    .doc(releaseEventId);
}

function readEffectState(raw: unknown): EffectState {
  if (raw == null) {
    return { completed: false, leaseOwner: null, leaseUntil: null };
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    // Estado 3B-2B.1 (objeto con completed/lease*).
    if ("completed" in o || "leaseOwner" in o || "leaseUntil" in o) {
      const leaseUntil =
        typeof o.leaseUntil === "number" && Number.isFinite(o.leaseUntil)
          ? Math.floor(o.leaseUntil)
          : null;
      return {
        completed: o.completed === true,
        leaseOwner:
          typeof o.leaseOwner === "string" && o.leaseOwner.trim()
            ? o.leaseOwner.trim()
            : null,
        leaseUntil,
      };
    }
  }
  // Legacy 3B-2B: effects.print = Timestamp ⇒ ya ejecutado (at-most-once).
  return { completed: true, leaseOwner: null, leaseUntil: null };
}

function isLeaseValid(state: EffectState, nowMs: number): boolean {
  if (state.completed) return false;
  if (!state.leaseOwner || state.leaseUntil == null) return false;
  return state.leaseUntil > nowMs;
}

/**
 * Adquiere un lease corto para ejecutar un efecto.
 * Solo `completed=true` bloquea para siempre; lease expirado se puede reclamar.
 */
export async function handleAcquireReleaseEffectLease(
  ctx: AuthorizedTpvRestaurantContext,
  intent: {
    releaseEventId: string;
    effect: ReleaseSideEffect;
    leaseOwner: string;
    leaseDurationMs?: number;
    nowMs?: number;
  },
): Promise<AcquireReleaseEffectLeaseResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const releaseEventId = intent.releaseEventId.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(releaseEventId)) {
    return { status: 400, error: "RELEASE_EVENT_ID_INVALID" };
  }
  const effect = intent.effect;
  if (effect !== "print" && effect !== "activity") {
    return { status: 400, error: "RELEASE_EFFECT_INVALID" };
  }
  const leaseOwner = intent.leaseOwner.trim();
  if (!leaseOwner || leaseOwner.length > 128) {
    return { status: 400, error: "LEASE_OWNER_REQUIRED" };
  }

  const nowMs = intent.nowMs ?? Date.now();
  const leaseDurationMs = Math.min(
    5 * 60_000,
    Math.max(1_000, Math.floor(intent.leaseDurationMs ?? RELEASE_EFFECT_LEASE_MS)),
  );
  const leaseUntil = nowMs + leaseDurationMs;

  let acquired = false;
  let alreadyCompleted = false;
  let leaseHeld = false;
  let resultOwner: string | null = null;
  let resultUntil: number | null = null;

  await ctx.db.runTransaction(async (tx) => {
    const ref = releaseEffectDocRef(ctx, releaseEventId);
    const snap = await tx.get(ref);
    const data = (snap.exists ? snap.data() : {}) as Record<string, unknown>;
    const effectsRaw =
      data.effects != null && typeof data.effects === "object" && !Array.isArray(data.effects)
        ? ({ ...(data.effects as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    const current = readEffectState(effectsRaw[effect]);

    if (current.completed) {
      alreadyCompleted = true;
      acquired = false;
      leaseHeld = false;
      resultOwner = current.leaseOwner;
      resultUntil = current.leaseUntil;
      return;
    }

    if (isLeaseValid(current, nowMs) && current.leaseOwner !== leaseOwner) {
      alreadyCompleted = false;
      acquired = false;
      leaseHeld = true;
      resultOwner = current.leaseOwner;
      resultUntil = current.leaseUntil;
      return;
    }

    // Nuevo lease, mismo owner (refresh) o lease expirado / ausente.
    const nextState = {
      completed: false,
      leaseOwner,
      leaseUntil,
    };
    effectsRaw[effect] = nextState;
    tx.set(
      ref,
      {
        restaurantId: ctx.restaurantId,
        releaseEventId,
        effects: effectsRaw,
        updatedAt: FieldValue.serverTimestamp(),
        ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
    acquired = true;
    alreadyCompleted = false;
    leaseHeld = false;
    resultOwner = leaseOwner;
    resultUntil = leaseUntil;
  });

  return {
    releaseEventId,
    effect,
    acquired,
    alreadyCompleted,
    leaseHeld,
    leaseOwner: resultOwner,
    leaseUntil: resultUntil,
    claimed: acquired,
    alreadyProcessed: alreadyCompleted || leaseHeld,
  };
}

/** @deprecated Alias 3B-2B → acquire lease (requiere leaseOwner). */
export async function handleClaimReleaseEffect(
  ctx: AuthorizedTpvRestaurantContext,
  intent: {
    releaseEventId: string;
    effect: ReleaseSideEffect;
    leaseOwner?: string;
    leaseDurationMs?: number;
    nowMs?: number;
  },
): Promise<AcquireReleaseEffectLeaseResult | TpvMutationError> {
  const leaseOwner =
    intent.leaseOwner?.trim() ||
    `legacy-${ctx.uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return handleAcquireReleaseEffectLease(ctx, {
    releaseEventId: intent.releaseEventId,
    effect: intent.effect,
    leaseOwner,
    leaseDurationMs: intent.leaseDurationMs,
    nowMs: intent.nowMs,
  });
}

/**
 * Marca el efecto como completed solo si el caller posee el lease vigente
 * (o el mismo owner tras refresh) y aún no está completed.
 */
export async function handleCompleteReleaseEffect(
  ctx: AuthorizedTpvRestaurantContext,
  intent: {
    releaseEventId: string;
    effect: ReleaseSideEffect;
    leaseOwner: string;
    nowMs?: number;
  },
): Promise<CompleteReleaseEffectResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const releaseEventId = intent.releaseEventId.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(releaseEventId)) {
    return { status: 400, error: "RELEASE_EVENT_ID_INVALID" };
  }
  const effect = intent.effect;
  if (effect !== "print" && effect !== "activity") {
    return { status: 400, error: "RELEASE_EFFECT_INVALID" };
  }
  const leaseOwner = intent.leaseOwner.trim();
  if (!leaseOwner) return { status: 400, error: "LEASE_OWNER_REQUIRED" };

  let completed = false;

  try {
    await ctx.db.runTransaction(async (tx) => {
      const ref = releaseEffectDocRef(ctx, releaseEventId);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new Error("RELEASE_EFFECT_NOT_FOUND");
      }
      const data = snap.data() as Record<string, unknown>;
      const effectsRaw =
        data.effects != null && typeof data.effects === "object" && !Array.isArray(data.effects)
          ? ({ ...(data.effects as Record<string, unknown>) } as Record<string, unknown>)
          : {};
      const current = readEffectState(effectsRaw[effect]);

      if (current.completed) {
        completed = true;
        return;
      }

      if (current.leaseOwner !== leaseOwner) {
        throw new Error("LEASE_OWNER_MISMATCH");
      }

      effectsRaw[effect] = {
        completed: true,
        completedAt: FieldValue.serverTimestamp(),
        leaseOwner: null,
        leaseUntil: null,
      };
      tx.set(
        ref,
        {
          restaurantId: ctx.restaurantId,
          releaseEventId,
          effects: effectsRaw,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      completed = true;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "RELEASE_EFFECT_NOT_FOUND") {
      return { status: 404, error: "RELEASE_EFFECT_NOT_FOUND" };
    }
    if (msg === "LEASE_OWNER_MISMATCH") {
      return { status: 409, error: "LEASE_OWNER_MISMATCH" };
    }
    throw e;
  }

  return { releaseEventId, effect, completed };
}
