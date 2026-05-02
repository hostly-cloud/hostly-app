"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  acceptInvite,
  getMyPendingInvite,
} from "@/lib/firestore/restaurant-invites";
import { subscribeToAuthState } from "@/lib/auth/auth";
import {
  parseRoleField,
  type UserRestaurantRole,
} from "@/lib/firestore/user-restaurant-profile";

type AuthContextValue = {
  user: User | null;
  restaurantId: string | null;
  restaurantName: string | null;
  /** Rol en el restaurante (owner | staff). */
  role: UserRestaurantRole;
  ready: boolean;
  refreshProfile: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [role, setRole] = useState<UserRestaurantRole>("owner");
  const [ready, setReady] = useState(false);

  const applyRestaurantFromUid = useCallback((uid: string | null) => {
    if (!uid) {
      setRestaurantId(null);
      setRestaurantName(null);
      setRole("owner");
      return;
    }
    setRestaurantId(null);
    setRestaurantName(null);
    setRole("owner");
    void (async () => {
      const userRef = doc(db, "users", uid);
      let snap = await getDoc(userRef);
      if (!snap.exists()) {
        throw new Error("NO_RESTAURANT_ASSIGNED");
      }
      let d = snap.data() as Record<string, unknown>;
      let restaurantIdRaw = d.restaurantId;
      let rid =
        typeof restaurantIdRaw === "string" ? restaurantIdRaw.trim() : "";

      const authUser = auth.currentUser;
      if (!rid && authUser?.email) {
        try {
          const invite = await getMyPendingInvite(authUser.email);
          if (invite) {
            await acceptInvite(invite, uid);
            snap = await getDoc(userRef);
            if (!snap.exists()) {
              throw new Error("NO_RESTAURANT_ASSIGNED");
            }
            d = snap.data() as Record<string, unknown>;
            restaurantIdRaw = d.restaurantId;
            rid =
              typeof restaurantIdRaw === "string"
                ? restaurantIdRaw.trim()
                : "";
          }
        } catch (e) {
          console.error("[AUTH] pending invite accept", e);
        }
      }

      if (!rid) {
        throw new Error("NO_RESTAURANT_ASSIGNED");
      }

      const restaurantRef = doc(db, "restaurants", rid);
      const restaurantSnap = await getDoc(restaurantRef);

      const nameRaw = restaurantSnap.exists()
        ? (restaurantSnap.data() as Record<string, unknown>).name
        : null;
      const rn =
        typeof nameRaw === "string" && nameRaw.trim() !== ""
          ? nameRaw.trim()
          : null;

      setRestaurantId(rid);
      setRestaurantName(rn);
      setRole(parseRoleField(d.role) ?? "owner");
    })();
  }, []);

  const refreshProfile = useCallback(() => {
    const u = auth.currentUser;
    setUser(u);
    applyRestaurantFromUid(u?.uid ?? null);
  }, [applyRestaurantFromUid]);

  useEffect(() => {
    console.log("[AUTH] init");
    if (!isFirebaseConfigured) {
      setUser(null);
      setRestaurantId(null);
      setRestaurantName(null);
      setRole("owner");
      setReady(true);
      console.log("[AUTH] ready true");
      return;
    }

    const unsub = subscribeToAuthState((u) => {
      console.log("[AUTH] state changed", u?.uid ?? null);
      setUser(u);
      applyRestaurantFromUid(u?.uid ?? null);
      setReady(true);
      console.log("[AUTH] ready true");
    });

    return () => {
      unsub();
    };
  }, [applyRestaurantFromUid]);

  const value = useMemo(
    () => ({
      user,
      restaurantId,
      restaurantName,
      role,
      ready,
      refreshProfile,
    }),
    [user, restaurantId, restaurantName, role, ready, refreshProfile],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
