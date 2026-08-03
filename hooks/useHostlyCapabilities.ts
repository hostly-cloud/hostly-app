"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  canUser,
  getCapabilitiesForRole,
  listCapabilitiesForRole,
  normalizeHostlyRoleFromProfile,
  type HostlyCapability,
  type HostlyRole,
} from "@/lib/auth/hostly-capabilities";

export function useHostlyCapabilities() {
  const {
    user,
    restaurantId,
    role: profileRole,
    profileAccessIssue,
  } = useAuth();

  const role = useMemo<HostlyRole | null>(
    () =>
      user && restaurantId && !profileAccessIssue
        ? normalizeHostlyRoleFromProfile(profileRole)
        : null,
    [profileAccessIssue, profileRole, restaurantId, user],
  );

  const capabilities = useMemo(
    () => listCapabilitiesForRole(role),
    [role],
  );

  const capabilitySet = useMemo(
    () => getCapabilitiesForRole(role),
    [role],
  );

  const can = useMemo(
    () =>
      (capability: HostlyCapability): boolean =>
        canUser({ role, userId: user?.uid ?? null }, capability),
    [role, user?.uid],
  );

  const cannot = useMemo(
    () => (capability: HostlyCapability) => !can(capability),
    [can],
  );

  return {
    role,
    profileRole,
    capabilities,
    capabilitySet,
    can,
    cannot,
  };
}
