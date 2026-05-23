"use client";

import type { CSSProperties } from "react";
import {
  formatConnectivityLabel,
  isConnectivityOperationallyRisky,
  type ConnectivityStatus,
} from "@/lib/client/connectivity-state";

const pillBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

export type ConnectivityStatusPillProps = {
  status: ConnectivityStatus;
  label?: string;
  className?: string;
};

export function ConnectivityStatusPill({
  status,
  label,
  className,
}: ConnectivityStatusPillProps) {
  if (!isConnectivityOperationallyRisky(status) && status !== "reconnecting") {
    return null;
  }

  const text =
    label ??
    (status === "reconnecting"
      ? formatConnectivityLabel(status)
      : status === "offline"
        ? "Conexión inestable"
        : "Conexión inestable");

  const style: CSSProperties =
    status === "offline"
      ? {
          color: "#92400e",
          background: "rgba(254, 243, 199, 0.88)",
          border: "1px solid rgba(245, 158, 11, 0.32)",
        }
      : {
          color: "#315f7d",
          background: "rgba(219, 234, 254, 0.72)",
          border: "1px solid rgba(49, 95, 125, 0.18)",
        };

  return (
    <span
      className={className}
      style={{ ...pillBase, ...style }}
      role="status"
      aria-live="polite"
    >
      {text}
    </span>
  );
}

export function KdsConnectivityPill({ status }: { status: ConnectivityStatus }) {
  if (status === "online") return null;

  const label =
    status === "reconnecting"
      ? "Reconectando realtime…"
      : "Realtime pausado";

  return (
    <div style={{ padding: "0 2px 4px" }}>
      <span
        style={{
          ...pillBase,
          color: status === "offline" ? "#92400e" : "#315f7d",
          background:
            status === "offline"
              ? "rgba(254, 243, 199, 0.88)"
              : "rgba(219, 234, 254, 0.72)",
          border:
            status === "offline"
              ? "1px solid rgba(245, 158, 11, 0.32)"
              : "1px solid rgba(49, 95, 125, 0.18)",
        }}
        role="status"
        aria-live="polite"
      >
        {label}
      </span>
    </div>
  );
}
