export const ACTIVE_OPERATOR_SESSION_KEY = "hostly.tpv.active_operator.v1";
export const LAST_OPERATOR_STORAGE_KEY = "hostly.tpv.last_operator.v1";

export const TPV_OPERATOR_BARRA_ID = "hostly-tpv-operator-barra";
export const TPV_OPERATOR_GENERIC_ID = "hostly-tpv-operator-generic";

export type ActiveOperatorSession = {
  activeOperatorId: string;
  activeOperatorName: string;
  activeOperatorRole: string;
  selectedAt: number;
  restaurantId: string;
};

export type TpvOperatorPickerOption = {
  id: string;
  name: string;
  role: string;
};

type LastOperatorByRestaurant = Record<
  string,
  { id: string; name: string } | undefined
>;

function isSessionAvailable(): boolean {
  return typeof window !== "undefined";
}

function parseSession(raw: unknown): ActiveOperatorSession | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const activeOperatorId =
    typeof row.activeOperatorId === "string" ? row.activeOperatorId.trim() : "";
  const activeOperatorName =
    typeof row.activeOperatorName === "string"
      ? row.activeOperatorName.trim()
      : "";
  const activeOperatorRole =
    typeof row.activeOperatorRole === "string"
      ? row.activeOperatorRole.trim()
      : "";
  const restaurantId =
    typeof row.restaurantId === "string" ? row.restaurantId.trim() : "";
  const selectedAt =
    typeof row.selectedAt === "number" && Number.isFinite(row.selectedAt)
      ? row.selectedAt
      : 0;

  if (
    !activeOperatorId ||
    !activeOperatorName ||
    !activeOperatorRole ||
    !restaurantId ||
    !selectedAt
  ) {
    return null;
  }

  return {
    activeOperatorId,
    activeOperatorName,
    activeOperatorRole,
    selectedAt,
    restaurantId,
  };
}

export function readActiveOperatorSession(): ActiveOperatorSession | null {
  if (!isSessionAvailable()) return null;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_OPERATOR_SESSION_KEY);
    if (!raw) return null;
    return parseSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeActiveOperatorSession(
  session: ActiveOperatorSession,
): void {
  if (!isSessionAvailable()) return;
  try {
    window.sessionStorage.setItem(
      ACTIVE_OPERATOR_SESSION_KEY,
      JSON.stringify(session),
    );
  } catch {
    // noop
  }
}

export function clearActiveOperatorSession(): void {
  if (!isSessionAvailable()) return;
  try {
    window.sessionStorage.removeItem(ACTIVE_OPERATOR_SESSION_KEY);
  } catch {
    // noop
  }
}

export function isActiveOperatorValidForRestaurant(
  session: ActiveOperatorSession | null | undefined,
  restaurantId: string | null | undefined,
): session is ActiveOperatorSession {
  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
  if (!rid || !session) return false;
  return session.restaurantId === rid;
}

export function readLastOperatorForRestaurant(
  restaurantId: string | null | undefined,
): { id: string; name: string } | null {
  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
  if (!rid || !isSessionAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(LAST_OPERATOR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastOperatorByRestaurant;
    const entry = parsed?.[rid];
    if (!entry?.id?.trim() || !entry?.name?.trim()) return null;
    return { id: entry.id.trim(), name: entry.name.trim() };
  } catch {
    return null;
  }
}

export function writeLastOperatorForRestaurant(
  restaurantId: string,
  operator: Pick<TpvOperatorPickerOption, "id" | "name">,
): void {
  if (!isSessionAvailable()) return;
  const rid = restaurantId.trim();
  if (!rid) return;
  try {
    const raw = window.localStorage.getItem(LAST_OPERATOR_STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as LastOperatorByRestaurant)
      : ({} as LastOperatorByRestaurant);
    parsed[rid] = { id: operator.id.trim(), name: operator.name.trim() };
    window.localStorage.setItem(
      LAST_OPERATOR_STORAGE_KEY,
      JSON.stringify(parsed),
    );
  } catch {
    // noop
  }
}
