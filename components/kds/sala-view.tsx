"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import { useOperationFilter } from "@/components/kds/operation-filter-context";
import ServiceMetricsBar from "@/components/kds/service-metrics-bar";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { transitionLineStatusViaApi } from "@/lib/firestore/tpv-mutations-via-api";
import { logFirestorePermissionError } from "@/lib/firestore/log-firestore-permission-error";
import {
  getHomogeneousPassChunkTypeLabel,
  getMenuCourseLabel,
  readItemCourseFromRecord,
} from "@/lib/carta/menu-course";
import {
  computeTablesReadyToClose,
  resolveTableReadyToCloseKey,
} from "@/lib/kds/table-ready-to-close";

type SalaItem = {
  id: string;
  name: string;
  qty: number;
  status?: string;
  preparedAt?: unknown;
  course?: number;
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
  course?: number;
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
  isTableFullyServed: boolean;
};

function salaLineItemStatus(line: SalaLine, orders: SalaOrder[]): string | undefined {
  const order = orders.find((o) => o.id === line.orderId);
  return order?.items.find((i) => i.id === line.itemId)?.status;
}

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
    const course = readItemCourseFromRecord(rec);
    out.push({
      id,
      name: String(name || "Producto"),
      qty,
      status,
      preparedAt: rec.preparedAt,
      ...(course >= 1 && course <= 4 ? { course } : {}),
      ...(extras.length > 0 ? { extras } : {}),
      ...(note ? { note } : {}),
    });
  }
  return out;
}

const TERMINAL_STATUSES = new Set(["closed", "paid", "cancelled", "canceled", "merged"]);

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
      border: "1px solid rgba(180, 70, 70, 0.35)",
      boxShadow: "var(--hostly-shadow-hairline)",
      badgeBg: "var(--hostly-danger-soft)",
      badgeColor: "#7f1d1d",
      badgeBorder: "1px solid rgba(180, 70, 70, 0.22)",
    };
  }
  if (level === "attention") {
    return {
      border: "1px solid rgba(200, 120, 60, 0.3)",
      badgeBg: "var(--hostly-warning-soft)",
      badgeColor: "var(--hostly-navy-deep)",
      badgeBorder: "1px solid rgba(200, 120, 60, 0.22)",
    };
  }
  return {
    border: "1px solid var(--hostly-line)",
    badgeBg: "var(--hostly-ice-100)",
    badgeColor: "var(--hostly-navy-mid)",
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

/** Misma ventana que cocina/barra (order-items-board) para agrupar ítems listos por “pase”. */
const PASS_BUCKET_MS = 2000;

function formatSalaPrepClockHm(preparedAtMs: number): string {
  const d = new Date(preparedAtMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Tiempo de espera en sala desde el primer listo del pase (preparedAtMs). */
function formatSalaPassElapsedWaitLabel(elapsedMs: number): string {
  const min = Math.floor(elapsedMs / 60000);
  return `${min} min`;
}

function salaPassPreparedWaitColorClass(elapsedMs: number): string {
  const min = elapsedMs / 60000;
  if (min >= 10) return "text-red-600";
  if (min >= 5) return "text-orange-600";
  return "text-gray-500";
}

function getSalaPassBgClass(ms: number | null): string {
  if (ms == null) return "border-[var(--hostly-line)] bg-[var(--hostly-ice-50)]";
  const min = ms / 60000;
  if (min >= 10) return "border-red-200 bg-red-50/95";
  if (min >= 5) return "border-amber-200 bg-amber-50/95";
  return "border-[var(--hostly-line)] bg-white";
}

function getSalaPassHeaderTextClass(ms: number | null): string {
  if (ms == null) return "text-gray-500";
  const min = ms / 60000;
  if (min >= 10) return "text-red-700";
  if (min >= 5) return "text-orange-700";
  return "text-gray-500";
}

function getSalaPassUrgencyLabel(ms: number | null): string | null {
  if (ms == null) return null;
  const min = ms / 60000;
  if (min >= 10) return "Urgente";
  if (min >= 5) return "Atención";
  return null;
}

function getSalaGroupUrgencyScore(lines: SalaLine[], nowMs: number): number {
  let maxScore = 0;
  for (const line of lines) {
    const t = line.preparedAtMs;
    if (typeof t === "number" && Number.isFinite(t)) {
      const min = (nowMs - t) / 60000;
      if (min >= 10) maxScore = Math.max(maxScore, 2);
      else if (min >= 5) maxScore = Math.max(maxScore, 1);
    }
  }
  return maxScore;
}

function getUrgencyLabel(score: number): string | null {
  if (score >= 2) return "Urgente";
  if (score >= 1) return "Atención";
  return null;
}

const getSalaGroupCardUrgencyClassName = (score: number) => {
  if (score >= 2) return "border-red-200 bg-red-50";
  if (score >= 1) return "border-orange-200 bg-orange-50";
  return "";
};

const formatMin = (ms: number) => {
  return `${Math.floor(ms / 60000)} min`;
};

const getSalaMetricsClass = (maxWait: number | null) => {
  if (maxWait == null) return "text-gray-500";
  const min = maxWait / 60000;
  if (min >= 10) return "text-red-600 font-semibold animate-pulse";
  if (min >= 5) return "text-orange-600";
  return "text-gray-500";
};

const getSalaStationStatus = (maxWait: number | null) => {
  if (maxWait == null) return null;
  const min = maxWait / 60000;
  if (min >= 10) return "Sala lenta";
  if (min >= 5) return "Sala atención";
  return "Sala en ritmo";
};

const getSalaStationStatusClass = (status: string | null) => {
  if (status === "Sala lenta") return "bg-red-100 text-red-700";
  if (status === "Sala atención") return "bg-orange-100 text-orange-700";
  if (status === "Sala en ritmo") return "bg-green-100 text-green-700";
  return "";
};

function groupSalaLinesByPase(lines: SalaLine[]): SalaLine[][] {
  if (lines.length === 0) return [];
  const withPreparedAt = lines.some(
    (l) => l.preparedAtMs != null && Number.isFinite(l.preparedAtMs),
  );
  if (!withPreparedAt) {
    return [lines.slice()];
  }
  const byBucket = new Map<number, SalaLine[]>();
  for (const line of lines) {
    const ms = line.preparedAtMs;
    const bucket =
      ms != null && Number.isFinite(ms)
        ? Math.floor(ms / PASS_BUCKET_MS)
        : Number.MAX_SAFE_INTEGER;
    const arr = byBucket.get(bucket) ?? [];
    arr.push(line);
    byBucket.set(bucket, arr);
  }
  const keys = Array.from(byBucket.keys()).sort((a, b) => a - b);
  return keys.map((k) => {
    const chunk = byBucket.get(k)!;
    chunk.sort((a, b) => (a.preparedAtMs ?? 0) - (b.preparedAtMs ?? 0));
    return chunk;
  });
}

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: 8,
  alignContent: "start",
  paddingBottom: 12,
};

const cardBaseStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 8,
  borderRadius: 8,
  background: "#ffffff",
  border: "1px solid var(--hostly-line)",
  color: "var(--hostly-ink)",
  boxShadow: "var(--hostly-shadow-hairline)",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 8,
  color: "var(--hostly-navy-deep)",
};

const headerTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--hostly-navy-mid)",
};

const headerCountStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 7px",
  borderRadius: 999,
  background: "var(--hostly-ice-100)",
  color: "var(--hostly-navy-deep)",
  border: "1px solid var(--hostly-line)",
};

const tableTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "var(--hostly-navy-deep)",
};

const badgeStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 999,
  letterSpacing: "0.03em",
};

function summaryChipStyle(level: PriorityLevel): CSSProperties {
  const base: CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 999,
    letterSpacing: "0.02em",
  };
  if (level === "critical") {
    return {
      ...base,
      background: "var(--hostly-danger-soft)",
      color: "#7f1d1d",
      border: "1px solid rgba(180, 70, 70, 0.22)",
    };
  }
  if (level === "attention") {
    return {
      ...base,
      background: "var(--hostly-warning-soft)",
      color: "var(--hostly-navy-deep)",
      border: "1px solid rgba(200, 120, 60, 0.22)",
    };
  }
  return {
    ...base,
    background: "var(--hostly-ice-100)",
    color: "var(--hostly-navy-mid)",
    border: "1px solid var(--hostly-line)",
  };
}

const lineRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 6,
  padding: "6px 8px",
  borderRadius: 8,
  background: "var(--hostly-ice-50)",
  border: "1px solid var(--hostly-line)",
};

const lineNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--hostly-navy-deep)",
  lineHeight: 1.2,
};

const lineMetaStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--hostly-ink-muted)",
  marginTop: 2,
};

const lineExtrasStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--hostly-accent)",
  lineHeight: 1.25,
  wordBreak: "break-word",
};

const lineNoteStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  fontStyle: "italic",
  color: "#9a5d16",
  lineHeight: 1.3,
  wordBreak: "break-word",
};

export default function SalaView() {
  const { restaurantId, ready: authReady, user } = useAuth();
  const { matchesOrder } = useOperationFilter();
  const [orders, setOrders] = useState<SalaOrder[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [busyItemIds, setBusyItemIds] = useState<Record<string, boolean>>({});
  const [completedTablesQueue, setCompletedTablesQueue] = useState<
    Array<{ key: string; label: string }>
  >([]);
  const prevReadyTableKeysRef = useRef<Set<string>>(new Set());
  const announcedReadyTableKeysRef = useRef<Set<string>>(new Set());

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
    }, (err) => {
      console.error(err);
      logFirestorePermissionError(
        {
          file: "components/kds/sala-view.tsx",
          op: "onSnapshot",
          path: `orders (where restaurantId==${restaurantId})`,
          restaurantId,
          uid: user?.uid ?? null,
          email: user?.email ?? null,
        },
        err,
      );
    });
    return () => unsub();
  }, [authReady, restaurantId, user]);

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
          ...(item.course != null && item.course >= 1 && item.course <= 4
            ? { course: item.course }
            : {}),
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
            isTableFullyServed: false,
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
      g.isTableFullyServed =
        g.lines.length > 0 &&
        g.lines.every((line) => salaLineItemStatus(line, orders) === "served");
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

  const tablesReadyToClose = useMemo(
    () =>
      computeTablesReadyToClose(orders, {
        matchesOrder: (order) => matchesOrder(order as SalaOrder),
      }),
    [orders, matchesOrder],
  );

  useEffect(() => {
    const detail = Array.from(tablesReadyToClose);
    window.dispatchEvent(
      new CustomEvent("tablesReadyToClose:update", { detail }),
    );
  }, [tablesReadyToClose]);

  useEffect(() => {
    const prevReady = prevReadyTableKeysRef.current;
    const nextReady = tablesReadyToClose;

    for (const tableKey of prevReady) {
      if (!nextReady.has(tableKey)) {
        announcedReadyTableKeysRef.current.delete(tableKey);
      }
    }

    for (const tableKey of nextReady) {
      if (prevReady.has(tableKey) || announcedReadyTableKeysRef.current.has(tableKey)) {
        continue;
      }
      announcedReadyTableKeysRef.current.add(tableKey);
      const order = orders.find(
        (o) => resolveTableReadyToCloseKey(o) === tableKey,
      );
      const label =
        order?.table?.trim() ||
        (order?.tableId ? `Mesa ${order.tableId}` : tableKey);
      setCompletedTablesQueue((queue) => [...queue, { key: tableKey, label }]);
    }

    prevReadyTableKeysRef.current = new Set(nextReady);
  }, [tablesReadyToClose, orders]);

  useEffect(() => {
    if (completedTablesQueue.length === 0) return;
    const timeout = window.setTimeout(() => {
      setCompletedTablesQueue((prev) => prev.slice(1));
    }, 2500);
    return () => window.clearTimeout(timeout);
  }, [completedTablesQueue]);

  const completedTableLabel = completedTablesQueue[0]?.label ?? "";
  const completedTableText = `${
    completedTableLabel.toLowerCase().includes("mesa")
      ? `${completedTableLabel} servida`
      : `Mesa ${completedTableLabel} servida`
  } · Lista para cerrar`;

  async function handleMarkServed(orderId: string, itemId: string) {
    if (!isFirebaseConfigured) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const key = `${orderId}:${itemId}`;
    if (busyItemIds[key]) return;
    setBusyItemIds((prev) => ({ ...prev, [key]: true }));
    const now = Date.now();
    const item = order.items.find((it) => it.id === itemId);
    const expectedStatus = item?.status ?? "prepared";
    try {
      const result = await transitionLineStatusViaApi({
        orderId,
        lineId: itemId,
        expectedStatus: String(expectedStatus),
        nextStatus: "served",
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
    } catch (e) {
      console.error("SalaView.handleMarkServed", e);
      logFirestorePermissionError(
        {
          file: "components/kds/sala-view.tsx",
          op: "updateDoc",
          path: `orders/${orderId}`,
          restaurantId,
          orderId,
          uid: user?.uid ?? null,
          email: user?.email ?? null,
        },
        e,
      );
    } finally {
      setBusyItemIds((prev) => {
        const cp = { ...prev };
        delete cp[key];
        return cp;
      });
    }
  }

  const totalLines = groups.reduce((acc, g) => acc + g.lines.length, 0);

  const now = nowMs;
  let readyCount = 0;
  let urgentCount = 0;
  let attentionCount = 0;
  let totalWait = 0;
  let waitCount = 0;
  let maxWait = 0;
  for (const g of groups) {
    for (const line of g.lines) {
      const preparedAt = line.preparedAtMs;
      if (typeof preparedAt === "number" && Number.isFinite(preparedAt)) {
        const elapsed = now - preparedAt;
        totalWait += elapsed;
        waitCount++;
        if (elapsed > maxWait) {
          maxWait = elapsed;
        }
        const min = elapsed / 60000;
        readyCount++;
        if (min >= 10) {
          urgentCount++;
        } else if (min >= 5) {
          attentionCount++;
        }
      }
    }
  }

  const avgWait = waitCount > 0 ? totalWait / waitCount : null;
  const stationMaxWaitMs = waitCount > 0 ? maxWait : null;
  const salaStationStatus = getSalaStationStatus(stationMaxWaitMs);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("kds:station-status", {
        detail: { station: "sala", status: salaStationStatus },
      }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("kds:station-status", {
          detail: { station: "sala", status: null },
        }),
      );
    };
  }, [salaStationStatus]);

  return (
    <div
      className="hostly-mobile-content min-h-0"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <header className="hostly-mobile-header md:hidden">
        <div className="hostly-mobile-header-row">
          <Link href="/dashboard/operacion" className="hostly-mobile-back" aria-label="Volver a Operación">
            <span className="text-lg font-bold leading-none" aria-hidden>
              ‹
            </span>
          </Link>
          <div className="hostly-mobile-title-block">
            <h1 className="hostly-mobile-title">Sala</h1>
            <p className="hostly-mobile-subtitle">Retirada de platos listos y tiempos de espera</p>
          </div>
        </div>
      </header>
      <p className="hostly-mobile-text-caption hostly-mobile-section hidden !py-0 md:!mb-0 md:!mt-0 md:!block">
        Sala · servicio de mesa
      </p>

      <ServiceMetricsBar scope="all" />
      {readyCount > 0 && (
        <section className="hostly-mobile-section !py-0">
          <div className="hostly-mobile-card--compact hostly-mobile-card flex flex-wrap items-center gap-2 !p-2">
            {salaStationStatus ? (
              <span
                className={`hostly-mobile-pill pointer-events-none !px-2 !py-0.5 !text-[10px] font-bold ${getSalaStationStatusClass(salaStationStatus)}`}
              >
                {salaStationStatus}
              </span>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              <span className="hostly-mobile-pill pointer-events-none !px-2 !py-0.5 !text-[10px] font-bold text-[var(--hostly-navy-deep)]">
                {readyCount} listos
              </span>
              {attentionCount > 0 ? (
                <span className="hostly-mobile-pill pointer-events-none !border-amber-200/80 !bg-amber-50 !px-2 !py-0.5 !text-[10px] font-bold text-amber-900">
                  {attentionCount} atención
                </span>
              ) : null}
              {urgentCount > 0 ? (
                <span className="hostly-mobile-pill pointer-events-none !border-red-200 !bg-red-50 !px-2 !py-0.5 !text-[10px] font-bold text-red-800">
                  {urgentCount} urgentes
                </span>
              ) : null}
            </div>
            {waitCount > 0 && avgWait != null ? (
              <span className={`text-[11px] font-semibold ${getSalaMetricsClass(maxWait)}`}>
                Media: {formatMin(avgWait)} · Máx: {formatMin(maxWait)}
              </span>
            ) : null}
          </div>
        </section>
      )}
      <SalaBoard
        orders={orders}
        groups={groups}
        totalLines={totalLines}
        priorityCounts={priorityCounts}
        nowMs={nowMs}
        busyItemIds={busyItemIds}
        onMarkServed={handleMarkServed}
      />
      {completedTablesQueue.length > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div
            className="hostly-mobile-card--compact hostly-button-primary cursor-pointer rounded-full !px-4 !py-2 !text-[13px] !shadow-md"
            onClick={() => {
              setCompletedTablesQueue((prev) => prev.slice(1));
            }}
          >
            {completedTableText}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SalaBoard({
  orders,
  groups,
  totalLines,
  priorityCounts,
  nowMs,
  busyItemIds,
  onMarkServed,
}: {
  orders: SalaOrder[];
  groups: SalaTableGroup[];
  totalLines: number;
  priorityCounts: { normal: number; attention: number; critical: number };
  nowMs: number;
  busyItemIds: Record<string, boolean>;
  onMarkServed: (orderId: string, itemId: string) => void;
}) {
  const sortedGroups = [...groups].sort((a, b) => {
    const aScore = getSalaGroupUrgencyScore(a.lines, nowMs);
    const bScore = getSalaGroupUrgencyScore(b.lines, nowMs);
    return bScore - aScore;
  });

  return (
    <>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {totalLines === 0 ? (
          <div className="hostly-mobile-empty-state hostly-mobile-card-soft flex min-h-[200px] flex-1 flex-col justify-center">
            <div className="hostly-mobile-empty-state__icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 9h14M5 9l1.5 9h11L19 9M9 9V7a3 3 0 016 0v2"
                  stroke="currentColor"
                  strokeWidth="1.65"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h3 className="hostly-mobile-empty-state__title">No hay comandas pendientes</h3>
            <p className="hostly-mobile-empty-state__desc">La cocina está al día.</p>
          </div>
        ) : (
          <>
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
        {sortedGroups.map((g) => {
          const isTableFullyServed = g.isTableFullyServed;
          const tone = priorityTone(g.priority);
          const mesaUrgencyScore = getSalaGroupUrgencyScore(g.lines, nowMs);
          const mesaUrgencyLabel = getUrgencyLabel(mesaUrgencyScore);
          const salaCardUrgencyClass =
            getSalaGroupCardUrgencyClassName(mesaUrgencyScore);
          const shouldShowMesaUrgencyLabel =
            !!mesaUrgencyLabel &&
            !(mesaUrgencyLabel === "Urgente" && g.priority === "critical");
          const mesaCardStyle: CSSProperties = {
            ...cardBaseStyle,
            boxShadow: tone.boxShadow ?? cardBaseStyle.boxShadow,
            ...(!salaCardUrgencyClass ? { border: tone.border } : {}),
          };
          if (salaCardUrgencyClass) {
            delete mesaCardStyle.background;
          }
          return (
            <div
              key={g.tableKey}
              className={`transition-all duration-300${
                salaCardUrgencyClass ? ` border ${salaCardUrgencyClass}` : ""
              }`.trim()}
              style={{
                ...mesaCardStyle,
                borderLeft: !salaCardUrgencyClass ? "3px solid var(--hostly-accent)" : undefined,
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
                  {shouldShowMesaUrgencyLabel ? (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        mesaUrgencyLabel === "Urgente"
                          ? "bg-red-100 text-red-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {mesaUrgencyLabel}
                    </span>
                  ) : null}
                  {g.priority === "critical" ? (
                    <span
                      style={{
                        ...badgeStyle,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontSize: 9,
                        background: "var(--hostly-danger-soft)",
                        color: "#7f1d1d",
                        border: "1px solid rgba(180, 70, 70, 0.25)",
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
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {groupSalaLinesByPase(g.lines).map((chunk, passIdx) => {
                  let oldestPrep: number | undefined;
                  for (const l of chunk) {
                    const ms = l.preparedAtMs;
                    if (ms == null || !Number.isFinite(ms)) continue;
                    if (oldestPrep === undefined || ms < oldestPrep) oldestPrep = ms;
                  }
                  const servedCount = chunk.filter(
                    (line) => salaLineItemStatus(line, orders) === "served",
                  ).length;
                  const totalCount = chunk.length;
                  const isPassFullyServed =
                    servedCount > 0 && servedCount === totalCount;
                  const passElapsedMs =
                    oldestPrep != null && Number.isFinite(oldestPrep)
                      ? nowMs - oldestPrep
                      : null;
                  const urgencyLabel = getSalaPassUrgencyLabel(
                    !isPassFullyServed ? passElapsedMs : null,
                  );
                  const passCourseLabel = getHomogeneousPassChunkTypeLabel(chunk);
                  const passCourseTitle =
                    passCourseLabel === "Mixto"
                      ? null
                      : chunk[0]?.course != null &&
                          chunk[0].course >= 1 &&
                          chunk[0].course <= 4
                        ? getMenuCourseLabel(chunk[0].course)
                        : null;
                  return (
                    <div
                      key={`${g.tableKey}-pase-${passIdx}`}
                      className={`rounded-lg border p-1.5 ${getSalaPassBgClass(
                        !isPassFullyServed ? passElapsedMs : null,
                      )}`}
                    >
                      <div
                        className={`mb-2 text-xs font-semibold ${getSalaPassHeaderTextClass(
                          !isPassFullyServed ? passElapsedMs : null,
                        )}`}
                      >
                        <span>
                          {passCourseTitle ? `${passCourseTitle} · ` : ""}
                          Pase {passIdx + 1} · Listo
                          {oldestPrep != null ? ` · ${formatSalaPrepClockHm(oldestPrep)}` : ""}
                          {` · ${chunk.length === 1 ? "1 línea" : `${chunk.length} líneas`}`}
                          {" · "}
                        </span>
                        {isPassFullyServed ? (
                          <>
                            Servido{" "}
                            <span className="ml-1 text-green-600">✓</span>
                          </>
                        ) : (
                          <span className="ml-1 text-orange-600">Pendiente</span>
                        )}
                        {!isPassFullyServed &&
                        passElapsedMs != null &&
                        Number.isFinite(passElapsedMs) &&
                        passElapsedMs >= 0 ? (
                          <span
                            className={`ml-2 text-xs ${salaPassPreparedWaitColorClass(passElapsedMs)}`}
                          >
                            · {formatSalaPassElapsedWaitLabel(passElapsedMs)}
                          </span>
                        ) : null}
                        {urgencyLabel ? (
                          <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold">
                            {urgencyLabel}
                          </span>
                        ) : null}
                      </div>
                      <div
                        style={{
                          height: 1,
                          width: "100%",
                          background: "var(--hostly-line)",
                          marginBottom: 6,
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {chunk.map((line) => {
                          const minutes =
                            line.preparedAtMs != null
                              ? Math.floor((nowMs - line.preparedAtMs) / 60000)
                              : 0;
                          let itemBorder = "1px solid var(--hostly-line)";
                          let itemBg = "var(--hostly-ice-50)";
                          if (minutes >= 10) {
                            itemBorder = "1px solid rgba(220, 80, 80, 0.35)";
                            itemBg = "var(--hostly-danger-soft)";
                          } else if (minutes >= 5) {
                            itemBorder = "1px solid rgba(200, 120, 60, 0.35)";
                            itemBg = "var(--hostly-warning-soft)";
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
                                  {line.course != null &&
                                  line.course >= 1 &&
                                  line.course <= 4 ? (
                                    <span className="ml-1.5 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                                      {getMenuCourseLabel(line.course)}
                                    </span>
                                  ) : null}
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
                                className="hostly-button-primary !min-h-8 shrink-0 self-center !px-3 !py-1.5 !text-[11px] disabled:opacity-60"
                                style={{ cursor: busy ? "progress" : "pointer" }}
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
        })}
      </div>
          </>
        )}
    </div>
    </>
  );
}
