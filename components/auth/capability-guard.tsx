"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  CAPABILITY_DENIED_MESSAGE,
  type HostlyCapability,
} from "@/lib/auth/hostly-capabilities";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";

export type CapabilityGuardProps = {
  capability: HostlyCapability;
  children: ReactNode;
  fallback?: ReactNode;
};

/** Oculta contenido si falta la capacidad. */
export function CapabilityGuard({
  capability,
  children,
  fallback = null,
}: CapabilityGuardProps) {
  const { can } = useHostlyCapabilities();
  if (!can(capability)) return <>{fallback}</>;
  return <>{children}</>;
}

export type DisabledByCapabilityProps = {
  capability: HostlyCapability;
  children: ReactNode;
  /** Si true, deshabilita en lugar de ocultar. */
  disableOnly?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

/**
 * Deshabilita o oculta acciones sensibles según capacidad.
 * Por defecto: disableOnly=true (botón visible pero bloqueado).
 */
export function DisabledByCapability({
  capability,
  children,
  disableOnly = true,
  className,
  style,
  title,
}: DisabledByCapabilityProps) {
  const { can } = useHostlyCapabilities();
  const allowed = can(capability);

  if (!allowed && !disableOnly) return null;

  if (!allowed && disableOnly) {
    return (
      <span
        className={className}
        style={{ display: "inline-flex", ...style }}
        title={title ?? CAPABILITY_DENIED_MESSAGE}
      >
        <fieldset
          disabled
          style={{
            border: "none",
            margin: 0,
            padding: 0,
            minWidth: 0,
            display: "contents",
          }}
        >
          {children}
        </fieldset>
      </span>
    );
  }

  return (
    <span className={className} style={style} title={title}>
      {children}
    </span>
  );
}

export function capabilityDeniedTitle(
  allowed: boolean,
  customTitle?: string,
): string | undefined {
  if (allowed) return customTitle;
  return CAPABILITY_DENIED_MESSAGE;
}
