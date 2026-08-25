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
import { subscribeToAuthState } from "@/lib/auth/auth";
import {
  loadRestaurantNameById,
  loadUserRestaurantContext,
  DEFAULT_USER_RESTAURANT_ROLE,
  UserProfileAccessError,
  type UserRestaurantRole,
} from "@/lib/firestore/user-restaurant-profile";
import type { ProfileAuthorizationIssue } from "@/lib/auth/profile-authorization-policy";

type AuthContextValue = {
  user: User | null;
  restaurantId: string | null;
  restaurantName: string | null;
  /** Rol en el restaurante (owner | staff). */
  role: UserRestaurantRole;
  ready: boolean;
  /** Perfil multi-restaurante resuelto (o fallido); evita mensaje de “sin restaurante” durante la carga. */
  profileReady: boolean;
  profileAccessIssue: ProfileAuthorizationIssue | "PROFILE_UNRESOLVED" | null;
  refreshProfile: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [role, setRole] = useState<UserRestaurantRole>(DEFAULT_USER_RESTAURANT_ROLE);
  const [ready, setReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [profileAccessIssue, setProfileAccessIssue] = useState<
    ProfileAuthorizationIssue | "PROFILE_UNRESOLVED" | null
  >(null);

  /** Monótono: solo la ejecución con requestId === valor actual puede escribir estado de perfil. */
  const profileLoadSeqRef = useRef(0);

  const applyRestaurantFromUser = useCallback((authUser: User | null) => {
    const requestId = ++profileLoadSeqRef.current;
    const uid = authUser?.uid ?? null;

    if (!uid) {
      setRestaurantId(null);
      setRestaurantName(null);
      setRole(DEFAULT_USER_RESTAURANT_ROLE);
      setProfileAccessIssue(null);
      setProfileReady(true);
      return;
    }

    setProfileReady(false);
    setProfileAccessIssue(null);

    void (async () => {
      const isStale = () => requestId !== profileLoadSeqRef.current;

      try {
        const ctx = await loadUserRestaurantContext(uid, authUser?.email);
        if (isStale()) {
          return;
        }

        const rid = ctx.restaurantId?.trim() ?? "";

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
        setProfileAccessIssue(null);
      } catch (e) {
        if (isStale()) {
          return;
        }
        if (process.env.NODE_ENV === "development") {
          console.warn("[AUTH] restaurant profile unresolved", e);
        }
        setRestaurantId(null);
        setRestaurantName(null);
        setRole(DEFAULT_USER_RESTAURANT_ROLE);
        setProfileAccessIssue(
          e instanceof UserProfileAccessError ? e.code : "PROFILE_UNRESOLVED",
        );
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
    applyRestaurantFromUser(u);
  }, [applyRestaurantFromUser]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      profileLoadSeqRef.current += 1;
      setUser(null);
      setRestaurantId(null);
      setRestaurantName(null);
      setRole(DEFAULT_USER_RESTAURANT_ROLE);
      setProfileAccessIssue(null);
      setProfileReady(true);
      setReady(true);
      return;
    }

    const unsub = subscribeToAuthState((u) => {
      setUser(u);
      applyRestaurantFromUser(u);
      setReady(true);
    });

    return () => {
      unsub();
    };
  }, [applyRestaurantFromUser]);

  const value = useMemo(
    () => ({
      user,
      restaurantId,
      restaurantName,
      role,
      ready,
      profileReady,
      profileAccessIssue,
      refreshProfile,
    }),
    [
      user,
      restaurantId,
      restaurantName,
      role,
      ready,
      profileReady,
      profileAccessIssue,
      refreshProfile,
    ],
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
