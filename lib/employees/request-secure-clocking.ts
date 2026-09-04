import { auth } from "@/lib/firebase/client";
import type { ClockAction, TimeEntryStatus } from "@/lib/employees/types";

export type ClockingSelfState = {
  employeeId: string;
  displayName: string;
  status: TimeEntryStatus | "not_started";
  allowedActions: ClockAction[];
  config: {
    enabled: boolean;
    locationConfigured: boolean;
    networkConfigured: boolean;
  };
};

export type ClockingAdminState = {
  config: {
    enabled: boolean;
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number;
    maxAccuracyMeters: number;
    locationConfigured: boolean;
    networkConfigured: boolean;
    qrRefreshSeconds: number;
  };
  employees: Array<{
    id: string;
    displayName: string;
    email?: string;
    role?: string;
    status?: string;
    pinConfigured: boolean;
    clockStatus: TimeEntryStatus | "not_started";
  }>;
};

export type ClockingChallenge = {
  token: string;
  refreshAt: number;
  expiresAt: number;
};

async function authHeaders(json = true): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("UNAUTHORIZED");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

async function readPayload<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string } & T)
    | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || fallback);
  return payload as T;
}

async function post<T = Record<string, never>>(body: Record<string, unknown>) {
  const response = await fetch("/api/employees/clocking", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  return readPayload<T>(response, "CLOCKING_OPERATION_FAILED");
}

export async function requestClockingSelfState(): Promise<ClockingSelfState> {
  const response = await fetch("/api/employees/clocking?mode=self", {
    headers: await authHeaders(false),
    cache: "no-store",
  });
  const payload = await readPayload<{ state: ClockingSelfState }>(
    response,
    "CLOCKING_STATE_FAILED",
  );
  return payload.state;
}

export async function requestClockingAdminState(): Promise<ClockingAdminState> {
  const response = await fetch("/api/employees/clocking?mode=admin", {
    headers: await authHeaders(false),
    cache: "no-store",
  });
  const payload = await readPayload<{ state: ClockingAdminState }>(
    response,
    "CLOCKING_ADMIN_STATE_FAILED",
  );
  return payload.state;
}

export async function requestClockingChallenge(): Promise<ClockingChallenge> {
  const response = await fetch("/api/employees/clocking?mode=challenge", {
    headers: await authHeaders(false),
    cache: "no-store",
  });
  const payload = await readPayload<{ challenge: ClockingChallenge }>(
    response,
    "CLOCKING_CHALLENGE_FAILED",
  );
  return payload.challenge;
}

export function requestClockingConfigSave(input: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  maxAccuracyMeters: number;
  enabled: boolean;
}) {
  return post({ action: "config.save", ...input });
}

export function requestClockingNetworkCapture() {
  return post({ action: "network.capture" });
}

export function requestClockingNetworkClear() {
  return post({ action: "network.clear" });
}

export function requestEmployeeClockPin(employeeId: string, pin: string) {
  return post({ action: "pin.set", employeeId, pin });
}

export function requestTerminalClock(input: {
  employeeId: string;
  pin: string;
  clockAction: ClockAction;
}) {
  return post({ action: "clock.terminal", ...input });
}

export async function requestQrClock(input: {
  token: string;
  clockAction: ClockAction;
  latitude: number;
  longitude: number;
  accuracy: number;
}) {
  const payload = await post<{ state: ClockingSelfState }>({
    action: "clock.qr",
    ...input,
  });
  return payload.state;
}
