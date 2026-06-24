import {
  updateRestaurantProfile,
  type RestaurantProfilePatch,
} from "@/lib/firestore/restaurants";
import { syncUserRestaurantName } from "@/lib/firestore/sync-user-restaurant-name";

/** Persiste perfil en `restaurants/{id}` y sincroniza `users.restaurantName` si cambia `name`. */
export async function saveRestaurantProfileWithUserSync(
  restaurantId: string,
  userId: string,
  patch: RestaurantProfilePatch,
): Promise<void> {
  await updateRestaurantProfile(restaurantId, patch);

  if ("name" in patch && typeof patch.name === "string") {
    await syncUserRestaurantName(userId, patch.name);
  }
}
