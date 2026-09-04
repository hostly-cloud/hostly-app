"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HostlyButton } from "@/components/ui/hostly";
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
    <HostlyButton
      variant={light ? "secondary" : "ghost"}
      size="compact"
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
        minHeight: compact ? 28 : 34,
        padding: compact ? "5px 9px" : "7px 12px",
        borderRadius: compact ? 9 : 11,
        fontSize: compact ? 11 : 12,
        whiteSpace: "nowrap",
      }}
      aria-label="Cerrar sesión"
      title={user.email ? `Cerrar sesión (${user.email})` : "Cerrar sesión"}
    >
      {loading ? "Saliendo…" : "Salir"}
    </HostlyButton>
  );
}
