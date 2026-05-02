"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/auth-context";

export function DashboardGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, ready } = useAuth();

  useEffect(() => {
    console.log("[DASHBOARD] render", { ready, uid: user?.uid ?? null });
  }, [ready, user?.uid]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    if (!ready) return;
    if (user) return;
    console.log("[DASHBOARD] redirect login");
    router.replace("/login");
  }, [ready, user, router]);

  if (!isFirebaseConfigured) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="p-6 text-white" style={{ backgroundColor: "#000" }}>
        Cargando…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-white" style={{ backgroundColor: "#000" }}>
        Cargando…
      </div>
    );
  }

  return <>{children}</>;
}
