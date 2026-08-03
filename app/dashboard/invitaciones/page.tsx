"use client";

import type { CSSProperties } from "react";
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
import { HostlyKpiCard, HostlySection, HostlySectionHeader, HostlySurface } from "@/components/ui/hostly";

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--hostly-line-strong)",
  backgroundColor: "#ffffff",
  color: "var(--hostly-ink)",
  fontSize: 15,
  width: "100%",
  maxWidth: 440,
  boxSizing: "border-box",
  outline: "none",
  boxShadow: "var(--hostly-shadow-hairline)",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--hostly-ink-muted)",
  marginBottom: 6,
  letterSpacing: "0.055em",
  textTransform: "uppercase",
};

/** Cabecera y filas alineadas (listado tipo inventario). */
const inviteRowGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(72px, 0.42fr) minmax(104px, auto)",
  gap: "10px 12px",
  alignItems: "center",
};

const colHeadStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 590,
  color: "var(--hostly-ink-faint)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  lineHeight: 1.22,
};

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
        <HostlySurface variant="flat" className="box-border p-4">
          <p className="m-0 text-sm font-semibold text-[color:#b91c1c]" role="alert">
            {t("invites.noFirebase")}
          </p>
        </HostlySurface>
      ) : showWait ? (
        <HostlySurface variant="flat" className="box-border p-4">
          <p className="hostly-muted mb-0 !text-[13px]">{t("common.loading")}</p>
        </HostlySurface>
      ) : !user ? (
        <HostlySurface variant="flat" className="box-border p-4">
          <p className="hostly-muted mb-0 !text-[13px]">{t("invites.needLogin")}</p>
        </HostlySurface>
      ) : !restaurantId ? (
        <HostlySurface variant="flat" className="box-border p-4">
          <p className="m-0 text-sm font-semibold text-[color:#b91c1c]" role="alert">
            {t("invites.errorNoRestaurant")}
          </p>
        </HostlySurface>
      ) : !canManageUsers ? (
        <HostlySurface variant="flat" className="box-border p-4">
          <p className="m-0 text-sm font-semibold text-[color:#b91c1c]">
            No tienes permisos para gestionar invitaciones
          </p>
        </HostlySurface>
      ) : (
        <HostlySection stack="sm" className="min-h-0 flex-1 overflow-hidden">
          <div
            style={{
              flexShrink: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))",
              gap: 12,
            }}
          >
            <HostlyKpiCard
              title={t("invites.kpiPendingTitle")}
              value={invitesLoading ? "—" : pendingInvites.length}
              helper={t("invites.kpiPendingSub")}
              accentColor="#a78bfa"
              valueTitle={invitesLoading ? undefined : String(pendingInvites.length)}
              className="px-3 py-2.5"
            />
          </div>

          <HostlySurface variant="ice" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden box-border">
            <div
              style={{
                flexShrink: 0,
                padding: "7px 10px 5px",
                borderBottom: "1px solid var(--hostly-table-divider-soft)",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <HostlySectionHeader
                title={t("invites.composeTitle")}
                description={t("invites.help")}
                descriptionClassName="m-0 !text-[11px] !leading-snug text-[color:var(--hostly-ink-muted)] !font-semibold max-w-[560px]"
                className="min-w-0 flex-1"
              />
            </div>

            <div style={{ flexShrink: 0, padding: "10px 10px 0" }}>
              <label style={labelStyle}>{t("invites.emailLabel")}</label>
              <input
                type="email"
                autoComplete="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t("invites.emailPlaceholder")}
                disabled={sending}
                style={{ ...inputStyle, marginBottom: 16 }}
              />
              <label style={labelStyle}>{t("invites.roleLabel")}</label>
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(
                    e.target.value as "admin" | "manager" | "waiter",
                  )
                }
                disabled={sending}
                style={{ ...inputStyle, marginBottom: 20, maxWidth: 440 }}
              >
                <option value="waiter">Operativo / Camarero</option>
                <option value="manager">Encargado</option>
                <option value="admin" disabled={actorRole !== "owner"}>
                  Administrador
                </option>
              </select>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void onInvite()}
                style={{
                  padding: "12px 20px",
                  borderRadius: 10,
                  border: "none",
                  backgroundColor: "#16a34a",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: sending ? "wait" : "pointer",
                  fontSize: 15,
                }}
              >
                {sending ? t("common.saving") : t("invites.cta")}
              </button>
              {message ? (
                <p className="m-0 mt-4 text-sm font-semibold text-[color:#15803d]" role="status">
                  {message}
                </p>
              ) : null}
              {createdInvite ? (
                <div
                  className="mt-3 box-border max-w-[560px] rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                  role="status"
                  aria-label="Enlace de invitación creado"
                >
                  <p className="m-0 text-sm font-semibold text-emerald-900">
                    Enlace para {createdInvite.email}
                  </p>
                  <p className="mb-0 mt-1 text-xs leading-snug text-emerald-800">
                    Este enlace solo se muestra ahora. No se puede recuperar después.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void onCopyInviteLink()}
                      className="hostly-button-secondary min-h-11 px-4"
                    >
                      {copyState === "copied" ? "Enlace copiado" : "Copiar enlace"}
                    </button>
                    <button
                      type="button"
                      onClick={dismissCreatedInvite}
                      className="hostly-button-ghost min-h-11 px-4"
                    >
                      Cerrar
                    </button>
                  </div>
                  {copyState === "error" ? (
                    <div className="mt-2">
                      <p className="mb-2 mt-0 text-xs font-semibold text-red-700" role="alert">
                        No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.
                      </p>
                      <input
                        ref={manualCopyInputRef}
                        readOnly
                        value={createdInvite.inviteUrl}
                        onFocus={(event) => event.currentTarget.select()}
                        aria-label="Enlace de invitación para copiar manualmente"
                        className="hostly-input w-full text-xs"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {error ? (
                <p className="m-0 mt-4 text-sm font-semibold text-[color:#b91c1c]" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "8px 10px 10px",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div
                style={{
                  marginTop: 6,
                  paddingTop: 12,
                  borderTop: "1px solid var(--hostly-table-divider-soft)",
                }}
              >
                <HostlySectionHeader title={t("invites.pendingListTitle")} titleVariant="section" className="shrink-0" />

                {invitesLoading ? (
                  <p className="hostly-muted mb-0 !text-[13px]">{t("common.loading")}</p>
                ) : pendingInvites.length === 0 ? (
                  <p className="hostly-muted mb-0 !text-[13px]">{t("invites.pendingEmpty")}</p>
                ) : (
                  <div
                    style={{
                      borderRadius: 8,
                      border: "1px solid var(--hostly-table-divider-soft)",
                      overflow: "hidden",
                      background: "var(--hostly-surface-card-solid)",
                      maxWidth: 560,
                    }}
                  >
                    <div
                      style={{
                        ...inviteRowGrid,
                        padding: "10px 12px",
                        background: "var(--hostly-table-head-surface)",
                        borderBottom: "1px solid var(--hostly-table-divider-soft)",
                      }}
                    >
                      <span style={colHeadStyle}>{t("invites.emailLabel")}</span>
                      <span style={{ ...colHeadStyle }}>{t("invites.roleLabel")}</span>
                      <span style={{ ...colHeadStyle, textAlign: "right" }}>{t("common.actions")}</span>
                    </div>
                    {pendingInvites.map((invite, idx) => {
                      const isLast = idx === pendingInvites.length - 1;
                      return (
                        <div
                          key={invite.id}
                          className="bg-[color:var(--hostly-surface-card-solid)] transition-[background-color] duration-150 ease-out hover:bg-[color:var(--hostly-table-row-hover)]"
                          style={{
                            ...inviteRowGrid,
                            padding: "11px 12px",
                            borderBottom: isLast ? "none" : "1px solid var(--hostly-table-divider-faint)",
                          }}
                        >
                          <div
                            style={{
                              minWidth: 0,
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--hostly-ink-strong)",
                              letterSpacing: "-0.015em",
                              lineHeight: 1.25,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={typeof invite.email === "string" ? invite.email : undefined}
                          >
                            {typeof invite.email === "string" ? invite.email : t("common.emDash")}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--hostly-ink-soft)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {inviteRoleLabel(invite.role) ?? t("common.emDash")}
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              disabled={revokingId === invite.id}
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
                              style={{
                                padding: "9px 14px",
                                borderRadius: 10,
                                border: "1px solid var(--hostly-table-divider-soft)",
                                background: "var(--hostly-surface-page-soft)",
                                color: "var(--hostly-ink-muted)",
                                cursor: revokingId === invite.id ? "wait" : "pointer",
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {t("invites.revoke")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {pendingInvites.length > 0 && !invitesLoading ? (
                  <p className="hostly-muted mb-0 mt-3 max-w-[560px] !text-xs !leading-snug">
                    Si ya no conservas el enlace de una invitación pendiente, revócala,
                    crea una nueva y copia el nuevo enlace antes de cerrar el resultado.
                  </p>
                ) : null}
              </div>
            </div>
          </HostlySurface>
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
      lockViewport
      shellSurface="configLight"
    >
      <HostlySection stack="sm" className="min-h-0 flex-1 overflow-hidden">
        {shellBase}
      </HostlySection>
    </ModulePageShell>
  );
}
