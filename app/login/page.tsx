"use client";

import { useEffect, useMemo } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authErrorMessage, login, logout, register } from "@/lib/auth/auth";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/auth-context";

const DEFAULT_NEXT = "/dashboard";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/")) return DEFAULT_NEXT;
  if (value.startsWith("//")) return DEFAULT_NEXT;
  if (value.startsWith("/login")) return DEFAULT_NEXT;
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, ready, refreshProfile } = useAuth();
  const nextPath = useMemo(
    () => safeNextPath(searchParams.get("next")),
    [searchParams],
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantNameInput, setRestaurantNameInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<"login" | "register" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    setPendingAction("login");
    try {
      if (!isFirebaseConfigured) {
        setError("Firebase no está configurado");
        return;
      }
      await login(email, password);
      refreshProfile();
      router.replace(nextPath);
    } catch (error: unknown) {
      console.error(error);
      console.log("[AUTH] auth error", authErrorMessage(error));
      setError(authErrorMessage(error));
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    setError(null);
    setPendingAction("register");
    try {
      if (!isFirebaseConfigured) {
        setError("Firebase no está configurado");
        return;
      }
      await register(email, password, restaurantNameInput.trim() || undefined);
      refreshProfile();
      router.replace(nextPath);
    } catch (error: unknown) {
      const message = authErrorMessage(error);
      console.error("[REGISTER ERROR]", message, error);
      setError(message);
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  useEffect(() => {
    if (!ready || !user) return;
    router.replace(nextPath);
  }, [ready, user, router, nextPath]);

  const inputBase = {
    display: "block",
    width: "100%",
    marginTop: 7,
    padding: "12px 13px",
    borderRadius: 12,
    border: "1px solid rgba(148, 163, 184, 0.22)",
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    color: "#0f172a",
    boxSizing: "border-box" as const,
    outline: "none",
    fontSize: 14,
  };

  const primaryButton = {
    width: "100%",
    minHeight: 44,
    padding: 12,
    borderRadius: 12,
    border: "none",
    backgroundColor: "#0f172a",
    color: "#fff",
    fontWeight: 700,
    cursor: loading ? "wait" : "pointer",
    marginBottom: 10,
  };

  const secondaryButton = {
    width: "100%",
    minHeight: 44,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(148, 163, 184, 0.28)",
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    color: "#334155",
    fontWeight: 700,
    cursor: loading ? "wait" : "pointer",
  };

  if (!isFirebaseConfigured) {
    return (
      <div style={{ padding: 24, backgroundColor: "#f8fafc", color: "#0f172a" }}>
        Falta configuración de Firebase
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#f7f4ef] text-slate-700">
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 text-sm font-semibold shadow-sm">
          Preparando sesión…
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#f7f4ef",
          color: "#0f172a",
          padding: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: 380 }}>
          <h1 style={{ marginTop: 0 }}>Sesión activa</h1>
          <p style={{ fontSize: 14, color: "#64748b" }}>
            {user.email ?? user.uid}
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={() => router.replace(nextPath)}
            style={primaryButton}
          >
            Entrar en Hostly
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setError(null);
              void (async () => {
                try {
                  await logout();
                } catch (error: unknown) {
                  console.error(error);
                  setError(authErrorMessage(error));
                } finally {
                  setLoading(false);
                }
              })();
            }}
            style={secondaryButton}
          >
            Cerrar sesión
          </button>
          {error ? (
            <p role="alert" style={{ color: "#f87171", fontSize: 14, marginTop: 12 }}>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #fbfaf7 0%, #f4efe7 100%)",
        color: "#0f172a",
        padding: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 390 }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>
            Hostly
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: 30, letterSpacing: "-0.05em" }}>
            Iniciar sesión
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 14, lineHeight: 1.5 }}>
            Accede a tu restaurante para operar sala, cocina, reservas y configuración.
          </p>
        </div>
        <div
          style={{
            padding: 18,
            borderRadius: 22,
            border: "1px solid rgba(148, 163, 184, 0.22)",
            background: "rgba(255, 255, 255, 0.72)",
            boxShadow: "0 16px 44px rgba(15, 23, 42, 0.08)",
          }}
        >
        <label style={{ display: "block", marginBottom: 13, fontSize: 13, fontWeight: 650, color: "#334155" }}>
          Email
          <input
            type="text"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputBase}
          />
        </label>
        <label style={{ display: "block", marginBottom: 13, fontSize: 13, fontWeight: 650, color: "#334155" }}>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputBase}
          />
        </label>
        <label style={{ display: "block", marginBottom: 16, fontSize: 13, fontWeight: 650, color: "#334155" }}>
          Nombre del restaurante (opcional)
          <input
            type="text"
            autoComplete="organization"
            value={restaurantNameInput}
            onChange={(e) => setRestaurantNameInput(e.target.value)}
            placeholder="Mi restaurante"
            style={inputBase}
          />
        </label>
        {error ? (
          <p
            role="alert"
            style={{
              color: "#f87171",
              fontSize: 14,
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleLogin()}
          style={primaryButton}
        >
          {loading && pendingAction === "login" ? "Entrando..." : "Entrar"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleRegister()}
          style={secondaryButton}
        >
          {loading && pendingAction === "register"
            ? "Creando cuenta..."
            : "Crear cuenta"}
        </button>
        </div>
      </div>
    </div>
  );
}
