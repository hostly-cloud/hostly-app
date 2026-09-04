"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HostlyButton } from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/auth-context";
import { logout } from "@/lib/auth/auth";
import {
  canAccessDashboardPath,
  requireCapabilityLabel,
  requiredCapabilityForDashboardPath,
} from "@/lib/auth/hostly-capabilities";

export function DashboardGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard";
  const searchParams = useSearchParams();
  const { user, role, ready, profileReady, profileAccessIssue } = useAuth();

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

  if (!profileReady) {
    return (
      <div className="hostly-session-state">
        <div className="hostly-session-state__panel" role="status">
          Validando acceso…
        </div>
      </div>
    );
  }

  if (profileAccessIssue) {
    const disabled = profileAccessIssue === "PROFILE_DISABLED";
    return (
      <div className="hostly-session-state">
        <div className="hostly-session-state__panel" role="alert">
          <p className="m-0 font-semibold">
            {disabled ? "Acceso deshabilitado" : "Perfil pendiente de revisión"}
          </p>
          <p className="mb-0 mt-2 text-sm">
            {disabled
              ? "Tu cuenta está desactivada. Contacta con un administrador de Hostly."
              : "No se puede autorizar el restaurante hasta revisar la coherencia del perfil."}
          </p>
          <HostlyButton
            variant="secondary"
            size="compact"
            className="mt-4"
            onClick={() => void logout()}
          >
            Cerrar sesión
          </HostlyButton>
        </div>
      </div>
    );
  }

  if (!canAccessDashboardPath(role, pathname)) {
    const required = requiredCapabilityForDashboardPath(pathname);
    return (
      <div className="hostly-session-state">
        <div className="hostly-session-state__panel" role="alert">
          <p className="m-0 font-semibold">Acceso restringido</p>
          <p className="mb-0 mt-2 text-sm">
            Tu rol no permite abrir esta sección.
            {required ? ` Permiso necesario: ${requireCapabilityLabel(required)}.` : ""}
          </p>
          <HostlyButton
            variant="secondary"
            size="compact"
            className="mt-4"
            onClick={() => router.replace("/dashboard")}
          >
            Volver al inicio
          </HostlyButton>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
