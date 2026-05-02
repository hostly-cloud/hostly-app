"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Mesa } from "@/types/mesa";

export const useMesas = (restaurantId?: string | null) => {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setMesas([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, "mesas"), where("restaurantId", "==", restaurantId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Mesa, "id">),
      }));

      setMesas(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [restaurantId]);

  return {
    mesas,
    loading,
  };
};
