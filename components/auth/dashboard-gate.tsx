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
      <div
        className="grid min-h-dvh place-items-center px-4"
        style={{
          background:
            "linear-gradient(180deg, var(--hostly-surface-page-soft) 0%, var(--hostly-surface-page) 55%, var(--hostly-ice-100) 100%)",
          color: "var(--hostly-ink)",
        }}
      >
        <div
          className="rounded-[var(--hostly-radius-lg)] px-5 py-4 text-sm font-medium shadow-[var(--hostly-shadow-card)]"
          style={{
            border: "1px solid var(--hostly-line)",
            background: "var(--hostly-surface-card-solid)",
            color: "var(--hostly-ink-muted)",
          }}
        >
          Preparando sesión…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="grid min-h-dvh place-items-center px-4"
        style={{
          background:
            "linear-gradient(180deg, var(--hostly-surface-page-soft) 0%, var(--hostly-surface-page) 55%, var(--hostly-ice-100) 100%)",
          color: "var(--hostly-ink)",
        }}
      >
        <div
          className="rounded-[var(--hostly-radius-lg)] px-5 py-4 text-sm font-medium shadow-[var(--hostly-shadow-card)]"
          style={{
            border: "1px solid var(--hostly-line)",
            background: "var(--hostly-surface-card-solid)",
            color: "var(--hostly-ink-muted)",
          }}
        >
          Redirigiendo a login…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
