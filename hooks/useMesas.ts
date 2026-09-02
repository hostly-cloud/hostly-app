"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Mesa } from "@/types/mesa";

export const useMesas = (restaurantId?: string | null) => {
  const [snapshot, setSnapshot] = useState<{
    restaurantId: string;
    mesas: Mesa[];
  } | null>(null);
  const rid = restaurantId?.trim() ?? "";
  const mesas = rid && snapshot?.restaurantId === rid ? snapshot.mesas : [];
  const loading = Boolean(rid && snapshot?.restaurantId !== rid);

  useEffect(() => {
    if (!rid) return;

    const q = query(collection(db, "mesas"), where("restaurantId", "==", rid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Mesa, "id">),
      }));

      setSnapshot({ restaurantId: rid, mesas: data });
    });

    return () => unsubscribe();
  }, [rid]);

  return {
    mesas,
    loading,
  };
};
