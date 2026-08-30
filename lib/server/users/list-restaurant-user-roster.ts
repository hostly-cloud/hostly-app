import type { Firestore } from "firebase-admin/firestore";
import { assertAuthorizedProfileSnapshots } from "@/lib/server/auth/authorized-profile";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";

export type RestaurantUserRosterEntry = {
  id: string;
  displayName: string;
};

function displayName(data: Record<string, unknown>): string {
  for (const key of ["displayName", "nombre", "name"] as const) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Camarero sin nombre";
}

export async function listRestaurantUserRoster(
  db: Firestore,
  restaurantId: string,
): Promise<RestaurantUserRosterEntry[]> {
  const canonicalSnapshot = await db
    .collection("users")
    .where("restaurantId", "==", restaurantId)
    .get();
  if (canonicalSnapshot.empty) return [];

  const mirrorSnapshots = await db.getAll(
    ...canonicalSnapshot.docs.map((document) =>
      db.collection("usuarios").doc(document.id),
    ),
  );

  const roster: RestaurantUserRosterEntry[] = [];
  canonicalSnapshot.docs.forEach((document, index) => {
    try {
      const profile = assertAuthorizedProfileSnapshots({
        uid: document.id,
        canonicalSnapshot: document,
        mirrorSnapshot: mirrorSnapshots[index],
      });
      if (
        profile.restaurantId !== restaurantId ||
        !serverRoleHasCapability(profile.rawRole, "tpv.sell")
      ) {
        return;
      }
      roster.push({
        id: document.id,
        displayName: displayName(document.data() as Record<string, unknown>),
      });
    } catch {
      // Un perfil incoherente o disabled nunca entra en el roster operativo.
    }
  });

  return roster.sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "es"),
  );
}
