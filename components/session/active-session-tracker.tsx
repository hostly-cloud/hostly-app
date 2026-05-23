"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { useActiveSessionHeartbeat } from "@/hooks/useActiveSessionHeartbeat";

/**
 * Heartbeat global de sesión activa por restaurante.
 * Montado una vez en el layout del dashboard — no duplica listeners por ruta.
 */
export function ActiveSessionTracker() {
  const pathname = usePathname();
  const { user, restaurantId, role, ready, profileReady } = useAuth();

  const userName =
    user?.displayName?.trim() ||
    user?.email?.trim() ||
    undefined;

  useActiveSessionHeartbeat({
    enabled:
      isFirebaseConfigured &&
      ready &&
      profileReady &&
      Boolean(user?.uid && restaurantId),
    restaurantId,
    userId: user?.uid ?? null,
    userName,
    userRole: role,
    route: pathname,
  });

  return null;
}
