"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  acceptInvite,
  getMyPendingInvite,
} from "@/lib/firestore/restaurant-invites";
import { subscribeToAuthState } from "@/lib/auth/auth";
import {
  loadRestaurantNameById,
  loadUserRestaurantContext,
  type UserRestaurantRole,
} from "@/lib/firestore/user-restaurant-profile";

type AuthContextValue = {
  user: User | null;
  restaurantId: string | null;
  restaurantName: string | null;
  /** Rol en el restaurante (owner | staff). */
  role: UserRestaurantRole;
  ready: boolean;
  /** Perfil multi-restaurante resuelto (o fallido); evita mensaje de “sin restaurante” durante la carga. */
  profileReady: boolean;
  refreshProfile: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [role, setRole] = useState<UserRestaurantRole>("owner");
  const [ready, setReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);

  /** Monótono: solo la ejecución con requestId === valor actual puede escribir estado de perfil. */
  const profileLoadSeqRef = useRef(0);

  const applyRestaurantFromUid = useCallback((uid: string | null) => {
    const requestId = ++profileLoadSeqRef.current;

    if (!uid) {
      setRestaurantId(null);
      setRestaurantName(null);
      setRole("owner");
      setProfileReady(true);
      return;
    }

    setProfileReady(false);

    void (async () => {
      const isStale = () => requestId !== profileLoadSeqRef.current;

      try {
        let ctx = await loadUserRestaurantContext(uid);
        if (isStale()) {
          return;
        }

        let rid = ctx.restaurantId?.trim() ?? "";

        const authUser = auth.currentUser;
        if (!rid && authUser?.email) {
          try {
            const invite = await getMyPendingInvite(authUser.email);
            if (invite) {
              await acceptInvite(invite, uid);
              ctx = await loadUserRestaurantContext(uid);
              rid = ctx.restaurantId?.trim() ?? "";
            }
          } catch (e) {
            console.error("[AUTH] pending invite accept", e);
          }
        }

        if (isStale()) {
          return;
        }

        if (!rid) {
          throw new Error("NO_RESTAURANT_ASSIGNED");
        }

        let rn = ctx.restaurantName;
        if (rn == null || rn.trim() === "") {
          try {
            rn = await loadRestaurantNameById(rid);
          } catch (nameErr) {
            if (process.env.NODE_ENV === "development") {
              console.warn("[AUTH] loadRestaurantNameById failed", nameErr);
            }
            rn = null;
          }
        }

        if (isStale()) {
          return;
        }

        setRestaurantId(rid);
        setRestaurantName(rn);
        setRole(ctx.role);
      } catch (e) {
        if (isStale()) {
          return;
        }
        if (process.env.NODE_ENV === "development") {
          console.warn("[AUTH] restaurant profile unresolved", e);
        }
        setRestaurantId(null);
        setRestaurantName(null);
        setRole("owner");
      } finally {
        if (isStale()) {
          return;
        }
        setProfileReady(true);
      }
    })();
  }, []);

  const refreshProfile = useCallback(() => {
    const u = auth.currentUser;
    setUser(u);
    applyRestaurantFromUid(u?.uid ?? null);
  }, [applyRestaurantFromUid]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      profileLoadSeqRef.current += 1;
      setUser(null);
      setRestaurantId(null);
      setRestaurantName(null);
      setRole("owner");
      setProfileReady(true);
      setReady(true);
      return;
    }

    const unsub = subscribeToAuthState((u) => {
      setUser(u);
      applyRestaurantFromUid(u?.uid ?? null);
      setReady(true);
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
      profileReady,
      refreshProfile,
    }),
    [user, restaurantId, restaurantName, role, ready, profileReady, refreshProfile],
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
