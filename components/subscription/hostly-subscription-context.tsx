"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth/auth-context";
import { fetchHostlySubscriptionAccess } from "@/lib/subscription/hostly-subscription-access-api";
import type { HostlySubscriptionAccess } from "@/lib/subscription/hostly-subscription-access";

type SubscriptionSnapshot = {
  restaurantId: string | null;
  state: "idle" | "loading" | "ready" | "error";
  access: HostlySubscriptionAccess | null;
};

const EMPTY_SNAPSHOT: SubscriptionSnapshot = {
  restaurantId: null,
  state: "idle",
  access: null,
};

const HostlySubscriptionContext = createContext<SubscriptionSnapshot | null>(null);

export function HostlySubscriptionProvider({ children }: { children: ReactNode }) {
  const { profileReady, ready, restaurantId, user } = useAuth();
  const resolvedRestaurantId = restaurantId?.trim() ?? "";
  const [snapshot, setSnapshot] = useState<SubscriptionSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    if (!ready || !profileReady || !user?.uid || !resolvedRestaurantId) return undefined;

    let active = true;
    void fetchHostlySubscriptionAccess()
      .then((access) => {
        if (!active) return;
        setSnapshot({
          restaurantId: resolvedRestaurantId,
          state: "ready",
          access,
        });
      })
      .catch(() => {
        if (!active) return;
        setSnapshot({
          restaurantId: resolvedRestaurantId,
          state: "error",
          access: null,
        });
      });

    return () => {
      active = false;
    };
  }, [profileReady, ready, resolvedRestaurantId, user?.uid]);

  const value = useMemo<SubscriptionSnapshot>(() => {
    if (!resolvedRestaurantId) return EMPTY_SNAPSHOT;
    if (snapshot.restaurantId !== resolvedRestaurantId) {
      return {
        restaurantId: resolvedRestaurantId,
        state: "loading",
        access: null,
      };
    }
    return snapshot;
  }, [resolvedRestaurantId, snapshot]);

  return (
    <HostlySubscriptionContext.Provider value={value}>
      {children}
    </HostlySubscriptionContext.Provider>
  );
}

export function useHostlySubscription(): SubscriptionSnapshot {
  const value = useContext(HostlySubscriptionContext);
  if (!value) {
    throw new Error("useHostlySubscription must be used within HostlySubscriptionProvider");
  }
  return value;
}
