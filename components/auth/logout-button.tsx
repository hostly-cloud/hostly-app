"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authErrorMessage, logout } from "@/lib/auth/auth";
import { useAuth } from "@/components/auth/auth-context";

type LogoutButtonProps = {
  surface?: "dark" | "light";
  compact?: boolean;
  className?: string;
  onBeforeNavigate?: () => void;
};

export function LogoutButton({
  surface = "dark",
  compact = false,
  className,
  onBeforeNavigate,
}: LogoutButtonProps) {
  const router = useRouter();
  const { user, ready, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!ready || !user) return null;

  const light = surface === "light";

  return (
    <button
      type="button"
      className={className}
      disabled={loading}
      onClick={() => {
        setLoading(true);
        void (async () => {
          try {
            await logout();
            refreshProfile();
            onBeforeNavigate?.();
            router.replace("/login");
          } catch (error: unknown) {
            console.error("[AUTH] logout failed", authErrorMessage(error));
          } finally {
            setLoading(false);
          }
        })();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: compact ? 28 : 34,
        padding: compact ? "5px 9px" : "7px 12px",
        borderRadius: compact ? 9 : 11,
        border: light
          ? "1px solid rgba(148, 163, 184, 0.28)"
          : "1px solid rgba(148, 163, 184, 0.2)",
        background: light ? "rgba(255, 255, 255, 0.76)" : "rgba(15, 23, 42, 0.42)",
        color: light ? "#334155" : "#cbd5e1",
        fontSize: compact ? 11 : 12,
        fontWeight: 650,
        letterSpacing: "-0.01em",
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.68 : 1,
        boxShadow: light ? "0 1px 2px rgba(15, 23, 42, 0.04)" : "none",
        transition:
          "background-color 140ms ease, border-color 140ms ease, color 140ms ease, opacity 140ms ease",
        whiteSpace: "nowrap",
      }}
      aria-label="Cerrar sesión"
      title={user.email ? `Cerrar sesión (${user.email})` : "Cerrar sesión"}
    >
      {loading ? "Saliendo…" : "Salir"}
    </button>
  );
}
