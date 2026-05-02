"use client";

import type { ReactNode } from "react";
import { DashboardGate } from "@/components/auth/dashboard-gate";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";

/**
 * Todo el área /dashboard sigue reglas TPV táctil (data-hostly-touch → globals.css).
 */
export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { restaurantId } = useAuth();

  return (
    <div
      className="hostly-touch-root min-h-full flex flex-col"
      data-hostly-touch
    >
      <DashboardGate>
        {isFirebaseConfigured && !restaurantId ? (
          <div>No tienes restaurante asignado</div>
        ) : (
          children
        )}
      </DashboardGate>
    </div>
  );
}
