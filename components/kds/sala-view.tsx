"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import { useOperationFilter } from "@/components/kds/operation-filter-context";
import ServiceMetricsBar from "@/components/kds/service-metrics-bar";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";

type SalaItem = {
  id: string;
  name: string;
  qty: number;
  status?: string;
  preparedAt?: unknown;
  extras?: { name: string }[];
  note?: string;
};

type SalaOrder = {
  id: string;
  table?: string | null;
  tableId?: string | null;
  waiterId?: string | null;
  status?: string;
  items: SalaItem[];
};

type SalaLine = {
  orderId: string;
  itemId: string;
  name: string;
  qty: number;
  preparedAtMs?: number;
  extras?: { name: string }[];
  note?: string;
};

type SalaTableGroup = {
  tableKey: string;
  tableLabel: string;
  lines: SalaLine[];
  oldestPreparedAtMs?: number;
  priority: PriorityLevel;
  oldestMinutes: number;
};

function readItemNoteFromRecord(rec: Record<string, unknown>): string | undefined {
  const keys = ["note", "lineNote", "notes", "comment", "observations"] as const;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function readItemExtrasFromRecord(
  rec: Record<string, unknown>,
): { name: string }[] {
  const raw = rec.extras;
  if (!Array.isArray(raw)) return [];
  const out: { name: string }[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const name = String((x as Record<string, unknown>).name ?? "").trim();
    if (name) out.push({ name });
  }
  return out;
}

function readMs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Timestamp) return v.toMillis();
  if (
    v &&
    typeof v === "object" &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  return undefined;
}

function readItemsArray(raw: unknown): SalaItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SalaItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id : "";
    if (!id) continue;
    const name =
      (typeof rec.name === "string" && rec.name) ||
      (typeof rec.nombre === "string" && (rec.nombre as string)) ||
      "";
    const qtyRaw = rec.qty ?? rec.quantity;
    const qty = typeof qtyRaw === "number" && Number.isFinite(qtyRaw) ? qtyRaw : 1;
    const status = typeof rec.status === "string" ? rec.status : undefined;
    const extras = readItemExtrasFromRecord(rec);
    const note = readItemNoteFromRecord(rec);
    out.push({
      id,
      name: String(name || "Producto"),
      qty,
      status,
      preparedAt: rec.preparedAt,
      ...(extras.length > 0 ? { extras } : {}),
      ...(note ? { note } : {}),
    });
  }
  return out;
}

const TERMINAL_STATUSES = new Set(["closed", "paid", "cancelled", "canceled"]);

function isOrderActive(status: string | undefined): boolean {
  if (!status) return true;
  return !TERMINAL_STATUSES.has(status.trim().toLowerCase());
}

function isPreparedStatus(raw: string | undefined): boolean {
  if (!raw) return false;
  const s = raw.trim().toLowerCase();
  return s === "prepared" || s === "ready";
}

type PriorityLevel = "normal" | "attention" | "critical";

function priorityLevelFor(minutes: number): PriorityLevel {
  if (minutes >= 10) return "critical";
  if (minutes >= 5) return "attention";
  return "normal";
}

function priorityRank(level: PriorityLevel): number {
  if (level === "critical") return 0;
  if (level === "attention") return 1;
  return 2;
}

type PriorityTone = {
  border: string;
  boxShadow?: string;
  badgeBg: string;
  badgeColor: string;
  badgeBorder?: string;
};

function priorityTone(level: PriorityLevel): PriorityTone {
  if (level === "critical") {
    return {
      border: "1px solid rgba(239, 68, 68, 0.7)",
      boxShadow:
        "0 0 0 1px rgba(239, 68, 68, 0.25), 0 8px 24px -12px rgba(239, 68, 68, 0.45)",
      badgeBg: "rgba(239, 68, 68, 0.28)",
      badgeColor: "#fee2e2",
      badgeBorder: "1px solid rgba(239, 68, 68, 0.55)",
    };
  }
  if (level === "attention") {
    return {
      border: "1px solid rgba(251, 146, 60, 0.6)",
      badgeBg: "rgba(251, 146, 60, 0.28)",
      badgeColor: "#fed7aa",
      badgeBorder: "1px solid rgba(251, 146, 60, 0.5)",
    };
  }
  return {
    border: "1px solid rgba(148, 163, 184, 0.22)",
    badgeBg: "rgba(148, 163, 184, 0.18)",
    badgeColor: "#cbd5f5",
  };
}

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${Math.floor(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: 14,
  alignContent: "start",
  paddingBottom: 16,
};

const emptyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 24px",
  borderRadius: 14,
  border: "1px dashed rgba(148, 163, 184, 0.28)",
  background: "rgba(15, 23, 42, 0.45)",
  color: "#94a3b8",
  fontSize: 14,
  fontWeight: 600,
  textAlign: "center",
};

const cardBaseStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 14,
  borderRadius: 14,
  background: "rgba(15, 23, 42, 0.72)",
  color: "#e2e8f0",
  boxShadow: "0 8px 24px -18px rgba(2, 6, 23, 0.9)",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 10,
  color: "#e2e8f0",
};

const headerTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#cbd5f5",
};

const headerCountStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(148, 163, 184, 0.18)",
  color: "#e2e8f0",
};

const tableTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  color: "#f8fafc",
};

const badgeStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  letterSpacing: "0.02em",
};

function summaryChipStyle(level: PriorityLevel): CSSProperties {
  const base: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 9px",
    borderRadius: 999,
    letterSpacing: "0.02em",
  };
  if (level === "critical") {
    return {
      ...base,
      background: "rgba(239, 68, 68, 0.18)",
      color: "#fecaca",
      border: "1px solid rgba(239, 68, 68, 0.4)",
    };
  }
  if (level === "attention") {
    return {
      ...base,
      background: "rgba(251, 146, 60, 0.2)",
      color: "#fed7aa",
      border: "1px solid rgba(251, 146, 60, 0.4)",
    };
  }
  return {
    ...base,
    background: "rgba(148, 163, 184, 0.16)",
    color: "#cbd5f5",
    border: "1px solid rgba(148, 163, 184, 0.3)",
  };
}

const lineRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(148, 163, 184, 0.08)",
  border: "1px solid rgba(148, 163, 184, 0.12)",
};

const lineNameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#f1f5f9",
  lineHeight: 1.2,
};

const lineMetaStyle: CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  marginTop: 2,
};

const lineExtrasStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 650,
  color: "#93c5fd",
  lineHeight: 1.25,
  wordBreak: "break-word",
};

const lineNoteStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 650,
  fontStyle: "italic",
  color: "#fde68a",
  lineHeight: 1.3,
  wordBreak: "break-word",
};

const markButtonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid rgba(34, 197, 94, 0.45)",
  background: "rgba(34, 197, 94, 0.18)",
  color: "#bbf7d0",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export default function SalaView() {
  const { restaurantId, ready: authReady } = useAuth();
  const { matchesOrder } = useOperationFilter();
  const [orders, setOrders] = useState<SalaOrder[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [busyItemIds, setBusyItemIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) return;
    const q = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const next: SalaOrder[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          table:
            (typeof data.table === "string" && (data.table as string)) ||
            (typeof data.tableName === "string" && (data.tableName as string)) ||
            null,
          tableId:
            typeof data.tableId === "string" ? (data.tableId as string) : null,
          waiterId:
            typeof data.waiterId === "string" ? (data.waiterId as string) : null,
          status:
            typeof data.status === "string" ? (data.status as string) : undefined,
          items: readItemsArray(data.items),
        };
      });
      setOrders(next);
    });
    return () => unsub();
  }, [authReady, restaurantId]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const groups = useMemo<SalaTableGroup[]>(() => {
    const byTable = new Map<string, SalaTableGroup>();
    for (const order of orders) {
      if (!isOrderActive(order.status)) continue;
      if (!matchesOrder(order)) continue;
      const tableLabel =
        (order.table && order.table.trim()) ||
        (order.tableId && `Mesa ${order.tableId}`) ||
        "Sin mesa";
      const tableKey = order.tableId?.trim() || tableLabel;
      for (const item of order.items) {
        if (!isPreparedStatus(item.status)) continue;
        const preparedAtMs = readMs(item.preparedAt);
        const line: SalaLine = {
          orderId: order.id,
          itemId: item.id,
          name: item.name,
          qty: item.qty,
          preparedAtMs,
          ...(item.extras && item.extras.length > 0
            ? { extras: item.extras }
            : {}),
          ...(item.note ? { note: item.note } : {}),
        };
        let g = byTable.get(tableKey);
        if (!g) {
          g = {
            tableKey,
            tableLabel,
            lines: [],
            oldestPreparedAtMs: preparedAtMs,
            priority: "normal",
            oldestMinutes: 0,
          };
          byTable.set(tableKey, g);
        }
        g.lines.push(line);
        if (
          preparedAtMs != null &&
          (g.oldestPreparedAtMs == null ||
            preparedAtMs < g.oldestPreparedAtMs)
        ) {
          g.oldestPreparedAtMs = preparedAtMs;
        }
      }
    }
    const list = Array.from(byTable.values());
    for (const g of list) {
      g.lines.sort((a, b) => (a.preparedAtMs ?? 0) - (b.preparedAtMs ?? 0));
      const minutes =
        g.oldestPreparedAtMs != null
          ? (nowMs - g.oldestPreparedAtMs) / 60000
          : 0;
      g.oldestMinutes = minutes;
      g.priority = priorityLevelFor(minutes);
    }
    list.sort((a, b) => {
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      return (a.oldestPreparedAtMs ?? 0) - (b.oldestPreparedAtMs ?? 0);
    });
    return list;
  }, [orders, nowMs, matchesOrder]);

  const priorityCounts = useMemo(() => {
    let normal = 0;
    let attention = 0;
    let critical = 0;
    for (const g of groups) {
      if (g.priority === "critical") critical += 1;
      else if (g.priority === "attention") attention += 1;
      else normal += 1;
    }
    return { normal, attention, critical };
  }, [groups]);

  async function handleMarkServed(orderId: string, itemId: string) {
    if (!isFirebaseConfigured) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const key = `${orderId}:${itemId}`;
    if (busyItemIds[key]) return;
    setBusyItemIds((prev) => ({ ...prev, [key]: true }));
    const now = Date.now();
    const nextItems = order.items.map((it) =>
      it.id === itemId && isPreparedStatus(it.status)
        ? { ...it, status: "served", servedAt: now }
        : it,
    );
    try {
      await updateDoc(doc(db, "orders", orderId), {
        items: nextItems,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("SalaView.handleMarkServed", e);
    } finally {
      setBusyItemIds((prev) => {
        const cp = { ...prev };
        delete cp[key];
        return cp;
      });
    }
  }

  const totalLines = groups.reduce((acc, g) => acc + g.lines.length, 0);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <ServiceMetricsBar scope="all" />
      {totalLines === 0 ? (
        <div style={emptyStyle}>
          No hay productos pendientes de servir
        </div>
      ) : (
        <SalaBoard
          groups={groups}
          totalLines={totalLines}
          priorityCounts={priorityCounts}
          nowMs={nowMs}
          busyItemIds={busyItemIds}
          onMarkServed={handleMarkServed}
        />
      )}
    </div>
  );
}

function SalaBoard({
  groups,
  totalLines,
  priorityCounts,
  nowMs,
  busyItemIds,
  onMarkServed,
}: {
  groups: SalaTableGroup[];
  totalLines: number;
  priorityCounts: { normal: number; attention: number; critical: number };
  nowMs: number;
  busyItemIds: Record<string, boolean>;
  onMarkServed: (orderId: string, itemId: string) => void;
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <div style={headerRowStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={headerTitleStyle}>Pendiente de servir</h3>
          <span style={headerCountStyle}>{totalLines}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={summaryChipStyle("normal")}>
            {priorityCounts.normal} listas
          </span>
          <span style={summaryChipStyle("attention")}>
            {priorityCounts.attention} atención
          </span>
          <span style={summaryChipStyle("critical")}>
            {priorityCounts.critical} urgentes
          </span>
        </div>
      </div>
      <div style={gridStyle}>
        {groups.map((g) => {
          const tone = priorityTone(g.priority);
          return (
            <div
              key={g.tableKey}
              style={{
                ...cardBaseStyle,
                border: tone.border,
                boxShadow: tone.boxShadow ?? cardBaseStyle.boxShadow,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <h4 style={tableTitleStyle}>{g.tableLabel}</h4>
                  {g.priority === "critical" ? (
                    <span
                      style={{
                        ...badgeStyle,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        fontSize: 10,
                        background: "rgba(239, 68, 68, 0.22)",
                        color: "#fecaca",
                        border: "1px solid rgba(239, 68, 68, 0.45)",
                      }}
                    >
                      Urgente
                    </span>
                  ) : null}
                </div>
                {g.oldestPreparedAtMs != null ? (
                  <span
                    style={{
                      ...badgeStyle,
                      background: tone.badgeBg,
                      color: tone.badgeColor,
                      border: tone.badgeBorder,
                    }}
                  >
                    {formatMinutes(g.oldestMinutes)}
                  </span>
                ) : null}
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                {g.lines.map((line) => {
                  const minutes =
                    line.preparedAtMs != null
                      ? Math.floor((nowMs - line.preparedAtMs) / 60000)
                      : 0;
                  let itemBorder = "1px solid #e5e7eb"; // gray-200
                  let itemBg = "rgba(15, 23, 42, 0.72)";
                  if (minutes >= 10) {
                    itemBorder = "1px solid #ef4444";
                    itemBg = "rgba(254, 242, 242, 0.12)";
                  } else if (minutes >= 5) {
                    itemBorder = "1px solid #fb923c";
                    itemBg = "rgba(255, 247, 237, 0.12)";
                  }
                  const busy = busyItemIds[`${line.orderId}:${line.itemId}`];
                  return (
                    <div
                      key={`${line.orderId}:${line.itemId}`}
                      style={{
                        ...lineRowStyle,
                        border: itemBorder,
                        background: itemBg,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                        <div style={lineNameStyle}>
                          {line.qty}x {line.name}
                        </div>
                        {line.extras && line.extras.length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              marginTop: 4,
                            }}
                          >
                            {line.extras.map((ex, xi) => (
                              <div
                                key={`${line.orderId}:${line.itemId}:ex:${xi}`}
                                style={lineExtrasStyle}
                              >
                                + {ex.name}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {line.note ? (
                          <div style={{ ...lineNoteStyle, marginTop: 4 }}>
                            Nota: {line.note}
                          </div>
                        ) : null}
                        <div style={lineMetaStyle}>
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              marginRight: 6,
                            }}
                          >
                            {minutes} min
                          </div>
                          <span>
                            {line.preparedAtMs != null
                              ? `Listo hace ${formatMinutes(minutes)}`
                              : "Listo"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        style={{
                          ...markButtonStyle,
                          alignSelf: "center",
                          flexShrink: 0,
                          opacity: busy ? 0.6 : 1,
                          cursor: busy ? "progress" : "pointer",
                        }}
                        onClick={() =>
                          onMarkServed(line.orderId, line.itemId)
                        }
                      >
                        {busy ? "Guardando…" : "Marcar como servido"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
