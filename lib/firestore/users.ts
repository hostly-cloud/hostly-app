import type { User } from "firebase/auth";

export type OperationalRestaurantUser = {
  id: string;
  displayName: string;
};

export type RestaurantRosterUser = Pick<User, "uid" | "getIdToken">;

export type GetUsersByRestaurantParams = {
  restaurantId: string;
  user: RestaurantRosterUser | null | undefined;
};

export type RestaurantRosterErrorKind =
  | "network"
  | "unauthorized"
  | "identity_conflict"
  | "invalid_response";

export class RestaurantRosterError extends Error {
  readonly kind: RestaurantRosterErrorKind;
  readonly httpStatus: number | null;

  constructor(
    kind: RestaurantRosterErrorKind,
    message: string,
    httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "RestaurantRosterError";
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

export const getUsersByRestaurant = async ({
  restaurantId,
  user,
}: GetUsersByRestaurantParams): Promise<OperationalRestaurantUser[]> => {
  if (!user) {
    throw new RestaurantRosterError("unauthorized", "UNAUTHORIZED", 401);
  }
  const rid = restaurantId.trim();
  if (!rid) {
    throw new RestaurantRosterError(
      "identity_conflict",
      "RESTAURANT_CONTEXT_REQUIRED",
    );
  }

  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/users/roster", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string; users?: OperationalRestaurantUser[] }
      | null;
    if (!response.ok) {
      const kind: RestaurantRosterErrorKind =
        response.status === 401 || response.status === 403
          ? "unauthorized"
          : response.status === 409
            ? "identity_conflict"
            : "network";
      throw new RestaurantRosterError(
        kind,
        payload?.error || "USER_ROSTER_FAILED",
        response.status,
      );
    }
    if (!payload?.ok || !Array.isArray(payload.users)) {
      throw new RestaurantRosterError(
        "invalid_response",
        "USER_ROSTER_INVALID_RESPONSE",
        response.status,
      );
    }
    return payload.users.filter(
      (entry): entry is OperationalRestaurantUser =>
        typeof entry?.id === "string" &&
        entry.id.trim().length > 0 &&
        typeof entry.displayName === "string" &&
        entry.displayName.trim().length > 0,
    );
  } catch (error) {
    if (error instanceof RestaurantRosterError) throw error;
    throw new RestaurantRosterError(
      "network",
      error instanceof Error ? error.message : "USER_ROSTER_FAILED",
    );
  }
};
