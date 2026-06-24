"use client";

import type { ReactNode } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { CAPABILITY_DENIED_MESSAGE } from "@/lib/auth/hostly-capabilities";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { HostlyPermissionState } from "@/components/ui/hostly";

export function ConfiguracionCapabilityShell({
  children,
}: {
  children: ReactNode;
}) {
  const { can } = useHostlyCapabilities();

  if (!can("settings.manage")) {
    return <HostlyPermissionState>{CAPABILITY_DENIED_MESSAGE}</HostlyPermissionState>;
  }

  return <>{children}</>;
}

export function UsuariosCapabilityShell({
  children,
}: {
  children: ReactNode;
}) {
  const { can } = useHostlyCapabilities();

  if (!can("users.manage")) {
    return (
      <ModulePageShell title="Usuarios" subtitle="Gestión de accesos">
        <HostlyPermissionState embedded>{CAPABILITY_DENIED_MESSAGE}</HostlyPermissionState>
      </ModulePageShell>
    );
  }

  return <>{children}</>;
}
