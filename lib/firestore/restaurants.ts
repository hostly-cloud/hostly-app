import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  parseRestaurantDocument,
  restaurantProfilePatchToFirestore,
  type RestaurantDocument,
  type RestaurantProfilePatch,
} from "@/lib/firestore/restaurant-types";

export type {
  RestaurantDocument,
  RestaurantProfileFields,
  RestaurantProfilePatch,
} from "@/lib/firestore/restaurant-types";

export {
  DEFAULT_RESTAURANT_CURRENCY,
  DEFAULT_RESTAURANT_TIMEZONE,
  emptyRestaurantDocument,
  parseRestaurantDocument,
} from "@/lib/firestore/restaurant-types";

export function restaurantDocRef(restaurantId: string) {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("RESTAURANT_ID_REQUIRED");
  return doc(db, "restaurants", rid);
}

/** Lee `restaurants/{restaurantId}` y normaliza campos con fallbacks para docs legacy. */
export async function getRestaurantById(
  restaurantId: string,
): Promise<RestaurantDocument | null> {
  const rid = restaurantId.trim();
  if (!rid) return null;

  const snap = await getDoc(restaurantDocRef(rid));
  if (!snap.exists()) return null;
  return parseRestaurantDocument(snap.id, snap.data());
}

export async function updateRestaurantProfile(
  restaurantId: string,
  patch: RestaurantProfilePatch,
): Promise<void> {
  const payload = restaurantProfilePatchToFirestore(patch);
  if (Object.keys(payload).length === 0) return;

  await updateDoc(restaurantDocRef(restaurantId), {
    ...payload,
    updatedAt: Date.now(),
  });
}

export const updateRestaurantName = async (restaurantId: string, name: string) => {
  await updateRestaurantProfile(restaurantId, { name: name.trim() });
};
