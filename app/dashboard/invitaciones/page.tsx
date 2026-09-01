"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { requestCreateStaffInvite } from "@/lib/staff-invites/request-create-staff-invite";
import {
  requestPendingStaffInvites,
  requestRevokeStaffInvite,
  StaffInviteRequestError,
} from "@/lib/staff-invites/request-manage-staff-invites";
import { copyInviteLink } from "@/lib/staff-invites/copy-invite-link";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import {
  DEFAULT_RESTAURANT_NAME,
  loadRestaurantNameById,
} from "@/lib/firestore/user-restaurant-profile";
import {
  HostlyAlert,
  HostlyButton,
  HostlyField,
  HostlyInput,
  HostlyOperationalEmptyState,
  HostlySection,
  HostlySectionHeader,
  HostlySelect,
  HostlySurface,
} from "@/components/ui/hostly";

function isValidInviteEmail(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 5) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function inviteRoleLabel(role: unknown): string | null {
  if (role === "admin") return "Administrador";
  if (role === "manager") return "Encargado";
  if (role === "waiter" || role === "staff") return "Operativo";
  return null;
}

function safeInviteErrorMessage(error: unknown, httpStatus?: number): string {
  const code =
    error instanceof StaffInviteRequestError
      ? error.code
      : error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "";
  const status =
    error instanceof StaffInviteRequestError ? error.httpStatus : httpStatus;

  if (
    status === 401 ||
    status === 403 ||
    code === "UNAUTHORIZED" ||
    code === "USERS_MANAGE_REQUIRED"
  ) {
    return "No tienes permisos para gestionar invitaciones";
  }
  if (code === "INVITE_ALREADY_PENDING") {
    return "Ya existe una invitación pendiente para este correo. Revócala antes de crear otra.";
  }
  if (code === "INVITE_EMAIL_REQUIRED" || code === "INVALID_INVITE_EMAIL") {
    return "Revisa el correo de la invitación.";
  }
  if (code === "INVITE_OWNER_FORBIDDEN") {
    return "No se pueden crear propietarios desde este flujo.";
  }
  if (code === "INVITE_NOT_FOUND") {
    return "La invitación ya no está disponible.";
  }
  return "No se pudo completar la gestión de la invitación. Inténtalo de nuevo.";
}

export default function InvitacionesPage() {
  const { t } = useI18n();
  const title = t("invites.title");
  const subtitle = t("invites.subtitle");
  const {
    user,
    restaurantId: profileRestaurantId,
    restaurantName: authRestaurantName,
    ready: authReady,
  } = useAuth();
  const { can, role: actorRole } = useHostlyCapabilities();
  const restaurantId = profileRestaurantId ?? null;

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<
    "admin" | "manager" | "waiter"
  >("waiter");
  const [snapshotName, setSnapshotName] = useState(DEFAULT_RESTAURANT_NAME);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<{
    inviteId: string;
    email: string;
    inviteUrl: string;
  } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [pendingInvites, setPendingInvites] = useState<
    { id: string; email?: string; role?: string }[]
  >([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const manualCopyInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const fromAuth = authRestaurantName?.trim();
    if (fromAuth) {
      setSnapshotName(fromAuth);
      return;
    }
    if (!restaurantId || !isFirebaseConfigured) {
      setSnapshotName(DEFAULT_RESTAURANT_NAME);
      return;
    }
    let cancelled = false;
    void loadRestaurantNameById(restaurantId).then((n) => {
      if (!cancelled) setSnapshotName(n?.trim() || DEFAULT_RESTAURANT_NAME);
    });
    return () => {
      cancelled = true;
    };
  }, [authRestaurantName, restaurantId]);

  const canManageUsers = can("users.manage");

  const loadInvites = useCallback(async () => {
    if (!isFirebaseConfigured || !restaurantId || !canManageUsers) {
      setPendingInvites([]);
      return;
    }
    setInvitesLoading(true);
    try {
      const list = await requestPendingStaffInvites();
      setPendingInvites(list as { id: string; email?: string; role?: string }[]);
    } catch (e) {
      console.error(e);
      setPendingInvites([]);
      setError(safeInviteErrorMessage(e));
    } finally {
      setInvitesLoading(false);
    }
  }, [restaurantId, canManageUsers]);

  useEffect(() => {
    if (!authReady || !canManageUsers) return;
    void loadInvites();
  }, [authReady, canManageUsers, loadInvites]);

  const restaurantNameForInvite = useMemo(() => {
    const fromAuth = authRestaurantName?.trim();
    if (fromAuth) return fromAuth;
    return snapshotName.trim() || DEFAULT_RESTAURANT_NAME;
  }, [authRestaurantName, snapshotName]);

  const emailOk = isValidInviteEmail(inviteEmail);
  const roleOk =
    inviteRole === "waiter" ||
    inviteRole === "manager" ||
    inviteRole === "admin";
  const canSubmit =
    emailOk &&
    roleOk &&
    canManageUsers &&
    Boolean(user?.uid && restaurantId && !sending);

  const onInvite = useCallback(async () => {
    setMessage(null);
    setError(null);
    setCreatedInvite(null);
    setCopyState("idle");
    if (!user?.uid || !restaurantId) {
      setError(t("invites.errorNoRestaurant"));
      return;
    }
    if (!canManageUsers) {
      setError("No tienes permisos para gestionar invitaciones");
      return;
    }
    if (!isValidInviteEmail(inviteEmail)) {
      setError(t("invites.errorInvalidEmail"));
      return;
    }
    setSending(true);
    try {
      const result = await requestCreateStaffInvite({
        email: inviteEmail.toLowerCase(),
        role: inviteRole,
        restaurantName: restaurantNameForInvite,
      });
      if (!result.ok) {
        setError(safeInviteErrorMessage(result.error, result.httpStatus));
        return;
      }
      setCreatedInvite({
        inviteId: result.invite.inviteId,
        email: result.invite.email,
        inviteUrl: result.invite.inviteUrl,
      });
      setMessage("Invitación creada. Copia y comparte el enlace.");
      setInviteEmail("");
      await loadInvites();
    } catch (e) {
      setError(safeInviteErrorMessage(e));
    } finally {
      setSending(false);
    }
  }, [
    user?.uid,
    restaurantId,
    canManageUsers,
    inviteEmail,
    inviteRole,
    restaurantNameForInvite,
    loadInvites,
    t,
  ]);

  const onCopyInviteLink = useCallback(async () => {
    if (!createdInvite) return;
    try {
      await copyInviteLink(createdInvite.inviteUrl);
      setCopyState("copied");
    } catch {
      setCopyState("error");
      window.setTimeout(() => {
        manualCopyInputRef.current?.focus();
        manualCopyInputRef.current?.select();
      }, 0);
    }
  }, [createdInvite]);

  const dismissCreatedInvite = useCallback(() => {
    setCreatedInvite(null);
    setCopyState("idle");
    setMessage(null);
  }, []);

  const showWait = !authReady;

  const shellBase = (
    <>
      {!isFirebaseConfigured ? (
        <HostlyAlert tone="danger" title="Hostly no está conectado">
          {t("invites.noFirebase")}
        </HostlyAlert>
      ) : showWait ? (
        <HostlySurface variant="flat" className="hostly-invites-gate-state">
          {t("common.loading")}
        </HostlySurface>
      ) : !user ? (
        <HostlySurface variant="flat" className="hostly-invites-gate-state">
          {t("invites.needLogin")}
        </HostlySurface>
      ) : !restaurantId ? (
        <HostlyAlert tone="danger" title="No se ha encontrado el restaurante">
          {t("invites.errorNoRestaurant")}
        </HostlyAlert>
      ) : !canManageUsers ? (
        <HostlyAlert tone="warning" title="Acceso restringido">
          No tienes permisos para gestionar invitaciones.
        </HostlyAlert>
      ) : (
        <HostlySection stack="md" className="hostly-invites-page">
          <div className="hostly-invites-context-strip">
            <span className="hostly-invites-context-icon" aria-hidden>
              +
            </span>
            <div>
              <strong>Añade personas a tu restaurante</strong>
              <span>
                Elige el acceso ahora; podrás cambiarlo después desde Empleados.
              </span>
            </div>
          </div>

          <div className="hostly-invites-workspace">
            <HostlySurface variant="ice" className="hostly-invites-compose-card">
              <HostlySectionHeader
                title={t("invites.composeTitle")}
                description={t("invites.help")}
              />

              <form
                className="hostly-invites-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!canSubmit) return;
                  void onInvite();
                }}
              >
                <HostlyField label={t("invites.emailLabel")}>
                  <HostlyInput
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder={t("invites.emailPlaceholder")}
                    disabled={sending}
                  />
                </HostlyField>

                <HostlyField
                  label={t("invites.roleLabel")}
                  hint="Define qué podrá hacer esta persona dentro de Hostly."
                >
                  <HostlySelect
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(
                        event.target.value as "admin" | "manager" | "waiter",
                      )
                    }
                    disabled={sending}
                  >
                    <option value="waiter">Operativo / Camarero</option>
                    <option value="manager">Encargado</option>
                    <option value="admin" disabled={actorRole !== "owner"}>
                      Administrador
                    </option>
                  </HostlySelect>
                </HostlyField>

                <HostlyButton
                  type="submit"
                  variant="primary"
                  disabled={!canSubmit}
                  className="hostly-invites-submit"
                >
                  {sending ? t("common.saving") : t("invites.cta")}
                </HostlyButton>
              </form>

              {message && !createdInvite ? (
                <HostlyAlert tone="success">{message}</HostlyAlert>
              ) : null}

              {createdInvite ? (
                <HostlyAlert
                  tone="success"
                  title={`Invitación lista para ${createdInvite.email}`}
                  className="hostly-invites-created"
                  aria-label="Enlace de invitación creado"
                >
                  <p>
                    Copia el enlace ahora. Por seguridad, Hostly no podrá volver a
                    mostrarlo después.
                  </p>
                  <div className="hostly-invites-created-actions">
                    <HostlyButton
                      variant="primary"
                      onClick={() => void onCopyInviteLink()}
                    >
                      {copyState === "copied" ? "Enlace copiado" : "Copiar enlace"}
                    </HostlyButton>
                    <HostlyButton variant="ghost" onClick={dismissCreatedInvite}>
                      Cerrar
                    </HostlyButton>
                  </div>
                  {copyState === "error" ? (
                    <div className="hostly-invites-manual-copy">
                      <p role="alert">
                        No se pudo copiar automáticamente. Selecciona el enlace y
                        cópialo manualmente.
                      </p>
                      <input
                        ref={manualCopyInputRef}
                        readOnly
                        value={createdInvite.inviteUrl}
                        onFocus={(event) => event.currentTarget.select()}
                        aria-label="Enlace de invitación para copiar manualmente"
                        className="hostly-input"
                      />
                    </div>
                  ) : null}
                </HostlyAlert>
              ) : null}

              {error ? (
                <HostlyAlert tone="danger" title="No se pudo completar la invitación">
                  {error}
                </HostlyAlert>
              ) : null}
            </HostlySurface>

            <HostlySurface variant="flat" className="hostly-invites-pending-card">
              <div className="hostly-invites-pending-header">
                <HostlySectionHeader
                  title={t("invites.pendingListTitle")}
                  description="Enlaces enviados que todavía pueden utilizarse."
                  titleVariant="section"
                />
                <span
                  className="hostly-invites-pending-count"
                  aria-label={`${pendingInvites.length} invitaciones pendientes`}
                >
                  {invitesLoading ? "—" : pendingInvites.length}
                </span>
              </div>

              <div className="hostly-invites-pending-body">
                {invitesLoading ? (
                  <p className="hostly-invites-loading">{t("common.loading")}</p>
                ) : pendingInvites.length === 0 ? (
                  <HostlyOperationalEmptyState
                    title="No hay invitaciones pendientes"
                    text="Cuando invites a alguien, su acceso aparecerá aquí hasta que lo acepte."
                    className="hostly-invites-empty"
                  />
                ) : (
                  <div className="hostly-invites-list">
                    <div className="hostly-invites-list-head" aria-hidden>
                      <span>{t("invites.emailLabel")}</span>
                      <span>{t("invites.roleLabel")}</span>
                      <span>{t("common.actions")}</span>
                    </div>
                    {pendingInvites.map((invite) => (
                      <article className="hostly-invites-row" key={invite.id}>
                        <div className="hostly-invites-row-person">
                          <span className="hostly-invites-row-avatar" aria-hidden>
                            {(invite.email?.trim().slice(0, 1) || "E").toUpperCase()}
                          </span>
                          <strong title={invite.email}>
                            {invite.email || t("common.emDash")}
                          </strong>
                        </div>
                        <span className="hostly-invites-role-badge">
                          {inviteRoleLabel(invite.role) ?? t("common.emDash")}
                        </span>
                        <HostlyButton
                          variant="secondary"
                          disabled={revokingId === invite.id}
                          className="hostly-invites-revoke"
                          onClick={() => {
                            void (async () => {
                              setRevokingId(invite.id);
                              setError(null);
                              try {
                                await requestRevokeStaffInvite(invite.id);
                                if (createdInvite?.inviteId === invite.id) {
                                  dismissCreatedInvite();
                                }
                                await loadInvites();
                              } catch (err) {
                                console.error(err);
                                setError(safeInviteErrorMessage(err));
                              } finally {
                                setRevokingId(null);
                              }
                            })();
                          }}
                        >
                          {revokingId === invite.id
                            ? t("common.loading")
                            : t("invites.revoke")}
                        </HostlyButton>
                      </article>
                    ))}
                  </div>
                )}

                {pendingInvites.length > 0 && !invitesLoading ? (
                  <p className="hostly-invites-pending-note">
                    Si has perdido un enlace, revócalo y crea una nueva invitación.
                  </p>
                ) : null}
              </div>
            </HostlySurface>
          </div>
        </HostlySection>
      )}
    </>
  );

  return (
    <ModulePageShell
      title={title}
      subtitle={subtitle}
      maxWidth={1180}
      compactLayout
      operationalFocus
      denseWorkbench
      shellSurface="configLight"
      backHref="/dashboard/configuracion/empleados"
      backLabel="Volver al equipo"
    >
      <HostlySection stack="sm" className="min-h-0 flex-1">
        {shellBase}
      </HostlySection>
    </ModulePageShell>
  );
}
