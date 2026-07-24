"use client";

import { FirebaseError } from "firebase/app";
import { Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  authErrorMessage,
  login,
  logout,
  refreshEmailVerification,
  register,
  resendEmailVerification,
} from "@/lib/auth/auth";
import { applyPendingInviteForUser } from "@/lib/auth/invite-resolution";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/auth-context";
import { HostlyBrandLockup } from "@/components/brand/hostly-brand";

const DEFAULT_NEXT = "/dashboard";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/")) return DEFAULT_NEXT;
  if (value.startsWith("//")) return DEFAULT_NEXT;
  if (value.startsWith("/login")) return DEFAULT_NEXT;
  return value;
}

/**
 * Mensajes legibles para la UI (preparado para i18n: centralizar strings aquí).
 * No modifica Firebase ni auth.ts; solo la capa de presentación.
 */
const AUTH_ERROR_MESSAGES_ES: Record<string, string> = {
  "invalid-email": "Introduce un email válido.",
  "wrong-password": "La contraseña no es correcta.",
  "user-not-found": "No encontramos una cuenta con ese email.",
  "invalid-credential": "Email o contraseña incorrectos.",
  "user-disabled": "Esta cuenta está desactivada. Contacta con soporte.",
  "too-many-requests": "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
  "network-request-failed": "Comprueba tu conexión e inténtalo de nuevo.",
  "internal-error": "Algo salió mal del lado del servidor. Inténtalo más tarde.",
  "email-already-in-use": "Ya existe una cuenta con ese email.",
  "weak-password": "Usa una contraseña más segura (más caracteres).",
  "operation-not-allowed": "Esta forma de acceso no está habilitada.",
  "requires-recent-login": "Vuelve a iniciar sesión para continuar.",
};

function friendlyAuthError(error: unknown): string {
  let code = "";
  if (error instanceof FirebaseError && typeof error.code === "string" && error.code.startsWith("auth/")) {
    code = error.code.slice(5);
  }
  if (!code) {
    const raw = authErrorMessage(error);
    const m = raw.match(/auth\/([\w-]+)/);
    if (m) code = m[1];
  }
  if (code && AUTH_ERROR_MESSAGES_ES[code]) {
    return AUTH_ERROR_MESSAGES_ES[code];
  }
  const raw = authErrorMessage(error);
  if (raw.includes("Firebase no está")) {
    return "La aplicación no está configurada correctamente. Contacta con soporte.";
  }
  if (raw.includes("EMAIL_NOT_VERIFIED")) {
    return "Verifica tu correo antes de aceptar la invitación.";
  }
  if (
    raw.includes("CONTROLLED_ACCESS_INVITE_REQUIRED") ||
    raw.includes("OWNER_SELF_SERVICE_DISABLED") ||
    raw.includes("INVITE_REQUIRED")
  ) {
    return "Hostly está en acceso controlado. Necesitas una invitación válida.";
  }
  return "No pudimos completar la operación. Revisa los datos e inténtalo de nuevo.";
}

function IconMail(props: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className={props.className}>
      <path
        d="M4 7l8 5 8-5M4 7v10h16V7M4 7l8 5 8-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLock(props: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className={props.className}>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8 11V8a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconArrowRight(props: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className={props.className}>
      <path
        d="M5 12h12m0 0l-4-4m4 4l-4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUserPlus(props: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className={props.className}>
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path d="M19 8v6M22 11h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconEye(props: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className={props.className}>
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconEyeOff(props: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className={props.className}>
      <path
        d="M4 4l16 16M9.48 9.48A3 3 0 0 0 12 15a3 3 0 0 0 2.52-2.52M6.34 6.34C3.9 7.89 2 11 2 11s4 7 10 7c1.54 0 2.94-.35 4.19-.95M14.12 14.12C13.28 14.66 12.17 15 11 15c-3.5 0-6-3-6-3s1.14-1.6 3.1-2.81M1 1l22 22"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShield(props: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className={props.className}>
      <path
        d="M12 3l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V7l7-4z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const shellStyle: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  color: "var(--hostly-ink)",
  backgroundColor: "var(--hostly-surface-page-soft)",
  backgroundImage: `
    radial-gradient(ellipse 130% 85% at 0% -25%, rgba(198, 228, 248, 0.42) 0%, transparent 52%),
    linear-gradient(180deg, var(--hostly-surface-page-soft) 0%, var(--hostly-ice-50) 45%, #e9f3fb 100%)
  `,
  paddingLeft: "var(--hostly-mobile-pad-x)",
  paddingRight: "var(--hostly-mobile-pad-x)",
  paddingTop: "max(12px, env(safe-area-inset-top, 0px))",
  paddingBottom: "max(8px, env(safe-area-inset-bottom, 0px))",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  color: "var(--hostly-navy-mid)",
  marginBottom: 6,
};

const errorBoxStyle: CSSProperties = {
  borderRadius: 14,
  padding: "11px 14px",
  marginTop: 10,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.45,
  background: "linear-gradient(180deg, rgba(254, 242, 242, 0.95) 0%, rgba(252, 231, 231, 0.88) 100%)",
  color: "#b42318",
  border: "1px solid rgba(220, 100, 100, 0.22)",
  boxShadow: "0 1px 0 rgba(255,255,255,0.7) inset",
};

const loginCardStyle: CSSProperties = {
  marginTop: 14,
  padding: "16px 16px 14px",
  borderRadius: 22,
  background: "rgba(255, 255, 255, 0.82)",
  WebkitBackdropFilter: "blur(14px)",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(54, 86, 116, 0.11)",
  boxShadow: "0 4px 28px rgba(15, 23, 42, 0.055)",
  boxSizing: "border-box",
};

const inputIconWrap: CSSProperties = {
  position: "relative",
  display: "block",
};

const inputIconLeft: CSSProperties = {
  position: "absolute",
  left: 14,
  top: "50%",
  transform: "translateY(-50%)",
  color: "var(--hostly-ink-soft)",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const inputWithIcon: CSSProperties = {
  paddingLeft: 44,
  paddingRight: 14,
  minHeight: 46,
  fontSize: 15,
  borderRadius: 14,
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, ready, refreshProfile } = useAuth();
  const nextPath = useMemo(
    () => safeNextPath(searchParams.get("next")),
    [searchParams],
  );
  const inviteToken = searchParams.get("inviteToken")?.trim() || undefined;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "login" | "register" | "verify" | "resend" | null
  >(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(
    null,
  );

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    setPendingAction("login");
    try {
      if (!isFirebaseConfigured) {
        setError("La aplicación no está configurada correctamente.");
        return;
      }
      const loggedInUser = await login(email, password, inviteToken);
      if (inviteToken && !loggedInUser.emailVerified) {
        setVerificationMessage(
          "Verifica tu correo para completar el acceso mediante invitación.",
        );
        return;
      }
      refreshProfile();
      router.replace(nextPath);
    } catch (err: unknown) {
      console.error(err);
      console.log("[AUTH] auth error", authErrorMessage(err));
      setError(friendlyAuthError(err));
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
        setError("La aplicación no está configurada correctamente.");
        return;
      }
      await register(
        email,
        password,
        inviteToken,
      );
      setVerificationMessage(
        "Te hemos enviado un correo de verificación. Confírmalo para aceptar la invitación.",
      );
    } catch (err: unknown) {
      console.error("[REGISTER ERROR]", authErrorMessage(err), err);
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  const handleInviteContinue = async () => {
    if (!user || !inviteToken) return;
    setLoading(true);
    setPendingAction("verify");
    setError(null);
    try {
      const refreshedUser = await refreshEmailVerification(user);
      if (!refreshedUser.emailVerified) {
        setVerificationMessage(
          "El correo aún no figura como verificado. Ábrelo y vuelve a intentarlo.",
        );
        return;
      }
      await applyPendingInviteForUser(refreshedUser, inviteToken);
      refreshProfile();
      router.replace(nextPath);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  const handleResendVerification = async () => {
    if (!user) return;
    setLoading(true);
    setPendingAction("resend");
    setError(null);
    try {
      await resendEmailVerification(user);
      setVerificationMessage("Correo de verificación reenviado.");
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  useEffect(() => {
    if (!ready || !user) return;
    if (!inviteToken) {
      router.replace(nextPath);
      return;
    }
    if (!user.emailVerified) {
      setVerificationMessage(
        "Verifica tu correo para completar el acceso mediante invitación.",
      );
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await applyPendingInviteForUser(user, inviteToken);
        if (cancelled) return;
        refreshProfile();
        router.replace(nextPath);
      } catch (err) {
        if (cancelled) return;
        setError(friendlyAuthError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken, nextPath, ready, refreshProfile, router, user]);

  if (!isFirebaseConfigured) {
    return (
      <div style={{ ...shellStyle, justifyContent: "center", alignItems: "center" }}>
        <div className="hostly-panel-soft" style={{ maxWidth: 360, textAlign: "center", padding: "18px 20px" }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 650, color: "var(--hostly-ink)" }}>
            Falta configuración de la aplicación
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ ...shellStyle, justifyContent: "center", alignItems: "center" }}>
        <div className="hostly-panel-soft" style={{ maxWidth: 320, textAlign: "center", padding: "18px 20px" }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 650, color: "var(--hostly-ink-muted)" }}>
            Preparando sesión…
          </p>
        </div>
      </div>
    );
  }

  if (user) {
    const completingInvite = Boolean(inviteToken);
    return (
      <div style={shellStyle}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "100%",
            maxWidth: 420,
            margin: "0 auto",
          }}
        >
          <header className="hostly-mobile-header" style={{ paddingLeft: 0, paddingRight: 0, textAlign: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <HostlyBrandLockup size={54} tone="app" />
            </div>
            <h1 className="hostly-mobile-title" style={{ textAlign: "center", marginTop: 16 }}>
              {completingInvite ? "Completa tu invitación" : "Sesión activa"}
            </h1>
            <p className="hostly-mobile-subtitle" style={{ textAlign: "center" }}>
              {completingInvite && !user.emailVerified
                ? "Verifica tu correo antes de acceder al restaurante."
                : user.email ?? user.uid}
            </p>
          </header>
          <div style={{ ...loginCardStyle, marginTop: 16 }}>
            <button
              type="button"
              disabled={loading}
              className="hostly-button-primary"
              style={{
                width: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                background: "linear-gradient(180deg, #1e5278 0%, var(--hostly-navy-deep) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 12px rgba(15,39,68,0.12)",
              }}
              onClick={() =>
                completingInvite
                  ? void handleInviteContinue()
                  : router.replace(nextPath)
              }
            >
              <span style={{ flex: 1, textAlign: "center" }}>
                {loading && pendingAction === "verify"
                  ? "Comprobando…"
                  : completingInvite
                    ? "Ya he verificado mi correo"
                    : "Entrar en Hostly"}
              </span>
              <span style={{ opacity: 0.95, display: "flex" }}>
                <IconArrowRight />
              </span>
            </button>
            {completingInvite && !user.emailVerified ? (
              <button
                type="button"
                disabled={loading}
                className="hostly-button-ghost"
                style={{
                  width: "100%",
                  marginTop: 10,
                  border: "1px solid rgba(49, 95, 125, 0.22)",
                  background: "rgba(255,255,255,0.65)",
                }}
                onClick={() => void handleResendVerification()}
              >
                {loading && pendingAction === "resend"
                  ? "Reenviando…"
                  : "Reenviar correo de verificación"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={loading}
              className="hostly-button-ghost"
              style={{
                width: "100%",
                marginTop: 10,
                border: "1px solid rgba(49, 95, 125, 0.22)",
                background: "rgba(255,255,255,0.65)",
              }}
              onClick={() => {
                setLoading(true);
                setError(null);
                void (async () => {
                  try {
                    await logout();
                  } catch (err: unknown) {
                    console.error(err);
                    setError(friendlyAuthError(err));
                  } finally {
                    setLoading(false);
                  }
                })();
              }}
            >
              Cerrar sesión
            </button>
            {verificationMessage ? (
              <p role="status" className="hostly-muted mb-0 mt-3 text-sm">
                {verificationMessage}
              </p>
            ) : null}
            {error ? (
              <p role="alert" style={{ ...errorBoxStyle, marginBottom: 0 }}>
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          maxWidth: 420,
          margin: "0 auto",
          minHeight: 0,
        }}
      >
        {/* HERO marca */}
        <header
          className="hostly-mobile-header"
          style={{
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 4,
            paddingBottom: 0,
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <HostlyBrandLockup size={60} tone="app" />
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--hostly-accent)",
                letterSpacing: "-0.02em",
              }}
            >
              Software para restaurantes
            </p>
          </div>

          <h1
            className="hostly-mobile-title"
            style={{ textAlign: "center", marginTop: 18, marginBottom: 0 }}
          >
            Iniciar sesión
          </h1>
          <p className="hostly-mobile-subtitle" style={{ textAlign: "center", marginTop: 8 }}>
            Accede a tu restaurante para operar sala, cocina, reservas y configuración.
          </p>
        </header>

        {/* Card */}
        <div style={loginCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={labelStyle}>
              Email
              <span style={inputIconWrap}>
                <span style={inputIconLeft}>
                  <IconMail />
                </span>
                <input
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  className="hostly-input"
                  style={{ ...inputWithIcon, marginTop: 6 }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                />
              </span>
            </label>

            <label style={labelStyle}>
              Contraseña
              <span style={inputIconWrap}>
                <span style={inputIconLeft}>
                  <IconLock />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="hostly-input"
                  style={{
                    ...inputWithIcon,
                    marginTop: 6,
                    paddingRight: 48,
                  }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Introduce tu contraseña"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    padding: 6,
                    border: "none",
                    background: "transparent",
                    color: "var(--hostly-ink-muted)",
                    cursor: "pointer",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 36,
                    minWidth: 36,
                  }}
                >
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </span>
            </label>

            <p
              style={{
                margin: "4px 0 0",
                textAlign: "right",
                fontSize: 12,
                fontWeight: 650,
                color: "var(--hostly-accent)",
                letterSpacing: "-0.01em",
              }}
            >
              ¿Has olvidado tu contraseña?
            </p>
          </div>

          <div
            className="hostly-panel-soft"
            style={{
              marginTop: 12,
              padding: "9px 11px 11px",
              borderRadius: 14,
              background: "rgba(245, 251, 255, 0.92)",
              border: "1px solid rgba(54, 86, 116, 0.08)",
              boxShadow: "none",
            }}
          >
            <p className="m-0 text-xs font-bold uppercase tracking-[0.06em] text-[color:var(--hostly-ink-soft)]">
              Acceso controlado
            </p>
            <p className="hostly-muted mb-0 mt-2 text-sm leading-snug">
              {inviteToken
                ? "Esta invitación permite crear una cuenta y unirte al restaurante asignado."
                : "El alta pública de restaurantes está deshabilitada durante el piloto. Solicita una invitación a un administrador."}
            </p>
          </div>

          {error ? (
            <p role="alert" style={errorBoxStyle}>
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={loading}
            className="hostly-button-primary"
            style={{
              width: "100%",
              marginTop: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              minHeight: 48,
              background: "linear-gradient(180deg, #256894 0%, var(--hostly-navy-deep) 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.11), 0 3px 14px rgba(15,39,68,0.14)",
              borderRadius: 16,
            }}
            onClick={() => void handleLogin()}
          >
            <span style={{ flex: 1, textAlign: "center", fontWeight: 720 }}>
              {loading && pendingAction === "login" ? "Entrando…" : "Entrar"}
            </span>
            <span style={{ opacity: 0.95, display: "flex" }}>
              <IconArrowRight />
            </span>
          </button>

          {inviteToken ? (
            <button
              type="button"
              disabled={loading}
              className="hostly-button-ghost"
              style={{
                width: "100%",
                marginTop: 10,
                minHeight: 46,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                border: "1px solid rgba(49, 95, 125, 0.28)",
                background: "rgba(255,255,255,0.52)",
                color: "var(--hostly-accent)",
                borderRadius: 16,
                fontWeight: 680,
              }}
              onClick={() => void handleRegister()}
            >
              <IconUserPlus />
              {loading && pendingAction === "register"
                ? "Creando cuenta…"
                : "Crear cuenta con invitación"}
            </button>
          ) : null}
        </div>

        <footer
          style={{
            marginTop: "auto",
            paddingTop: 14,
            paddingBottom: 6,
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--hostly-ink-muted)",
            }}
          >
            <span style={{ color: "var(--hostly-accent)", display: "flex", flexShrink: 0 }}>
              <IconShield />
            </span>
            Tus datos están protegidos.
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 650 }}>
            <span style={{ color: "var(--hostly-accent)", cursor: "default" }}>Política de privacidad</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
