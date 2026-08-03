import {
  claimReleaseEffectViaApi,
  completeReleaseEffectViaApi,
} from "@/lib/firestore/tpv-mutations-via-api";
import { buildReleaseEventId } from "@/lib/carta/release-event-id";

export type ReleaseSideEffectsDeps = {
  claimReleaseEffectViaApi?: typeof claimReleaseEffectViaApi;
  completeReleaseEffectViaApi?: typeof completeReleaseEffectViaApi;
  buildReleaseEventId?: typeof buildReleaseEventId;
  newLeaseOwner?: () => string;
};

function defaultLeaseOwner(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `lease-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Effectively-once print + activity por liberación lógica.
 * 1) acquire lease (pending)
 * 2) run effect
 * 3) mark completed solo si éxito
 * Lease expirado permite reintento; completed bloquea para siempre.
 */
export async function runReleaseSideEffectsExactlyOnce(
  params: {
    restaurantId: string;
    orderId: string;
    releaseAction: string;
    lineIds: readonly string[];
    markSent?: boolean;
    releaseEventId?: string;
    runPrint: () => Promise<void>;
    runActivity: () => Promise<void>;
  },
  deps: ReleaseSideEffectsDeps = {},
): Promise<{ releaseEventId: string; printed: boolean; activityLogged: boolean }> {
  const claim = deps.claimReleaseEffectViaApi ?? claimReleaseEffectViaApi;
  const complete = deps.completeReleaseEffectViaApi ?? completeReleaseEffectViaApi;
  const buildId = deps.buildReleaseEventId ?? buildReleaseEventId;
  const newOwner = deps.newLeaseOwner ?? defaultLeaseOwner;

  const releaseEventId =
    params.releaseEventId?.trim() ||
    (await buildId({
      restaurantId: params.restaurantId,
      orderId: params.orderId,
      releaseAction: params.releaseAction,
      lineIds: params.lineIds,
      markSent: params.markSent !== false,
    }));

  let printed = false;
  let activityLogged = false;

  const runOne = async (
    effect: "print" | "activity",
    run: () => Promise<void>,
  ): Promise<boolean> => {
    const leaseOwner = newOwner();
    const lease = await claim({ releaseEventId, effect, leaseOwner });
    if (!lease.ok) return false;
    const acquired = lease.acquired === true || lease.claimed === true;
    if (!acquired) return false;

    try {
      await run();
    } catch (err) {
      console.warn(`[Hostly ReleaseEffects] ${effect} failed; lease not completed`, err);
      return false;
    }

    const done = await complete({ releaseEventId, effect, leaseOwner });
    if (!done.ok || done.completed !== true) {
      console.warn(
        `[Hostly ReleaseEffects] ${effect} ran but complete failed; may retry after lease expiry`,
        "error" in done ? done.error : null,
      );
      // Efecto ya ejecutado; complete fallido puede causar re-ejecución tras expiry.
      // printJobs/activity idempotency mitigan duplicados.
      return true;
    }
    return true;
  };

  printed = await runOne("print", params.runPrint);
  activityLogged = await runOne("activity", params.runActivity);

  return { releaseEventId, printed, activityLogged };
}
