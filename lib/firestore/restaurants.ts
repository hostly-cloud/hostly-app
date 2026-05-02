import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export const updateRestaurantName = async (restaurantId: string, name: string) => {
  const ref = doc(db, "restaurants", restaurantId);
  await updateDoc(ref, {
    name: name.trim(),
  });
};
