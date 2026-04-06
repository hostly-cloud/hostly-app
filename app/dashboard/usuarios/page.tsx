"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import {
  type UsuarioLocal,
  type UsuarioModulo,
  type UsuarioModulos,
  type UsuarioRol,
  USUARIO_MODULOS,
  USUARIO_ROLES,
  defaultModulosForRol,
  loadUsuarios,
  newUsuarioId,
  saveUsuarios,
} from "@/lib/usuarios-local";

const tpvSearchInput: CSSProperties = {
  padding: "7px 11px",
  borderRadius: 8,
  border: "1px solid #334155",
  backgroundColor: "#0f172a",
  color: "#f8fafc",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

const modalInput: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  backgroundColor: "rgba(15, 23, 42, 0.85)",
  color: "#f8fafc",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

const modalLabel: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: 6,
};

function isValidEmailOrId(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return false;
  if (t.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  return /^[a-zA-Z0-9._@\-+]+$/.test(t);
}

function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function roleBadgeStyle(rol: UsuarioRol): { bg: string; border: string; color: string } {
  switch (rol) {
    case "admin":
      return { bg: "rgba(167, 139, 250, 0.22)", border: "rgba(196, 181, 253, 0.55)", color: "#e9d5ff" };
    case "encargado":
      return { bg: "rgba(59, 130, 246, 0.22)", border: "rgba(96, 165, 250, 0.5)", color: "#bfdbfe" };
    default:
      return { bg: "rgba(52, 211, 153, 0.18)", border: "rgba(52, 211, 153, 0.45)", color: "#a7f3d0" };
  }
}

function countActiveModules(m: UsuarioModulos): number {
  let n = 0;
  for (const k of USUARIO_MODULOS) {
    if (m[k]) n += 1;
  }
  return n;
}

type AccessTier = "full" | "partial" | "limited" | "none";

function accessTierFromCount(n: number): AccessTier {
  if (n >= 4) return "full";
  if (n >= 2) return "partial";
  if (n === 1) return "limited";
  return "none";
}

function accessTierLabelKey(tier: AccessTier): string {
  switch (tier) {
    case "full":
      return "users.accessFull";
    case "partial":
      return "users.accessPartial";
    case "limited":
      return "users.accessLimited";
    default:
      return "users.accessNone";
  }
}

function accessTierAccent(tier: AccessTier): string {
  switch (tier) {
    case "full":
      return "#4ade80";
    case "partial":
      return "#fbbf24";
    case "limited":
      return "#fb923c";
    default:
      return "#f87171";
  }
}

function modulesCountLine(count: number, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (count === 1) return t("users.modulesOne");
  return t("users.modulesMany", { count });
}

/** Misma rejilla en cabecera y filas (tabla operativa TPV). */
const userRowGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1.05fr) minmax(0, 1fr) minmax(80px, auto) auto",
  gap: 10,
  alignItems: "center",
};

const colHeadStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: "#64748b",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  lineHeight: 1.2,
};

type ListFilter = "todos" | UsuarioRol | "inactivo";

function modLabelKey(m: UsuarioModulo): string {
  switch (m) {
    case "stock":
      return "users.modStock";
    case "compras":
      return "users.modCompras";
    case "mermas":
      return "users.modMermas";
    default:
      return "users.modEscandallos";
  }
}

function roleLabelKey(rol: UsuarioRol): string {
  switch (rol) {
    case "admin":
      return "users.roleAdmin";
    case "encargado":
      return "users.roleEncargado";
    default:
      return "users.roleOperativo";
  }
}

export default function UsuariosPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<UsuarioLocal[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNombre, setDraftNombre] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftRol, setDraftRol] = useState<UsuarioRol>("operativo");
  const [draftActivo, setDraftActivo] = useState(true);
  const [draftModulos, setDraftModulos] = useState<UsuarioModulos>(defaultModulosForRol("operativo"));
  const [formError, setFormError] = useState<string | null>(null);
  const [ctaHover, setCtaHover] = useState(false);
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setItems(loadUsuarios());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  const roleFiltered = useMemo(() => {
    if (listFilter === "todos") return items;
    if (listFilter === "inactivo") return items.filter((u) => !u.activo);
    return items.filter((u) => u.rol === listFilter);
  }, [items, listFilter]);

  const displayedUsers = useMemo(() => {
    const q = normalizeForSearch(listSearch);
    if (!q) return roleFiltered;
    return roleFiltered.filter((u) => {
      const n = normalizeForSearch(u.nombre);
      const e = normalizeForSearch(u.email);
      const r = normalizeForSearch(t(roleLabelKey(u.rol)));
      return n.includes(q) || e.includes(q) || r.includes(q);
    });
  }, [roleFiltered, listSearch, t]);

  const sortedDisplay = useMemo(() => {
    return [...displayedUsers].sort((a, b) => {
      if (a.activo !== b.activo) return a.activo ? -1 : 1;
      return a.nombre.localeCompare(b.nombre, locale === "en" ? "en" : "es", { sensitivity: "base" });
    });
  }, [displayedUsers, locale]);

  const stats = useMemo(() => {
    const activos = items.filter((u) => u.activo);
    return {
      activos: activos.length,
      admins: activos.filter((u) => u.rol === "admin").length,
      operativos: activos.filter((u) => u.rol === "operativo").length,
      inactivos: items.filter((u) => !u.activo).length,
    };
  }, [items]);

  const kpiCards = useMemo(
    () => [
      {
        title: t("users.kpiActiveTitle"),
        value: stats.activos,
        sub: t("users.kpiActiveSub"),
        accent: "#4ade80",
      },
      {
        title: t("users.kpiAdminsTitle"),
        value: stats.admins,
        sub: t("users.kpiAdminsSub"),
        accent: "#a78bfa",
      },
      {
        title: t("users.kpiOperationalTitle"),
        value: stats.operativos,
        sub: t("users.kpiOperationalSub"),
        accent: "#34d399",
      },
      {
        title: t("users.kpiInactiveTitle"),
        value: stats.inactivos,
        sub: t("users.kpiInactiveSub"),
        accent: "#94a3b8",
      },
    ],
    [t, stats],
  );

  const metricFigure: CSSProperties = {
    fontVariantNumeric: "tabular-nums",
    fontFeatureSettings: '"tnum" 1',
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "-0.03em",
    color: "#f8fafc",
    lineHeight: 1,
  };

  function openCreate() {
    setEditingId(null);
    setDraftNombre("");
    setDraftEmail("");
    setDraftRol("operativo");
    setDraftActivo(true);
    setDraftModulos(defaultModulosForRol("operativo"));
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(u: UsuarioLocal) {
    setEditingId(u.id);
    setDraftNombre(u.nombre);
    setDraftEmail(u.email);
    setDraftRol(u.rol);
    setDraftActivo(u.activo);
    setDraftModulos({ ...u.modulos });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function submitForm() {
    setFormError(null);
    const nombre = draftNombre.trim();
    const email = draftEmail.trim();
    if (!nombre) {
      setFormError(t("users.errorName"));
      return;
    }
    if (!isValidEmailOrId(email)) {
      setFormError(t("users.errorEmail"));
      return;
    }
    const next: UsuarioLocal = {
      id: editingId ?? newUsuarioId(),
      nombre,
      email,
      rol: draftRol,
      activo: draftActivo,
      modulos: { ...draftModulos },
    };
    let nextList: UsuarioLocal[];
    if (editingId) {
      nextList = items.map((x) => (x.id === editingId ? next : x));
    } else {
      nextList = [...items, next];
    }
    saveUsuarios(nextList);
    setItems(nextList);
    closeForm();
  }

  function toggleActivo(u: UsuarioLocal) {
    const msg = u.activo ? t("users.confirmDeactivate") : t("users.confirmActivate");
    if (!window.confirm(msg)) return;
    const nextList = items.map((x) => (x.id === u.id ? { ...x, activo: !x.activo } : x));
    saveUsuarios(nextList);
    setItems(nextList);
  }

  function setModulo(m: UsuarioModulo, on: boolean) {
    setDraftModulos((prev) => ({ ...prev, [m]: on }));
  }

  if (!hydrated) {
    return (
      <ModulePageShell title={t("users.title")} subtitle={t("users.subtitle")} maxWidth={1180} compactLayout lockViewport>
        <p style={{ color: "#94a3b8", fontSize: 13 }}>{t("common.preparing")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title={t("users.title")}
      subtitle={t("users.subtitle")}
      maxWidth={1180}
      compactLayout
      lockViewport
      headerRight={
        <button
          type="button"
          onClick={openCreate}
          onMouseEnter={() => setCtaHover(true)}
          onMouseLeave={() => setCtaHover(false)}
          style={{
            border: "none",
            background: ctaHover ? "#16a34a" : "#22c55e",
            color: "#fff",
            padding: "7px 14px",
            borderRadius: 10,
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            boxShadow: ctaHover ? "0 4px 14px rgba(34, 197, 94, 0.35)" : "0 2px 10px rgba(34, 197, 94, 0.2)",
            transition: "background 0.15s ease, box-shadow 0.15s ease",
          }}
        >
          {t("users.newUserCta")}
        </button>
      }
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))",
            gap: 6,
          }}
        >
          {kpiCards.map((card) => (
            <div
              key={card.title}
              style={{
                background: "#1e293b",
                borderRadius: 10,
                padding: "8px 10px",
                border: "1px solid #334155",
                boxShadow: "0 2px 12px rgba(0,0,0,0.14)",
                borderTop: `2px solid ${card.accent}`,
                minWidth: 0,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  lineHeight: 1.2,
                }}
              >
                {card.title}
              </p>
              <p style={{ margin: "4px 0 0", ...metricFigure }}>{card.value}</p>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 10,
                  color: "#94a3b8",
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {card.sub}
              </p>
            </div>
          ))}
        </div>

        <section
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: 12,
            background: "#1e293b",
            border: "1px solid #334155",
            boxShadow: "0 2px 12px rgba(0,0,0,0.14)",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              padding: "8px 10px 6px",
              borderBottom: "1px solid #334155",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 200px" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "#f8fafc",
                  lineHeight: 1.2,
                }}
              >
                {t("users.listTitle")}
              </h2>
              {items.length > 0 ? (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.3 }}>
                  {t("users.listCount", { shown: sortedDisplay.length, total: roleFiltered.length })}
                </p>
              ) : null}
            </div>
          </div>

          {items.length === 0 ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px 14px",
                textAlign: "center",
              }}
            >
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{t("users.emptyTitle")}</p>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.45, maxWidth: 360 }}>
                {t("users.emptyBody")}
              </p>
              <button
                type="button"
                onClick={openCreate}
                style={{
                  marginTop: 12,
                  border: "none",
                  background: "#22c55e",
                  color: "#fff",
                  padding: "7px 16px",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {t("users.emptyCta")}
              </button>
            </div>
          ) : (
            <>
              <div style={{ flexShrink: 0, padding: "6px 10px 0" }}>
                <input
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder={t("users.searchPlaceholder")}
                  autoComplete="off"
                  aria-label={t("users.searchPlaceholder")}
                  style={tpvSearchInput}
                />
              </div>

              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  alignItems: "center",
                  rowGap: 6,
                  padding: "8px 10px 8px",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#64748b",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {t("stock.filterHint")}
                </span>
                {(
                  [
                    { id: "todos" as const, label: t("stock.filterAll") },
                    { id: "admin" as const, label: t("users.filterAdmin") },
                    { id: "encargado" as const, label: t("users.filterEncargado") },
                    { id: "operativo" as const, label: t("users.filterOperativo") },
                    { id: "inactivo" as const, label: t("users.filterInactive") },
                  ] as const
                ).map((f) => {
                  const active = listFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setListFilter(f.id)}
                      style={{
                        border: active ? "1px solid rgba(96, 165, 250, 0.55)" : "1px solid #334155",
                        background: active ? "rgba(59, 130, 246, 0.18)" : "#0f172a",
                        color: active ? "#e2e8f0" : "#94a3b8",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: 11,
                        lineHeight: 1.25,
                        maxWidth: "100%",
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "6px 10px 10px",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {sortedDisplay.length === 0 ? (
                  <div style={{ padding: "14px 10px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                    {t("users.searchNoResults")}
                  </div>
                ) : (
                  <div
                    style={{
                      borderRadius: 8,
                      border: "1px solid #334155",
                      overflow: "hidden",
                      background: "#0f172a",
                    }}
                  >
                    <div
                      style={{
                        ...userRowGrid,
                        padding: "7px 10px",
                        background: "#1e293b",
                        borderBottom: "1px solid #334155",
                      }}
                    >
                      <span style={colHeadStyle}>{t("users.colEmployee")}</span>
                      <span style={{ ...colHeadStyle, textAlign: "left" }}>{t("users.colRole")}</span>
                      <span style={colHeadStyle}>{t("users.colAccess")}</span>
                      <span style={{ ...colHeadStyle, textAlign: "center" }}>{t("users.colStatus")}</span>
                      <span style={{ ...colHeadStyle, textAlign: "right" }}>{t("users.colActions")}</span>
                    </div>
                    {sortedDisplay.map((u, idx) => {
                      const isHover = hoverRowId === u.id;
                      const rb = roleBadgeStyle(u.rol);
                      const modCount = countActiveModules(u.modulos);
                      const tier = accessTierFromCount(modCount);
                      const accColor = accessTierAccent(tier);
                      const isLast = idx === sortedDisplay.length - 1;
                      return (
                        <div
                          key={u.id}
                          onMouseEnter={() => setHoverRowId(u.id)}
                          onMouseLeave={() => setHoverRowId(null)}
                          style={{
                            ...userRowGrid,
                            padding: "8px 10px",
                            borderBottom: isLast ? "none" : "1px solid #1e293b",
                            background: isHover ? "#172033" : "#0f172a",
                            boxShadow: u.activo ? "inset 3px 0 0 #22c55e" : "inset 3px 0 0 #64748b",
                            transition: "background 0.12s ease",
                          }}
                        >
                          <div style={{ minWidth: 0, paddingLeft: 4 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: "#f8fafc",
                                letterSpacing: "-0.02em",
                                lineHeight: 1.25,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={u.nombre}
                            >
                              {u.nombre}
                            </div>
                            <div
                              style={{
                                marginTop: 3,
                                fontSize: 10,
                                fontWeight: 500,
                                color: "#475569",
                                letterSpacing: "0.01em",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={u.email}
                            >
                              {u.email}
                            </div>
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "6px 12px",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 800,
                                letterSpacing: "-0.02em",
                                lineHeight: 1.2,
                                background: rb.bg,
                                border: `1px solid ${rb.border}`,
                                color: rb.color,
                                maxWidth: "100%",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={t(roleLabelKey(u.rol))}
                            >
                              {t(roleLabelKey(u.rol))}
                            </span>
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: accColor,
                                letterSpacing: "-0.02em",
                                lineHeight: 1.25,
                              }}
                            >
                              {t(accessTierLabelKey(tier))}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 10, fontWeight: 600, color: "#64748b", lineHeight: 1.2 }}>
                              {modulesCountLine(modCount, t)}
                            </div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 78,
                                padding: "5px 10px",
                                borderRadius: 6,
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                background: u.activo ? "rgba(34, 197, 94, 0.38)" : "rgba(51, 65, 85, 0.95)",
                                border: u.activo ? "1px solid #4ade80" : "1px solid #64748b",
                                color: u.activo ? "#f0fdf4" : "#e2e8f0",
                                boxShadow: u.activo ? "inset 0 1px 0 rgba(255,255,255,0.12)" : "none",
                              }}
                            >
                              {u.activo ? t("users.statusActive") : t("users.statusInactive")}
                            </span>
                          </div>

                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={() => openEdit(u)}
                              style={{
                                border: "1px solid #475569",
                                background: "rgba(30, 41, 59, 0.5)",
                                color: "#e2e8f0",
                                padding: "5px 10px",
                                borderRadius: 8,
                                cursor: "pointer",
                                fontWeight: 600,
                                fontSize: 11,
                                lineHeight: 1.2,
                              }}
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActivo(u)}
                              style={{
                                border: u.activo ? "1px solid rgba(248, 113, 113, 0.45)" : "1px solid rgba(74, 222, 128, 0.45)",
                                background: u.activo ? "rgba(127, 29, 29, 0.2)" : "rgba(6, 78, 59, 0.25)",
                                color: u.activo ? "#fca5a5" : "#86efac",
                                padding: "5px 10px",
                                borderRadius: 8,
                                cursor: "pointer",
                                fontWeight: 600,
                                fontSize: 11,
                                lineHeight: 1.2,
                              }}
                            >
                              {u.activo ? t("users.actionDeactivate") : t("users.actionActivate")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {formOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(2, 6, 23, 0.62)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "min(90vh, 640px)",
              overflowY: "auto",
              borderRadius: 18,
              padding: "22px 22px 20px",
              background: "linear-gradient(165deg, #1e293b 0%, #0f172a 100%)",
              border: "1px solid rgba(148, 163, 184, 0.12)",
              boxShadow: "0 20px 56px rgba(0,0,0,0.42)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="user-modal-title"
              style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: "#f8fafc" }}
            >
              {editingId ? t("users.modalEditTitle") : t("users.modalNewTitle")}
            </h2>

            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
              <div>
                <label style={modalLabel}>{t("users.fieldName")}</label>
                <input value={draftNombre} onChange={(e) => setDraftNombre(e.target.value)} style={modalInput} />
              </div>
              <div>
                <label style={modalLabel}>{t("users.fieldEmail")}</label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={draftEmail}
                  onChange={(e) => setDraftEmail(e.target.value)}
                  style={modalInput}
                />
              </div>
              <div>
                <label style={modalLabel}>{t("users.fieldRole")}</label>
                <select
                  value={draftRol}
                  onChange={(e) => {
                    const r = e.target.value as UsuarioRol;
                    setDraftRol(r);
                    if (!editingId) setDraftModulos(defaultModulosForRol(r));
                  }}
                  style={{ ...modalInput, cursor: "pointer" }}
                >
                  {USUARIO_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(roleLabelKey(r))}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span style={modalLabel}>{t("users.fieldModules")}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                  {USUARIO_MODULOS.map((m) => (
                    <label
                      key={m}
                      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "#cbd5e1" }}
                    >
                      <input
                        type="checkbox"
                        checked={draftModulos[m]}
                        onChange={(e) => setModulo(m, e.target.checked)}
                      />
                      {t(modLabelKey(m))}
                    </label>
                  ))}
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "#cbd5e1" }}>
                <input type="checkbox" checked={draftActivo} onChange={(e) => setDraftActivo(e.target.checked)} />
                {t("users.fieldActive")}
              </label>
            </div>

            {formError ? (
              <p style={{ color: "#fca5a5", marginTop: 12, marginBottom: 0, fontSize: 13, lineHeight: 1.45 }}>{formError}</p>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={submitForm}
                style={{
                  border: "1px solid rgba(96, 165, 250, 0.2)",
                  background: "#2563eb",
                  color: "#f8fafc",
                  padding: "10px 18px",
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  flex: "1 1 140px",
                }}
              >
                {t("users.saveUser")}
              </button>
              <button
                type="button"
                onClick={closeForm}
                style={{
                  border: "1px solid rgba(148, 163, 184, 0.16)",
                  background: "rgba(30, 41, 59, 0.55)",
                  color: "#cbd5e1",
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ModulePageShell>
  );
}
