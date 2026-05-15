"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  createRestaurantInvite,
  getPendingInvitesByRestaurant,
  revokeInvite,
  type RestaurantInviteRole,
} from "@/lib/firestore/restaurant-invites";
import {
  DEFAULT_RESTAURANT_NAME,
  loadRestaurantNameById,
} from "@/lib/firestore/user-restaurant-profile";

const inputStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #334155",
  backgroundColor: "#0f172a",
  color: "#f8fafc",
  fontSize: 15,
  width: "100%",
  maxWidth: 400,
  boxSizing: "border-box",
  outline: "none",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: 8,
};

function isValidInviteEmail(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 5) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function InvitacionesPage() {
  const { t } = useI18n();
  const title = t("invites.title");
  const subtitle = t("invites.subtitle");
  const {
    user,
    restaurantId: profileRestaurantId,
    restaurantName: authRestaurantName,
    role,
    ready: authReady,
  } = useAuth();
  const restaurantId = profileRestaurantId ?? null;

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RestaurantInviteRole>("staff");
  const [snapshotName, setSnapshotName] = useState(DEFAULT_RESTAURANT_NAME);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<
    { id: string; email?: string; role?: string }[]
  >([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

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

  const isOwner = role === "owner";

  const loadInvites = useCallback(async () => {
    if (!isFirebaseConfigured || !restaurantId || !isOwner) {
      setPendingInvites([]);
      return;
    }
    setInvitesLoading(true);
    try {
      const list = await getPendingInvitesByRestaurant(restaurantId);
      setPendingInvites(list as { id: string; email?: string; role?: string }[]);
    } catch (e) {
      console.error(e);
      setPendingInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  }, [restaurantId, isOwner]);

  useEffect(() => {
    if (!authReady || !isOwner) return;
    void loadInvites();
  }, [authReady, isOwner, loadInvites]);

  const restaurantNameForInvite = useMemo(() => {
    const fromAuth = authRestaurantName?.trim();
    if (fromAuth) return fromAuth;
    return snapshotName.trim() || DEFAULT_RESTAURANT_NAME;
  }, [authRestaurantName, snapshotName]);

  const emailOk = isValidInviteEmail(inviteEmail);
  const roleOk = inviteRole === "staff" || inviteRole === "owner";
  const canSubmit =
    emailOk &&
    roleOk &&
    isOwner &&
    Boolean(user?.uid && restaurantId && !sending);

  const onInvite = useCallback(async () => {
    setMessage(null);
    setError(null);
    if (!user?.uid || !restaurantId) {
      setError(t("invites.errorNoRestaurant"));
      return;
    }
    if (!isOwner) {
      setError(t("permissions.ownerOnly"));
      return;
    }
    if (!isValidInviteEmail(inviteEmail)) {
      setError(t("invites.errorInvalidEmail"));
      return;
    }
    setSending(true);
    try {
      await createRestaurantInvite(
        inviteEmail.toLowerCase(),
        restaurantId,
        restaurantNameForInvite,
        inviteRole,
        user.uid,
        role,
      );
      setMessage(t("invites.invitationSent"));
      setInviteEmail("");
      await loadInvites();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("invites.errorGeneric"));
    } finally {
      setSending(false);
    }
  }, [
    user?.uid,
    restaurantId,
    isOwner,
    role,
    inviteEmail,
    inviteRole,
    restaurantNameForInvite,
    loadInvites,
    t,
  ]);

  const showWait = !authReady;

  return (
    <ModulePageShell title={title} subtitle={subtitle}>
      <div style={{ maxWidth: 520 }}>
        {!isFirebaseConfigured ? (
          <p style={{ color: "#f87171" }}>{t("invites.noFirebase")}</p>
        ) : showWait ? (
          <p style={{ color: "#94a3b8" }}>{t("common.loading")}</p>
        ) : !user ? (
          <p style={{ color: "#94a3b8" }}>{t("invites.needLogin")}</p>
        ) : !restaurantId ? (
          <p style={{ color: "#f87171" }}>{t("invites.errorNoRestaurant")}</p>
        ) : !isOwner ? (
          <div style={{ color: "#94a3b8" }}>
            <p style={{ marginTop: 0, fontWeight: 600, color: "#f87171" }}>
              {t("invites.ownerOnlyPage")}
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.45 }}>{t("invites.ownerOnlyPageHint")}</p>
          </div>
        ) : (
          <>
            <p style={{ color: "#cbd5e1", fontSize: 14, marginTop: 0 }}>
              {t("invites.help")}
            </p>
            <label style={labelStyle}>{t("invites.emailLabel")}</label>
            <input
              type="email"
              autoComplete="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="empleado@ejemplo.com"
              disabled={sending}
              style={{ ...inputStyle, marginBottom: 16 }}
            />
            <label style={labelStyle}>{t("invites.roleLabel")}</label>
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as RestaurantInviteRole)
              }
              disabled={sending}
              style={{ ...inputStyle, marginBottom: 20, maxWidth: 400 }}
            >
              <option value="staff">{t("invites.roleStaff")}</option>
              <option value="owner">{t("invites.roleOwner")}</option>
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
              }}
            >
              {sending ? t("common.saving") : t("invites.cta")}
            </button>
            {message ? (
              <p style={{ color: "#4ade80", marginTop: 16 }} role="status">
                {message}
              </p>
            ) : null}
            {error ? (
              <p style={{ color: "#f87171", marginTop: 16 }} role="alert">
                {error}
              </p>
            ) : null}
            <div style={{ marginTop: 28 }}>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#e2e8f0",
                  margin: "0 0 12px",
                }}
              >
                Invitaciones pendientes
              </h2>
              {invitesLoading ? (
                <p style={{ color: "#94a3b8", fontSize: 14 }}>{t("common.loading")}</p>
              ) : pendingInvites.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: 14 }}>No hay invitaciones pendientes.</p>
              ) : (
                <table
                  style={{
                    width: "100%",
                    maxWidth: 480,
                    borderCollapse: "collapse",
                    fontSize: 14,
                    color: "#e2e8f0",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", textAlign: "left" }}>
                      <th style={{ padding: "8px 12px 8px 0" }}>Email</th>
                      <th style={{ padding: "8px 12px" }}>Rol</th>
                      <th style={{ padding: "8px 0 8px 12px" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvites.map((invite) => (
                      <tr key={invite.id} style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ padding: "10px 12px 10px 0" }}>
                          {typeof invite.email === "string" ? invite.email : "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {invite.role === "owner" || invite.role === "staff"
                            ? invite.role
                            : "—"}
                        </td>
                        <td style={{ padding: "10px 0 10px 12px" }}>
                          <button
                            type="button"
                            disabled={revokingId === invite.id}
                            onClick={() => {
                              void (async () => {
                                setRevokingId(invite.id);
                                try {
                                  await revokeInvite(invite.id);
                                  await loadInvites();
                                } catch (err) {
                                  console.error(err);
                                } finally {
                                  setRevokingId(null);
                                }
                              })();
                            }}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: "1px solid #475569",
                              backgroundColor: "#1e293b",
                              color: "#f8fafc",
                              cursor: revokingId === invite.id ? "wait" : "pointer",
                              fontSize: 13,
                            }}
                          >
                            Revocar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </ModulePageShell>
  );
}
