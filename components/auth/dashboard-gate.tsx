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
      <div className="grid min-h-dvh place-items-center bg-slate-950 text-slate-200">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-medium shadow-sm">
          Preparando sesión…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-950 text-slate-200">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-medium shadow-sm">
          Redirigiendo a login…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
