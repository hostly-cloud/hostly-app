"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  CAPABILITY_DENIED_MESSAGE,
  type HostlyCapability,
} from "@/lib/auth/hostly-capabilities";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { HostlyPermissionState } from "@/components/ui/hostly";

export function CapabilityModuleGate({
  capability,
  children,
}: {
  capability: HostlyCapability;
  children: ReactNode;
}) {
  const { ready, user, profileReady, profileAccessIssue, restaurantId } =
    useAuth();
  const { can } = useHostlyCapabilities();

  if (!ready || !user || !profileReady || profileAccessIssue || !restaurantId) {
    return (
      <HostlyPermissionState>
        {profileAccessIssue
          ? "No se puede autorizar el acceso a este módulo."
          : "Validando acceso…"}
      </HostlyPermissionState>
    );
  }

  if (!can(capability)) {
    return <HostlyPermissionState>{CAPABILITY_DENIED_MESSAGE}</HostlyPermissionState>;
  }

  return <>{children}</>;
}

/** @deprecated Usa CapabilityModuleGate con capabilities canónicas. */
export default function SensitiveModuleGate({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <CapabilityModuleGate capability="inventory.view">
      {children}
    </CapabilityModuleGate>
  );
}
