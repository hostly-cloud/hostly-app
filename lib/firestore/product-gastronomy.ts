import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import {
  productGastronomyToFirestore,
  readProductGastronomy,
  type ReadProductGastronomyResult,
} from "@/lib/carta/product-gastronomy";
import type { ProductGastronomy } from "@/types/product";

export type ProductGastronomySnapshot = ReadProductGastronomyResult & {
  productId: string;
};

export function listenProductGastronomyByRestaurant(
  restaurantId: string,
  onData: (items: ReadonlyMap<string, ProductGastronomySnapshot>) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  if (!rid || !auth.currentUser) {
    onData(new Map());
    return () => {};
  }

  return onSnapshot(
    collection(db, "restaurants", rid, "products"),
    (snap) => {
      const map = new Map<string, ProductGastronomySnapshot>();
      for (const productDoc of snap.docs) {
        const parsed = readProductGastronomy(productDoc.data() as Record<string, unknown>);
        map.set(productDoc.id, { productId: productDoc.id, ...parsed });
      }
      onData(map);
    },
    (error) => onError?.(error),
  );
}

export async function updateProductGastronomy(params: {
  restaurantId: string;
  productId: string;
  gastronomy: ProductGastronomy;
}): Promise<void> {
  const rid = params.restaurantId.trim();
  const productId = params.productId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  if (!productId) throw new Error("MISSING_PRODUCT_ID");
  if (!auth.currentUser) throw new Error("AUTH_REQUIRED");

  const gastronomy = productGastronomyToFirestore(params.gastronomy);
  await updateDoc(doc(db, "restaurants", rid, "products", productId), {
    gastronomy,
    updatedAt: serverTimestamp(),
  });
}
