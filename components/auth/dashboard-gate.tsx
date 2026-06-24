"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/auth-context";

export function DashboardGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard";
  const searchParams = useSearchParams();
  const { user, ready } = useAuth();

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    if (!ready) return;
    if (user) return;
    const qs = searchParams.toString();
    const next = `${pathname}${qs ? `?${qs}` : ""}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [ready, user, router, pathname, searchParams]);

  if (!isFirebaseConfigured) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="hostly-session-state">
        <div className="hostly-session-state__panel" role="status">
          Preparando sesión…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="hostly-session-state">
        <div className="hostly-session-state__panel" role="status">
          Redirigiendo a login…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
