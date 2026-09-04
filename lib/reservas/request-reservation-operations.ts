import { auth } from "@/lib/firebase/client";
import type { OperationalReservationStatus } from "@/lib/reservas/reservation-operations";

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("UNAUTHORIZED");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

async function operation(body: Record<string, unknown>) {
  const response = await fetch("/api/reservations/operations", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; id?: string; status?: OperationalReservationStatus }
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "RESERVATION_OPERATION_FAILED");
  }
  return payload;
}

export function requestReservationCreate(input: Record<string, unknown>) {
  return operation({ action: "create", ...input });
}

export function requestReservationUpdate(
  reservationId: string,
  input: Record<string, unknown>,
) {
  return operation({ action: "update", reservationId, ...input });
}

export function requestReservationTransition(
  reservationId: string,
  nextStatus: OperationalReservationStatus,
) {
  return operation({ action: "transition", reservationId, nextStatus });
}
