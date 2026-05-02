"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authErrorMessage, login, logout, register } from "@/lib/auth/auth";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/auth-context";

const CARTA = "/dashboard/carta";

export default function LoginPage() {
  const router = useRouter();
  const { user, ready, refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantNameInput, setRestaurantNameInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<"login" | "register" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    console.log("[AUTH] handleLogin");
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
      await router.push(CARTA);
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
    console.log("[AUTH] handleRegister");
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
      await router.push(CARTA);
    } catch (error: unknown) {
      const message = authErrorMessage(error);
      console.error("[REGISTER ERROR]", message, error);
      setError(message);
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <div style={{ padding: 24, backgroundColor: "#000", color: "#fff" }}>
        Falta configuración de Firebase
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ padding: 24, backgroundColor: "#000", color: "#fff" }}>
        Cargando…
      </div>
    );
  }

  if (user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#000",
          color: "#fff",
          padding: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: 360 }}>
          <h1 style={{ marginTop: 0 }}>Sesión activa</h1>
          <p style={{ fontSize: 14, color: "#cbd5e1" }}>
            {user.email ?? user.uid}
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={() => void router.push(CARTA)}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "none",
              backgroundColor: "#16a34a",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 10,
            }}
          >
            Ir a carta
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
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #444",
              backgroundColor: "#1f1f1f",
              color: "#fff",
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            Cerrar sesión (crear otra cuenta)
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
        backgroundColor: "#000",
        color: "#fff",
        padding: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <h1 style={{ marginTop: 0 }}>Iniciar sesión</h1>
        <label style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
          Email
          <input
            type="text"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 10,
              borderRadius: 8,
              border: "1px solid #444",
              backgroundColor: "#1f1f1f",
              color: "#fff",
              boxSizing: "border-box",
            }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 16, fontSize: 14 }}>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 10,
              borderRadius: 8,
              border: "1px solid #444",
              backgroundColor: "#1f1f1f",
              color: "#fff",
              boxSizing: "border-box",
            }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 16, fontSize: 14 }}>
          Nombre del restaurante (opcional)
          <input
            type="text"
            autoComplete="organization"
            value={restaurantNameInput}
            onChange={(e) => setRestaurantNameInput(e.target.value)}
            placeholder="Mi restaurante"
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 10,
              borderRadius: 8,
              border: "1px solid #444",
              backgroundColor: "#1f1f1f",
              color: "#fff",
              boxSizing: "border-box",
            }}
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
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 8,
            border: "none",
            backgroundColor: "#16a34a",
            color: "#fff",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            marginBottom: 10,
          }}
        >
          {loading && pendingAction === "login" ? "Entrando..." : "Entrar"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleRegister()}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 8,
            border: "1px solid #444",
            backgroundColor: "#1f1f1f",
            color: "#fff",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading && pendingAction === "register"
            ? "Creando cuenta..."
            : "Crear cuenta"}
        </button>
      </div>
    </div>
  );
}
