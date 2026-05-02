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
import { db, isFirebaseConfigured } from "@/lib/firebase/client";

export type BoardItem = {
  id: string;
  name: string;
  qty: number;
  status?: string;
  categoria?: string;
  category?: string;
  categoryName?: string;
  sentAt?: unknown;
  preparedAt?: unknown;
  servedAt?: unknown;
  extras?: { name: string }[];
  note?: string;
  removedIngredients?: string[];
  /** Pase / curso: 0 = sin pase, 1–4 = entrante…postre. */
  course: number;
  tableName?: string;
  tableId?: string | null;
};

export type BoardOrder = {
  id: string;
  table?: string | null;
  tableId?: string | null;
  waiterId?: string | null;
  status?: string;
  items: BoardItem[];
};

type BoardStatus = "sent" | "prepared" | "served";

function cleanFirestoreData<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

type BoardLine = {
  orderId: string;
  itemId: string;
  name: string;
  qty: number;
  status: BoardStatus;
  sentAtMs?: number;
  preparedAtMs?: number;
  servedAtMs?: number;
  extras?: { name: string }[];
  note?: string;
  removedIngredients?: string[];
  course: number;
  /** Texto para fila "Mesa …" (ítem o pedido). */
  mesaRowText: string;
};

type BoardTableGroup = {
  tableKey: string;
  tableLabel: string;
  lines: BoardLine[];
  oldestSentAtMs?: number;
};

export type BoardColumnAction = {
  label: string;
  busyLabel?: string;
  nextStatus: "prepared" | "served";
};

export type OrderItemsBoardProps = {
  itemFilter: (item: BoardItem) => boolean;
  emptyMessage: string;
  sentAction: BoardColumnAction;
  preparedAction: BoardColumnAction;
};

function readItemNoteFromRecord(rec: Record<string, unknown>): string | undefined {
  const keys = ["note", "lineNote", "notes", "comment", "observations"] as const;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function readItemCourseFromRecord(rec: Record<string, unknown>): number {
  const raw = rec.course ?? rec.pase;
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const u = Math.floor(n);
  if (u === 0) return 0;
  if (u >= 1 && u <= 4) return u;
  return Math.min(4, Math.max(1, u));
}

function sortCourseKey(course: number): number {
  if (course === 0) return 999;
  if (course >= 1 && course <= 4) return course;
  return 998;
}

function getCourseLabel(course: number): string {
  if (course === 1) return "Entrante";
  if (course === 2) return "Principal";
  if (course === 3) return "Postre";
  if (course === 4) return "Postre";
  return "";
}

function getCourseSectionLabel(course: number): string {
  if (course === 1) return "Entrantes";
  if (course === 2) return "Segundos";
  if (course === 3 || course === 4) return "Postres";
  return "Sin pase";
}

function sortCourseSectionKey(course: number): number {
  if (course === 1) return 1;
  if (course === 2) return 2;
  if (course === 3 || course === 4) return 3;
  return 4;
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

function readItemRemovedIngredientsFromRecord(rec: Record<string, unknown>): string[] {
  const raw = rec.removedIngredients;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
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

function readItemsArray(raw: unknown): BoardItem[] {
  if (!Array.isArray(raw)) return [];
  const out: BoardItem[] = [];
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
    const course = readItemCourseFromRecord(rec);
    const removedIngredients = readItemRemovedIngredientsFromRecord(rec);
    const itemTableNameRaw =
      (typeof rec.tableName === "string" && rec.tableName.trim()) ||
      (typeof rec.table === "string" && rec.table.trim()) ||
      "";
    const itemTableIdRaw =
      typeof rec.tableId === "string" && rec.tableId.trim()
        ? rec.tableId.trim()
        : "";
    out.push({
      id,
      name: String(name || "Producto"),
      qty,
      status,
      categoria:
        typeof rec.categoria === "string" ? (rec.categoria as string) : undefined,
      category:
        typeof rec.category === "string" ? (rec.category as string) : undefined,
      categoryName:
        typeof rec.categoryName === "string"
          ? (rec.categoryName as string)
          : undefined,
      sentAt: rec.sentAt,
      preparedAt: rec.preparedAt,
      servedAt: rec.servedAt,
      course,
      ...(itemTableNameRaw ? { tableName: itemTableNameRaw } : {}),
      ...(itemTableIdRaw ? { tableId: itemTableIdRaw } : {}),
      ...(extras.length > 0 ? { extras } : {}),
      ...(note ? { note } : {}),
      ...(removedIngredients.length > 0 ? { removedIngredients } : {}),
    });
  }
  return out;
}

const TERMINAL_STATUSES = new Set(["closed", "paid", "cancelled", "canceled"]);

function isOrderActive(status: string | undefined): boolean {
  if (!status) return true;
  return !TERMINAL_STATUSES.has(status.trim().toLowerCase());
}

function classifyBoardStatus(raw: string | undefined): BoardStatus | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "sent" || s === "preparing") return "sent";
  if (s === "prepared" || s === "ready") return "prepared";
  if (s === "served") return "served";
  return null;
}

function urgencyTone(minutes: number): {
  border: string;
  badgeBg: string;
  badgeColor: string;
} {
  if (minutes >= 20) {
    return {
      border: "1px solid rgba(239, 68, 68, 0.55)",
      badgeBg: "rgba(239, 68, 68, 0.22)",
      badgeColor: "#fecaca",
    };
  }
  if (minutes >= 10) {
    return {
      border: "1px solid rgba(251, 146, 60, 0.55)",
      badgeBg: "rgba(251, 146, 60, 0.22)",
      badgeColor: "#fed7aa",
    };
  }
  return {
    border: "1px solid rgba(148, 163, 184, 0.22)",
    badgeBg: "rgba(148, 163, 184, 0.18)",
    badgeColor: "#cbd5f5",
  };
}

const servedTone = {
  border: "1px solid rgba(34, 197, 94, 0.32)",
  badgeBg: "rgba(34, 197, 94, 0.18)",
  badgeColor: "#bbf7d0",
};

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${Math.floor(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const boardStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const columnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  minWidth: 0,
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(15, 23, 42, 0.45)",
};

const columnHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
  color: "#e2e8f0",
};

const columnTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#cbd5f5",
};

const columnCountStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(148, 163, 184, 0.18)",
  color: "#e2e8f0",
};

const columnBodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const emptyColumnStyle: CSSProperties = {
  padding: "24px 12px",
  textAlign: "center",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 600,
};

const emptyBoardStyle: CSSProperties = {
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
  gap: 8,
  padding: 12,
  borderRadius: 12,
  background: "rgba(15, 23, 42, 0.72)",
  color: "#e2e8f0",
  boxShadow: "0 8px 24px -18px rgba(2, 6, 23, 0.9)",
};

const tableTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
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
  marginTop: 6,
};

const lineNoteStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  fontStyle: "italic",
  color: "#fde047",
  lineHeight: 1.3,
  marginTop: 4,
  wordBreak: "break-word",
};

const lineCourseTypeStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: "#9ca3af",
  lineHeight: 1.2,
  marginTop: 2,
};

const lineMesaLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#9ca3af",
  lineHeight: 1.2,
};

const lineExtrasJoinedStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#93c5fd",
  lineHeight: 1.25,
  marginTop: 4,
  wordBreak: "break-word",
};

const lineRemovedStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#cbd5e1",
  lineHeight: 1.25,
  marginTop: 4,
  wordBreak: "break-word",
};

const coursePillStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.06em",
  padding: "2px 6px",
  borderRadius: 6,
  background: "rgba(96, 165, 250, 0.2)",
  color: "#bfdbfe",
  border: "1px solid rgba(96, 165, 250, 0.35)",
  lineHeight: 1.1,
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

type DecoratedLine = BoardLine & {
  tableKey: string;
  tableLabel: string;
};

function groupLinesByTable(lines: DecoratedLine[]): BoardTableGroup[] {
  const byKey = new Map<string, BoardTableGroup>();
  for (const line of lines) {
    const { tableKey, tableLabel, ...rest } = line;
    const bare: BoardLine = rest;
    let g = byKey.get(tableKey);
    if (!g) {
      g = {
        tableKey,
        tableLabel,
        lines: [],
        oldestSentAtMs: bare.sentAtMs,
      };
      byKey.set(tableKey, g);
    }
    g.lines.push(bare);
    if (
      bare.sentAtMs != null &&
      (g.oldestSentAtMs == null || bare.sentAtMs < g.oldestSentAtMs)
    ) {
      g.oldestSentAtMs = bare.sentAtMs;
    }
  }
  const list = Array.from(byKey.values());
  for (const g of list) {
    g.lines.sort((a, b) => {
      const ka = sortCourseKey(a.course);
      const kb = sortCourseKey(b.course);
      if (ka !== kb) return ka - kb;
      return (a.sentAtMs ?? 0) - (b.sentAtMs ?? 0);
    });
  }
  list.sort((a, b) => (a.oldestSentAtMs ?? 0) - (b.oldestSentAtMs ?? 0));
  return list;
}

export default function OrderItemsBoard({
  itemFilter,
  emptyMessage,
  sentAction,
  preparedAction,
}: OrderItemsBoardProps) {
  const { restaurantId, ready: authReady } = useAuth();
  const { matchesOrder } = useOperationFilter();
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [busyItemIds, setBusyItemIds] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) return;
    const q = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const next: BoardOrder[] = snapshot.docs.map((d) => {
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

  const columns = useMemo(() => {
    const sent: DecoratedLine[] = [];
    const prepared: DecoratedLine[] = [];
    const served: DecoratedLine[] = [];
    for (const order of orders) {
      if (!isOrderActive(order.status)) continue;
      if (!matchesOrder(order)) continue;
      const tableLabel =
        (order.table && order.table.trim()) ||
        (order.tableId && `Mesa ${order.tableId}`) ||
        "Sin mesa";
      const tableKey = order.tableId?.trim() || tableLabel;
      for (const item of order.items) {
        const bs = classifyBoardStatus(item.status);
        if (!bs) continue;
        if (!itemFilter(item)) continue;
        const sentAtMs = readMs(item.sentAt);
        const preparedAtMs = readMs(item.preparedAt);
        const servedAtMs = readMs(item.servedAt);
        const mesaRowText =
          item.tableName?.trim() ||
          item.tableId?.trim() ||
          order.table?.trim() ||
          order.tableId?.trim() ||
          tableLabel;
        const line: DecoratedLine = {
          tableKey,
          tableLabel,
          orderId: order.id,
          itemId: item.id,
          name: item.name,
          qty: item.qty,
          status: bs,
          sentAtMs,
          preparedAtMs,
          servedAtMs,
          course: item.course,
          mesaRowText,
          ...(item.extras && item.extras.length > 0
            ? { extras: item.extras }
            : {}),
          ...(item.note ? { note: item.note } : {}),
          ...(item.removedIngredients && item.removedIngredients.length > 0
            ? { removedIngredients: item.removedIngredients }
            : {}),
        };
        if (bs === "sent") sent.push(line);
        else if (bs === "prepared") prepared.push(line);
        else served.push(line);
      }
    }
    return {
      sent: groupLinesByTable(sent),
      prepared: groupLinesByTable(prepared),
      served: groupLinesByTable(served),
    };
  }, [orders, itemFilter, matchesOrder]);

  async function handleMarkNext(
    orderId: string,
    itemId: string,
    next: "prepared" | "served",
  ) {
    if (!isFirebaseConfigured) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const key = `${orderId}:${itemId}`;
    if (busyItemIds[key]) return;
    setBusyItemIds((prev) => ({ ...prev, [key]: true }));
    const now = Date.now();
    const nextItems: BoardItem[] = [];
    for (const it of order.items) {
      if (it.id !== itemId) {
        nextItems.push(it);
        continue;
      }

      const qty = typeof it.qty === "number" && Number.isFinite(it.qty) ? it.qty : 1;

      // Si hay varias unidades, marcar solo 1 unidad avanzando estado.
      if (qty > 1) {
        nextItems.push({ ...it, qty: qty - 1 });
        const newId = `${it.id}-${now}-${Math.random().toString(16).slice(2)}`;
        const advanced: BoardItem = {
          ...it,
          id: newId,
          qty: 1,
          status: next,
          ...(next === "prepared" ? { preparedAt: now } : { servedAt: now }),
          createdAt: now,
          updatedAt: now,
        } as BoardItem & { createdAt?: number; updatedAt?: number };
        nextItems.push(advanced);
        continue;
      }

      // Mantener comportamiento actual para qty === 1.
      if (next === "prepared") {
        nextItems.push({ ...it, status: "prepared", preparedAt: now });
      } else {
        nextItems.push({ ...it, status: "served", servedAt: now });
      }
    }
    try {
      await updateDoc(
        doc(db, "orders", orderId),
        cleanFirestoreData({
          items: nextItems,
          updatedAt: serverTimestamp(),
        }),
      );
      setActionSuccess("Pedido actualizado");
      setTimeout(() => setActionSuccess(null), 1500);
    } catch (e) {
      console.error("OrderItemsBoard.handleMarkNext", e);
      setActionError("No se pudo actualizar el pedido. Inténtalo otra vez.");
      setTimeout(() => setActionError(null), 3000);
    } finally {
      setBusyItemIds((prev) => {
        const cp = { ...prev };
        delete cp[key];
        return cp;
      });
    }
  }

  const totalLines =
    columns.sent.reduce((acc, g) => acc + g.lines.length, 0) +
    columns.prepared.reduce((acc, g) => acc + g.lines.length, 0) +
    columns.served.reduce((acc, g) => acc + g.lines.length, 0);

  if (totalLines === 0) {
    return <div style={emptyBoardStyle}>{emptyMessage}</div>;
  }

  return (
    <>
      {actionError && (
        <div className="mb-3 rounded border border-red-500 bg-red-100 px-3 py-2 text-sm font-bold text-red-700">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="mb-3 rounded border border-green-500 bg-green-100 px-3 py-2 text-sm font-bold text-green-700">
          {actionSuccess}
        </div>
      )}
      <div style={boardStyle}>
        <BoardColumn
          title="Pendiente"
          count={columns.sent.reduce((a, g) => a + g.lines.length, 0)}
          groups={columns.sent}
          nowMs={nowMs}
          showUrgency
          action={sentAction}
          busyItemIds={busyItemIds}
          onMark={handleMarkNext}
        />
        <BoardColumn
          title="Listo"
          count={columns.prepared.reduce((a, g) => a + g.lines.length, 0)}
          groups={columns.prepared}
          nowMs={nowMs}
          showUrgency
          action={preparedAction}
          busyItemIds={busyItemIds}
          onMark={handleMarkNext}
        />
        <BoardColumn
          title="Servido"
          count={columns.served.reduce((a, g) => a + g.lines.length, 0)}
          groups={columns.served}
          nowMs={nowMs}
          showUrgency={false}
          action={null}
          busyItemIds={busyItemIds}
          onMark={handleMarkNext}
        />
      </div>
    </>
  );
}

function BoardColumn({
  title,
  count,
  groups,
  nowMs,
  showUrgency,
  action,
  busyItemIds,
  onMark,
}: {
  title: string;
  count: number;
  groups: BoardTableGroup[];
  nowMs: number;
  showUrgency: boolean;
  action: BoardColumnAction | null;
  busyItemIds: Record<string, boolean>;
  onMark: (
    orderId: string,
    itemId: string,
    next: "prepared" | "served",
  ) => void;
}) {
  return (
    <div style={columnStyle}>
      <div style={columnHeaderStyle}>
        <h3 style={columnTitleStyle}>{title}</h3>
        <span style={columnCountStyle}>{count}</span>
      </div>
      <div style={columnBodyStyle}>
        {groups.length === 0 ? (
          <div style={emptyColumnStyle}>—</div>
        ) : (
          groups.map((g) => {
            const oldestMinutes =
              g.oldestSentAtMs != null
                ? (nowMs - g.oldestSentAtMs) / 60000
                : 0;
            const tone = showUrgency
              ? urgencyTone(oldestMinutes)
              : servedTone;
            const byCourse = new Map<number, BoardLine[]>();
            for (const line of g.lines) {
              const key =
                line.course === 3 || line.course === 4
                  ? 3
                  : line.course >= 1 && line.course <= 2
                    ? line.course
                    : 0;
              const arr = byCourse.get(key) ?? [];
              arr.push(line);
              byCourse.set(key, arr);
            }
            const courseSections = Array.from(byCourse.entries())
              .sort((a, b) => sortCourseSectionKey(a[0]) - sortCourseSectionKey(b[0]))
              .map(([course, lines]) => ({
                course,
                label: getCourseSectionLabel(course).toUpperCase(),
                lines,
              }));
            return (
              <div
                key={g.tableKey}
                style={{ ...cardBaseStyle, border: tone.border }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <h4 style={tableTitleStyle}>{g.tableLabel}</h4>
                  {showUrgency && g.oldestSentAtMs != null ? (
                    <span
                      style={{
                        ...badgeStyle,
                        background: tone.badgeBg,
                        color: tone.badgeColor,
                      }}
                    >
                      {formatMinutes(oldestMinutes)}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {courseSections.map((section) => (
                    <div key={section.label} style={{ display: "grid", gap: 6 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "#94a3b8",
                          marginTop: 2,
                        }}
                      >
                        {section.label}
                      </div>
                      {section.lines.map((line) => {
                        const minutes =
                          line.sentAtMs != null
                            ? Math.floor((nowMs - line.sentAtMs) / 60000)
                            : 0;
                        let itemBorder = "1px solid #e5e7eb"; // gray-200
                        let itemBg = "#ffffff";
                        if (minutes >= 10) {
                          itemBorder = "1px solid #ef4444";
                          itemBg = "#fef2f2";
                        } else if (minutes >= 5) {
                          itemBorder = "1px solid #fb923c";
                          itemBg = "#fff7ed";
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
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "stretch",
                                  gap: 2,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                    gap: 6,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span style={lineNameStyle}>
                                    x{line.qty} {line.name}
                                  </span>
                                </div>
                              </div>
                              {line.extras && line.extras.length > 0 ? (
                                <div style={lineExtrasJoinedStyle}>
                                  {line.extras.map((e) => `+ ${e.name}`).join(" · ")}
                                </div>
                              ) : null}
                              {line.removedIngredients &&
                              line.removedIngredients.length > 0 ? (
                                <div style={lineRemovedStyle}>
                                  Sin: {line.removedIngredients.join(" · ")}
                                </div>
                              ) : null}
                              {line.note ? (
                                <div style={lineNoteStyle}>Nota: {line.note}</div>
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
                                  {showUrgency && line.sentAtMs != null
                                    ? `Avisado hace ${formatMinutes(minutes)}`
                                    : line.status === "served" &&
                                        line.servedAtMs != null
                                      ? `Servido hace ${formatMinutes(
                                          (nowMs - line.servedAtMs) / 60000,
                                        )}`
                                      : line.status === "served"
                                        ? "Servido"
                                        : "Avisado"}
                                </span>
                              </div>
                            </div>
                            {action ? (
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
                                  onMark(line.orderId, line.itemId, action.nextStatus)
                                }
                              >
                                {busy ? (action.busyLabel ?? "Guardando…") : action.label}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
