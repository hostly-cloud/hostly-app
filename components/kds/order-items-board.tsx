"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Timestamp,
  GeoPoint,
  DocumentReference,
  type DocumentData,
  type UpdateData,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import { useOperationFilter } from "@/components/kds/operation-filter-context";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { dbgUpdateDoc } from "@/lib/firestore/instrumentedWrites";
import { logFirestorePermissionError } from "@/lib/firestore/log-firestore-permission-error";

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

/**
 * Elimina solo `undefined` en profundidad (objetos y arrays).
 * Conserva `null`, `false`, `0`; no usa JSON (preserva Timestamp / Date).
 */
function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "object") return value;
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return value;
  if (value instanceof GeoPoint) return value;
  if (value instanceof DocumentReference) return value;
  if (Array.isArray(value)) {
    return value
      .map((el) => stripUndefinedDeep(el))
      .filter((el) => el !== undefined);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const next = stripUndefinedDeep(v);
    if (next !== undefined) {
      out[k] = next;
    }
  }
  return out;
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
  /** Clave de agrupación por mesa/pedido; solo UI (no se envía a Firestore). */
  tableKey?: string;
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
  /** Cocina: agrupa columna Pendiente por ventanas de envío (~2s) usando sentAt. Barra puede usar solo UI. */
  groupSentPasses?: boolean;
  /** Si es false con `groupSentPasses`, solo agrupación visual sin “Preparar pase”. Cocina: omitir (por defecto preparación masiva activa). */
  enablePreparePassBulk?: boolean;
  /** Cabecera de tipo de pase agrupado (ej. Barra → “Bebidas”). Cocina: omitir para Entrantes/Segundos/Postres/Mixto. */
  passTypeLabelOverride?: string;
  /** Cocina: tickets en fila horizontal con scroll táctil por columna de estado. */
  ticketRailLayout?: boolean;
  /** Cocina: oculta la columna permanente “Servido”; usar panel/archivo controlado por `servedArchiveOpen`. */
  kitchenHideServedColumn?: boolean;
  /** Abierto el panel compacto de líneas servidas (solo presentación). */
  servedArchiveOpen?: boolean;
  /** Notifica total de líneas en estado servido (para chip en barra de métricas). */
  onServedLineCountChange?: (count: number) => void;
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

/** Etiqueta corta para chip “Mesa …” en KDS (sin `undefined`). */
function formatMesaChipLabel(
  src: Pick<BoardLine, "mesaRowText" | "tableKey">,
): string {
  const raw = (src.mesaRowText ?? "").trim();
  const fallbackKey = (src.tableKey ?? "").trim();

  const normalizeDisplay = (t: string): string => {
    const s = t.trim();
    if (!s || s === "Sin mesa") return "";
    const lower = s.toLowerCase();
    if (lower.startsWith("mesa")) return s;
    return `Mesa ${s}`;
  };

  const fromRaw = normalizeDisplay(raw);
  if (fromRaw) return fromRaw;

  const fromKey = normalizeDisplay(fallbackKey);
  if (fromKey) return fromKey;

  return "Sin mesa";
}

/** Texto producto + cantidad para histórico (usa `BoardLine.name` / `qty`). */
function displayLineProductLabel(line: Pick<BoardLine, "name" | "qty">): string {
  const raw = typeof line.name === "string" ? line.name.trim() : "";
  const label = raw || "Producto";
  const qtyOk =
    typeof line.qty === "number" && Number.isFinite(line.qty) && line.qty > 0;
  if (!qtyOk) return label;
  const q = Math.floor(line.qty as number);
  return `${q}x ${label}`;
}

/** Una mesa vs varias, para cabecera de pase agrupado por tiempo. */
function passChunkMesaSummary(chunk: BoardLine[]): string {
  if (chunk.length === 0) return "Sin mesa";
  const keys = new Set<string>();
  for (const l of chunk) {
    const k = (l.tableKey ?? "").trim();
    if (k) keys.add(k);
  }
  if (keys.size > 1) return "Varias mesas";
  if (keys.size === 1) {
    const onlyKey = [...keys][0]!;
    const lineSample =
      chunk.find((l) => (l.tableKey ?? "").trim() === onlyKey) ?? chunk[0]!;
    return formatMesaChipLabel(lineSample);
  }
  const labels = new Set(chunk.map((l) => formatMesaChipLabel(l)));
  if (labels.size > 1) return "Varias mesas";
  return [...labels][0] ?? "Sin mesa";
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

/** Copia profunda segura de una línea `orders.items[]` (preserva Timestamp, etc.). */
function cloneFirestoreOrderLineRecord(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(raw) as Record<string, unknown>;
    } catch {
      /* seguir */
    }
  }
  return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
}

function extractRawOrderItemsFromSnapshotField(
  itemsField: unknown,
): Record<string, unknown>[] {
  if (!Array.isArray(itemsField)) return [];
  const out: Record<string, unknown>[] = [];
  for (const x of itemsField) {
    if (!x || typeof x !== "object") continue;
    out.push(cloneFirestoreOrderLineRecord(x as Record<string, unknown>));
  }
  return out;
}

function readFirestoreLineQty(row: Record<string, unknown>): number {
  const q = Number(row.qty ?? row.quantity ?? 1);
  return Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
}

function applyKitchenStatusToSingleFirestoreLine(
  row: Record<string, unknown>,
  status: "prepared" | "served",
  now: number,
): Record<string, unknown> {
  const next = cloneFirestoreOrderLineRecord(row);
  next.status = status;
  next.updatedAt = now;
  if (status === "prepared") next.preparedAt = now;
  else next.servedAt = now;
  next.qty = readFirestoreLineQty(next);
  next.quantity = next.qty;
  return next;
}

function splitFirestoreLineForKitchenAdvance(
  row: Record<string, unknown>,
  newId: string,
  remainingQty: number,
  advancedQty: number,
  status: "prepared" | "served",
  now: number,
): { remainder: Record<string, unknown>; advanced: Record<string, unknown> } {
  const remainder = cloneFirestoreOrderLineRecord(row);
  remainder.qty = remainingQty;
  remainder.quantity = remainingQty;
  remainder.updatedAt = now;

  const advanced = cloneFirestoreOrderLineRecord(row);
  advanced.id = newId;
  advanced.qty = advancedQty;
  advanced.quantity = advancedQty;
  advanced.status = status;
  advanced.updatedAt = now;
  advanced.createdAt = now;
  if (status === "prepared") advanced.preparedAt = now;
  else advanced.servedAt = now;

  const origQty = readFirestoreLineQty(row);
  const lineTotal = Number(row.total);
  if (
    Number.isFinite(lineTotal) &&
    origQty > 0 &&
    remainingQty > 0 &&
    advancedQty > 0
  ) {
    remainder.total = (lineTotal * remainingQty) / origQty;
    advanced.total = (lineTotal * advancedQty) / origQty;
  }

  return { remainder, advanced };
}

/**
 * Replica la lógica de `handleMarkNext` pero sobre filas Firestore completas,
 * sin pasar por `BoardItem` (que pierde productId, precios y metadata).
 */
function applyKitchenMarkNextToRawItems(
  items: Record<string, unknown>[],
  itemId: string,
  next: "prepared" | "served",
  now: number,
): Record<string, unknown>[] | null {
  const idx = items.findIndex((r) => String(r.id ?? "") === itemId);
  if (idx === -1) return null;

  const nextItems = items.map((r) => cloneFirestoreOrderLineRecord(r));
  const row = nextItems[idx]!;
  const qty = readFirestoreLineQty(row);

  if (qty > 1) {
    const newId = `${itemId}-${now}-${Math.random().toString(16).slice(2)}`;
    const { remainder, advanced } = splitFirestoreLineForKitchenAdvance(
      row,
      newId,
      qty - 1,
      1,
      next,
      now,
    );
    nextItems[idx] = remainder;
    nextItems.splice(idx + 1, 0, advanced);
    return nextItems;
  }

  nextItems[idx] = applyKitchenStatusToSingleFirestoreLine(row, next, now);
  return nextItems;
}

function applyKitchenAdvancePreparedToRawItems(
  items: Record<string, unknown>[],
  itemId: string,
  now: number,
): Record<string, unknown>[] | null {
  return applyKitchenMarkNextToRawItems(items, itemId, "prepared", now);
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

/** Contenedor vertical métricas + rail en modo comandero (cocina). */
const ticketRailOuterBodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  paddingTop: 10,
};

/** Carril horizontal de tickets por estado (scroll táctil). */
const ticketRailStripStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "row",
  gap: 12,
  alignItems: "stretch",
  overflowX: "auto",
  overflowY: "hidden",
  paddingLeft: 10,
  paddingRight: 10,
  paddingBottom: 12,
  overscrollBehaviorX: "contain",
  scrollSnapType: "x proximity",
  touchAction: "pan-x",
  WebkitOverflowScrolling: "touch",
};

/** Una tarjeta-ticket dentro del rail: ancho estable + snap + scroll vertical interno. */
const ticketRailCardWrapStyle: CSSProperties = {
  flex: "0 0 auto",
  width: "clamp(260px, 82vw, 328px)",
  minWidth: "clamp(260px, 82vw, 328px)",
  maxHeight: "100%",
  overflowY: "auto",
  scrollSnapAlign: "start",
};

const ticketRailCardChromeStyle: CSSProperties = {
  border: "1px solid rgba(51, 65, 85, 0.65)",
  boxShadow: "4px 4px 0 rgba(15, 23, 42, 0.75)",
};

/** Ticket dentro del archivo servidos (menos contraste). */
const archiveTicketChromeStyle: CSSProperties = {
  border: "1px solid rgba(71, 85, 105, 0.45)",
  boxShadow: "2px 2px 0 rgba(15, 23, 42, 0.42)",
  opacity: 0.93,
};

const emptyColumnStyle: CSSProperties = {
  padding: "24px 12px",
  textAlign: "center",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 600,
};

/** Área vacía centrada bajo métricas en rail cocina. */
const ticketRailEmptyAreaStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 10px 16px",
};

/** Columna interna cuando no hay rail (lista vertical clásica). */
const ticketRailInnerLegacyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

/** Panel desplegable cocina: archivo de líneas servidas (solo UI). */
const kitchenServedArchivePanelStyle: CSSProperties = {
  flexShrink: 0,
  borderRadius: 12,
  border: "1px solid rgba(71, 85, 105, 0.42)",
  background:
    "linear-gradient(180deg, rgba(22, 36, 28, 0.55) 0%, rgba(15, 23, 42, 0.72) 100%)",
  maxHeight: "min(42vh, 380px)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 14px 36px -22px rgba(0, 0, 0, 0.55)",
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

/** Mesa destacada en KDS (legible a distancia). */
const mesaChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  padding: "6px 12px",
  borderRadius: 999,
  background: "#0f172a",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.04em",
  lineHeight: 1,
};

const mesaChipArchiveStyle: CSSProperties = {
  ...mesaChipStyle,
  padding: "5px 10px",
  fontSize: 12,
};

const archiveLineProductStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.3,
  letterSpacing: "-0.02em",
};

const archiveLineSecondaryRowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  lineHeight: 1.35,
};

const archiveServedRowSurfaceStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.38)",
  background: "rgba(248, 250, 252, 0.96)",
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
    const { tableLabel, tableKey, ...rest } = line;
    const bare: BoardLine = { ...rest, tableKey };
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

/** Ventana temporal (~2s) para agrupar líneas enviadas en el mismo “pase”. */
const PASS_BUCKET_MS = 2000;

/**
 * Agrupa ítems enviados (columna Pendiente) por `Math.floor(sentAtMs / PASS_BUCKET_MS)`.
 * Sin sentAt en ningún ítem → null (lista por secciones de curso como hasta ahora).
 */
function groupKitchenSentLinesByPase(lines: BoardLine[]): BoardLine[][] | null {
  if (lines.length === 0) return [];
  const withSentAt = lines.some((l) => l.sentAtMs != null);
  if (!withSentAt) return null;

  const byBucket = new Map<number, BoardLine[]>();
  for (const line of lines) {
    const ms = line.sentAtMs;
    const bucket =
      ms != null ? Math.floor(ms / PASS_BUCKET_MS) : Number.MAX_SAFE_INTEGER;
    const arr = byBucket.get(bucket) ?? [];
    arr.push(line);
    byBucket.set(bucket, arr);
  }
  const keys = Array.from(byBucket.keys()).sort((a, b) => a - b);
  return keys.map((k) => {
    const chunk = byBucket.get(k)!;
    chunk.sort((a, b) => {
      const ka = sortCourseKey(a.course);
      const kb = sortCourseKey(b.course);
      if (ka !== kb) return ka - kb;
      return (a.sentAtMs ?? 0) - (b.sentAtMs ?? 0);
    });
    return chunk;
  });
}

function oldestSentAtMsInChunk(chunk: BoardLine[]): number | undefined {
  let min: number | undefined;
  for (const line of chunk) {
    const ms = line.sentAtMs;
    if (ms == null || !Number.isFinite(ms)) continue;
    if (min === undefined || ms < min) min = ms;
  }
  return min;
}

/** Orden visual de mesas: 2 = ≥10 min, 1 = ≥5 min, 0 = resto (según sent/prep). */
function getGroupUrgencyScore(lines: BoardLine[], nowMs: number): number {
  let maxScore = 0;
  for (const line of lines) {
    const t = line.sentAtMs ?? line.preparedAtMs;
    if (typeof t === "number" && Number.isFinite(t)) {
      const min = (nowMs - t) / 60000;
      if (min >= 10) {
        maxScore = Math.max(maxScore, 2);
      } else if (min >= 5) {
        maxScore = Math.max(maxScore, 1);
      }
    }
  }
  return maxScore;
}

function getUrgencyLabel(score: number): string | null {
  if (score >= 2) return "Urgente";
  if (score >= 1) return "Atención";
  return null;
}

function getGroupCardUrgencyClassName(score: number): string {
  if (score >= 2) return "border-red-200 bg-red-50";
  if (score >= 1) return "border-orange-200 bg-orange-50";
  return "";
}

const formatMin = (ms: number) => {
  return `${Math.floor(ms / 60000)} min`;
};

const formatClock = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
};

const getKdsMetricsClass = (maxTime: number | null) => {
  if (maxTime == null) return "text-gray-500";
  const min = maxTime / 60000;
  if (min >= 10) return "text-red-600 font-semibold animate-pulse";
  if (min >= 5) return "text-orange-600";
  return "text-gray-500";
};

const getStationStatus = (maxTime: number | null) => {
  if (maxTime == null) return null;
  const min = maxTime / 60000;
  if (min >= 10) return "Lento";
  if (min >= 5) return "Atención";
  return "En ritmo";
};

const getStationStatusClass = (status: string | null) => {
  if (status === "Lento") return "bg-red-100 text-red-700";
  if (status === "Atención") return "bg-orange-100 text-orange-700";
  if (status === "En ritmo") return "bg-green-100 text-green-700";
  return "";
};

/** Hora local HH:mm para cabecera de pase (solo UI). */
function formatPassSentClockHm(sentAtMs: number): string {
  const d = new Date(sentAtMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatPassElapsedMinutesFromMs(ms: number): string {
  const min = Math.floor(ms / 60000);
  return `${min} min`;
}

function passElapsedUrgencyTextClassFromMs(elapsedMs: number): string {
  const min = elapsedMs / 60000;
  if (min >= 10) return "text-red-600";
  if (min >= 5) return "text-orange-600";
  return "text-gray-500";
}

/** Etiqueta de tipo de pase según cursos homogéneos del chunk (solo cocina / UI). */
function kitchenPassChunkTypeLabel(chunk: BoardLine[]): string {
  if (chunk.length === 0) return "Mixto";
  if (chunk.every((l) => l.course === 1)) return "Entrantes";
  if (chunk.every((l) => l.course === 2 || l.course === 3)) return "Segundos";
  if (chunk.every((l) => l.course === 4)) return "Postres";
  return "Mixto";
}

function getPassChunkClassName(label: string): string {
  if (label === "Bebidas") return "rounded-xl border border-blue-200 bg-blue-50 p-2";
  if (label === "Entrantes")
    return "rounded-xl border border-emerald-200 bg-emerald-50 p-2";
  if (label === "Segundos") return "rounded-xl border border-orange-200 bg-orange-50 p-2";
  if (label === "Postres") return "rounded-xl border border-purple-200 bg-purple-50 p-2";
  return "rounded-xl border border-gray-200 bg-gray-50 p-2";
}

function getPassHeaderTextClassName(label: string): string {
  if (label === "Bebidas") return "text-xs font-semibold text-blue-700";
  if (label === "Entrantes") return "text-xs font-semibold text-emerald-700";
  if (label === "Segundos") return "text-xs font-semibold text-orange-700";
  if (label === "Postres") return "text-xs font-semibold text-purple-700";
  return "text-xs font-semibold text-gray-500";
}

export default function OrderItemsBoard({
  itemFilter,
  emptyMessage,
  sentAction,
  preparedAction,
  groupSentPasses = false,
  enablePreparePassBulk,
  passTypeLabelOverride,
  ticketRailLayout = false,
  kitchenHideServedColumn = false,
  servedArchiveOpen = false,
  onServedLineCountChange,
}: OrderItemsBoardProps) {
  const { restaurantId, ready: authReady, user } = useAuth();
  const { matchesOrder } = useOperationFilter();
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const ordersRef = useRef<BoardOrder[]>([]);
  ordersRef.current = orders;
  /** Copia íntegra de `orders.items` por pedido (misma fuente que el snapshot; no pasa por `BoardItem`). */
  const orderFirestoreItemsRef = useRef<
    Record<string, Record<string, unknown>[]>
  >({});
  const completedPrepTimesRef = useRef<number[]>([]);
  const lastPreparedRef = useRef<{ name: string; time: number }[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [busyItemIds, setBusyItemIds] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [boardFeedbackMessage, setBoardFeedbackMessage] = useState<string | null>(null);
  const [busyPassKey, setBusyPassKey] = useState<string | null>(null);
  const [resetFeedback, setResetFeedback] = useState(false);
  const [recentClearedFeedback, setRecentClearedFeedback] = useState(false);

  const showBoardFeedback = (message: string) => {
    setBoardFeedbackMessage(message);
    setTimeout(() => {
      setBoardFeedbackMessage(null);
    }, 1500);
  };

  const showPreparePassBulk =
    groupSentPasses && enablePreparePassBulk !== false;

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) return;
    const q = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const rawByOrderId: Record<string, Record<string, unknown>[]> = {};
      const next: BoardOrder[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        rawByOrderId[d.id] = extractRawOrderItemsFromSnapshotField(
          data.items,
        );
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
      orderFirestoreItemsRef.current = rawByOrderId;
      setOrders(next);
    }, (err) => {
      console.error(err);
      logFirestorePermissionError(
        {
          file: "components/kds/order-items-board.tsx",
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

  const servedLineCount = useMemo(
    () => columns.served.reduce((acc, g) => acc + g.lines.length, 0),
    [columns.served],
  );

  useEffect(() => {
    onServedLineCountChange?.(servedLineCount);
  }, [servedLineCount, onServedLineCountChange]);

  async function handleMarkNext(
    orderId: string,
    itemId: string,
    next: "prepared" | "served",
  ) {
    if (!isFirebaseConfigured) return;
    const order = ordersRef.current.find((o) => o.id === orderId);
    if (!order) {
      return;
    }
    const key = `${orderId}:${itemId}`;
    if (busyItemIds[key]) return;
    setBusyItemIds((prev) => ({ ...prev, [key]: true }));
    const now = Date.now();
    const baseline = (
      orderFirestoreItemsRef.current[orderId] ?? []
    ).map(cloneFirestoreOrderLineRecord);
    const rawNext = applyKitchenMarkNextToRawItems(
      baseline,
      itemId,
      next,
      now,
    );
    try {
      if (!rawNext) {
        setActionError("No se pudo actualizar el pedido. Inténtalo otra vez.");
        setTimeout(() => setActionError(null), 3000);
        return;
      }
      const sanitizedItems = rawNext.map((row) => stripUndefinedDeep(row));

      await dbgUpdateDoc(
        doc(db, "orders", orderId),
        cleanFirestoreData({
          items: sanitizedItems,
          updatedAt: serverTimestamp(),
        }) as UpdateData<DocumentData>,
        {
          label: "order-items-board:handleMarkNext",
          collection: "orders",
          restaurantId,
          orderId,
          tableId: order.tableId ?? null,
        },
      );
      if (next === "prepared") {
        const item = order.items.find((i) => i.id === itemId);
        if (item) {
          const sentAtMs = readMs(item.sentAt);
          if (typeof sentAtMs === "number" && Number.isFinite(sentAtMs)) {
            completedPrepTimesRef.current.push(now - sentAtMs);
          }
          const itemName = item?.name || "Item";
          lastPreparedRef.current.unshift({
            name: itemName.trim() || "Item",
            time: now,
          });
          if (lastPreparedRef.current.length > 5) {
            lastPreparedRef.current.pop();
          }
        }
      }
      setActionSuccess("Pedido actualizado");
      setTimeout(() => setActionSuccess(null), 1500);
    } catch (e) {
      console.error("OrderItemsBoard.handleMarkNext", e);
      logFirestorePermissionError(
        {
          file: "components/kds/order-items-board.tsx",
          op: "updateDoc",
          path: `orders/${orderId}`,
          restaurantId,
          orderId,
          uid: user?.uid ?? null,
          email: user?.email ?? null,
        },
        e,
      );
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

  async function handlePreparePassChunk(
    lines: BoardLine[],
    passKey: string,
    message: string,
  ) {
    if (busyPassKey) return;
    const targets = lines.filter((l) => l.status === "sent");
    if (targets.length === 0) return;

    const busyKeys = targets.map((t) => `${t.orderId}:${t.itemId}`);
    setBusyItemIds((prev) => {
      const next = { ...prev };
      for (const k of busyKeys) next[k] = true;
      return next;
    });
    setBusyPassKey(passKey);

    let updateFailed = false;

    try {
      const byOrder = new Map<string, BoardLine[]>();
      for (const t of targets) {
        const arr = byOrder.get(t.orderId) ?? [];
        arr.push(t);
        byOrder.set(t.orderId, arr);
      }

      for (const [orderId, orderTargets] of byOrder) {
        const order = ordersRef.current.find((o) => o.id === orderId);
        if (!order) {
          updateFailed = true;
          continue;
        }

        const now = Date.now();
        const baseline = (
          orderFirestoreItemsRef.current[orderId] ?? []
        ).map(cloneFirestoreOrderLineRecord);
        let rawWorking = baseline;
        let orderBuildOk = true;
        for (const line of orderTargets) {
          const advanced = applyKitchenAdvancePreparedToRawItems(
            rawWorking,
            line.itemId,
            now,
          );
          if (advanced == null) {
            orderBuildOk = false;
            updateFailed = true;
            break;
          }
          rawWorking = advanced;
        }
        if (!orderBuildOk) continue;

        try {
          const sanitizedItems = rawWorking.map((row) => stripUndefinedDeep(row));
          await dbgUpdateDoc(
            doc(db, "orders", orderId),
            cleanFirestoreData({
              items: sanitizedItems,
              updatedAt: serverTimestamp(),
            }) as UpdateData<DocumentData>,
            {
              label: "order-items-board:handlePreparePassChunk",
              collection: "orders",
              restaurantId,
              orderId,
              tableId: order.tableId ?? null,
            },
          );
          for (const line of orderTargets) {
            const item = order.items.find((i) => i.id === line.itemId);
            if (!item) continue;
            const sentAtMs = readMs(item.sentAt);
            if (typeof sentAtMs === "number" && Number.isFinite(sentAtMs)) {
              completedPrepTimesRef.current.push(now - sentAtMs);
            }
            const itemName = item.name || "Item";
            lastPreparedRef.current.unshift({
              name: itemName.trim() || "Item",
              time: now,
            });
            if (lastPreparedRef.current.length > 5) {
              lastPreparedRef.current.pop();
            }
          }
        } catch (e) {
          updateFailed = true;
          console.error("OrderItemsBoard.handlePreparePassChunk", e);
          logFirestorePermissionError(
            {
              file: "components/kds/order-items-board.tsx",
              op: "updateDoc",
              path: `orders/${orderId}`,
              restaurantId,
              orderId,
              uid: user?.uid ?? null,
              email: user?.email ?? null,
            },
            e,
          );
        }
      }

      if (!updateFailed) {
        showBoardFeedback(message);
        setActionSuccess("Pedido actualizado");
        setTimeout(() => setActionSuccess(null), 1500);
      } else {
        setActionError("No se pudo actualizar el pedido. Inténtalo otra vez.");
        setTimeout(() => setActionError(null), 3000);
      }
    } finally {
      setBusyPassKey(null);
      setBusyItemIds((prev) => {
        const next = { ...prev };
        for (const k of busyKeys) delete next[k];
        return next;
      });
    }
  }

  const completedAvg =
    completedPrepTimesRef.current.length > 0
      ? completedPrepTimesRef.current.reduce((a, b) => a + b, 0) /
        completedPrepTimesRef.current.length
      : null;

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
      {kitchenHideServedColumn && servedArchiveOpen ? (
        <div
          style={kitchenServedArchivePanelStyle}
          className="ring-1 ring-emerald-500/15"
          role="region"
          aria-label="Histórico de líneas servidas"
          id="kds-served-archive-panel"
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              padding: "10px 12px 12px",
            }}
          >
            <BoardColumn
              title="Servido"
              count={servedLineCount}
              groups={columns.served}
              nowMs={nowMs}
              showUrgency={false}
              ticketRailLayout={ticketRailLayout}
              railAccent="#475569"
              compactArchiveColumn
              archiveMuted
              servedHistoryPresentation
              action={null}
              busyItemIds={busyItemIds}
              onMark={handleMarkNext}
              sentPassesGrouping={false}
            />
          </div>
        </div>
      ) : null}
      <div
        className={
          ticketRailLayout && kitchenHideServedColumn
            ? "flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
            : ticketRailLayout
              ? "flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-3"
              : undefined
        }
        style={
          ticketRailLayout
            ? { flex: 1, minHeight: 0, minWidth: 0 }
            : kitchenHideServedColumn
              ? { ...boardStyle, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }
              : boardStyle
        }
      >
        <BoardColumn
          title="Pendiente"
          count={columns.sent.reduce((a, g) => a + g.lines.length, 0)}
          groups={columns.sent}
          nowMs={nowMs}
          showUrgency
          ticketRailLayout={ticketRailLayout}
          railVerticalBand={
            ticketRailLayout && kitchenHideServedColumn ? "main" : undefined
          }
          railAccent="#38bdf8"
          showPendingColumnMetrics
          action={sentAction}
          busyItemIds={busyItemIds}
          onMark={handleMarkNext}
          sentPassesGrouping={groupSentPasses}
          onPreparePassChunk={
            showPreparePassBulk ? handlePreparePassChunk : undefined
          }
          busyPassKey={showPreparePassBulk ? busyPassKey : null}
          passTypeLabelOverride={passTypeLabelOverride}
          completedSessionPrepAvgMs={completedAvg}
          onResetSessionPrepAvg={() => {
            completedPrepTimesRef.current = [];
          }}
          onAfterSessionPrepReset={() => {
            setResetFeedback(true);
            setTimeout(() => setResetFeedback(false), 1500);
          }}
          sessionPrepResetFeedback={resetFeedback}
          recentPreparedEntries={lastPreparedRef.current.slice()}
          onClearRecentPrepared={() => {
            lastPreparedRef.current = [];
            setRecentClearedFeedback(true);
            setTimeout(() => setRecentClearedFeedback(false), 1500);
          }}
          recentPreparedClearedFeedback={recentClearedFeedback}
        />
        <BoardColumn
          title="Listo"
          count={columns.prepared.reduce((a, g) => a + g.lines.length, 0)}
          groups={columns.prepared}
          nowMs={nowMs}
          showUrgency
          ticketRailLayout={ticketRailLayout}
          railVerticalBand={
            ticketRailLayout && kitchenHideServedColumn ? "compact" : undefined
          }
          railAccent="#fbbf24"
          action={preparedAction}
          busyItemIds={busyItemIds}
          onMark={handleMarkNext}
          sentPassesGrouping={false}
        />
        {!kitchenHideServedColumn ? (
          <BoardColumn
            title="Servido"
            count={columns.served.reduce((a, g) => a + g.lines.length, 0)}
            groups={columns.served}
            nowMs={nowMs}
            showUrgency={false}
            ticketRailLayout={ticketRailLayout}
            railAccent="#64748b"
            action={null}
            busyItemIds={busyItemIds}
            onMark={handleMarkNext}
            sentPassesGrouping={false}
          />
        ) : null}
      </div>
      {boardFeedbackMessage && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-full bg-green-600 px-4 py-2 text-sm text-white shadow">
            {boardFeedbackMessage}
          </div>
        </div>
      )}
    </>
  );
}

function BoardLineRow({
  line,
  nowMs,
  showUrgency,
  action,
  busyItemIds,
  onMark,
  servedArchiveLayout = false,
}: {
  line: BoardLine;
  nowMs: number;
  showUrgency: boolean;
  action: BoardColumnAction | null;
  busyItemIds: Record<string, boolean>;
  onMark: (
    orderId: string,
    itemId: string,
    next: "prepared" | "served",
  ) => void;
  /** Histórico servidos en panel: mesa → producto → curso → tiempo servido. */
  servedArchiveLayout?: boolean;
}) {
  const minutes =
    line.sentAtMs != null ? Math.floor((nowMs - line.sentAtMs) / 60000) : 0;
  const busy = busyItemIds[`${line.orderId}:${line.itemId}`];
  const isServeAction = action?.nextStatus === "served";
  const servedMarkStyles: CSSProperties = isServeAction
    ? {
        color: "#14532d",
        background: "rgba(34, 197, 94, 0.35)",
        border: "1px solid rgba(22, 101, 52, 0.55)",
        fontSize: 11,
      }
    : {};
  const markLabel = isServeAction ? "Servir" : (action?.label ?? "");

  const archiveProductRow =
    servedArchiveLayout && line.status === "served";

  if (archiveProductRow) {
    const coursePart =
      line.course >= 1 && line.course <= 4 ? getCourseLabel(line.course) : "";
    const servedPhrase =
      line.servedAtMs != null
        ? `Servido hace ${formatMinutes(
            (nowMs - line.servedAtMs) / 60000,
          )}`
        : "Servido";
    const secondaryText = [coursePart, servedPhrase].filter(Boolean).join(" · ");
    return (
      <div
        style={{
          ...lineRowStyle,
          ...archiveServedRowSurfaceStyle,
          padding: "10px 12px",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 8,
            }}
          >
            <span style={mesaChipArchiveStyle}>
              {formatMesaChipLabel(line)}
            </span>
            <span style={archiveLineProductStyle}>
              {displayLineProductLabel(line)}
            </span>
            <div style={archiveLineSecondaryRowStyle}>{secondaryText}</div>
          </div>
          {line.extras && line.extras.length > 0 ? (
            <div
              style={{
                ...lineExtrasJoinedStyle,
                marginTop: 6,
                fontSize: 11,
                opacity: 0.92,
              }}
            >
              {line.extras.map((e) => `+ ${e.name}`).join(" · ")}
            </div>
          ) : null}
          {line.removedIngredients && line.removedIngredients.length > 0 ? (
            <div style={{ ...lineRemovedStyle, marginTop: 4, fontSize: 11 }}>
              Sin: {line.removedIngredients.join(" · ")}
            </div>
          ) : null}
          {line.note ? (
            <div style={{ ...lineNoteStyle, marginTop: 4, fontSize: 11 }}>
              Nota: {line.note}
            </div>
          ) : null}
        </div>
        {action ? (
          <button
            type="button"
            disabled={busy}
            style={{
              ...markButtonStyle,
              ...servedMarkStyles,
              alignSelf: "center",
              flexShrink: 0,
              opacity: busy ? 0.6 : 1,
              cursor: busy ? "progress" : "pointer",
            }}
            onClick={() =>
              onMark(line.orderId, line.itemId, action.nextStatus)
            }
          >
            {busy ? (action.busyLabel ?? "Guardando…") : markLabel}
          </button>
        ) : null}
      </div>
    );
  }

  let itemBorder = "1px solid #e5e7eb"; // gray-200
  let itemBg = "#ffffff";
  if (minutes >= 10) {
    itemBorder = "1px solid #ef4444";
    itemBg = "#fef2f2";
  } else if (minutes >= 5) {
    itemBorder = "1px solid #fb923c";
    itemBg = "#fff7ed";
  }
  return (
    <div
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
            gap: 6,
          }}
        >
          <span style={mesaChipStyle}>{formatMesaChipLabel(line)}</span>
          {line.course >= 1 && line.course <= 4 ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#64748b",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {getCourseLabel(line.course)}
            </span>
          ) : null}
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
        {line.removedIngredients && line.removedIngredients.length > 0 ? (
          <div style={lineRemovedStyle}>
            Sin: {line.removedIngredients.join(" · ")}
          </div>
        ) : null}
        {line.note ? <div style={lineNoteStyle}>Nota: {line.note}</div> : null}
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
              : line.status === "served" && line.servedAtMs != null
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
            ...servedMarkStyles,
            alignSelf: "center",
            flexShrink: 0,
            opacity: busy ? 0.6 : 1,
            cursor: busy ? "progress" : "pointer",
          }}
          onClick={() =>
            onMark(line.orderId, line.itemId, action.nextStatus)
          }
        >
          {busy ? (action.busyLabel ?? "Guardando…") : markLabel}
        </button>
      ) : null}
    </div>
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
  sentPassesGrouping,
  onPreparePassChunk,
  busyPassKey = null,
  passTypeLabelOverride,
  showPendingColumnMetrics = false,
  completedSessionPrepAvgMs = null,
  onResetSessionPrepAvg,
  onAfterSessionPrepReset,
  sessionPrepResetFeedback = false,
  recentPreparedEntries = [],
  onClearRecentPrepared,
  recentPreparedClearedFeedback = false,
  ticketRailLayout = false,
  railAccent,
  archiveMuted = false,
  compactArchiveColumn = false,
  servedHistoryPresentation = false,
  railVerticalBand,
}: {
  title: string;
  count: number;
  groups: BoardTableGroup[];
  nowMs: number;
  showUrgency: boolean;
  /** Cocina: carril horizontal de tickets por columna. */
  ticketRailLayout?: boolean;
  /** Borde de acento izquierdo en modo rail (solo UI). */
  railAccent?: string;
  /** Vistas archivo/histórico (servidos en panel). */
  archiveMuted?: boolean;
  /** Ocupa alto disponible dentro del panel archivo (flex). */
  compactArchiveColumn?: boolean;
  /** Panel histórico servidos: sin cabecera de columna duplicada y líneas con énfasis en producto. */
  servedHistoryPresentation?: boolean;
  /** Cocina vertical: franja superior (Pendiente) vs inferior más compacta (Listo). */
  railVerticalBand?: "main" | "compact";
  /** Cocina/Barra: chips de métricas sobre la columna enviados pendientes. */
  showPendingColumnMetrics?: boolean;
  /** Media de tiempo sent→prepared en esta sesión (solo memoria cliente). */
  completedSessionPrepAvgMs?: number | null;
  /** Limpia el histórico en memoria de la media de sesión (sin estado). */
  onResetSessionPrepAvg?: () => void;
  /** Tras reset confirmado; activa mensaje breve en el padre. */
  onAfterSessionPrepReset?: () => void;
  /** Muestra “Media reiniciada” tras reset. */
  sessionPrepResetFeedback?: boolean;
  /** Últimos ítems marcados preparados en sesión (solo UI). */
  recentPreparedEntries?: { name: string; time: number }[];
  /** Vacía la lista de últimos preparados en memoria (no toca la media de sesión). */
  onClearRecentPrepared?: () => void;
  /** Tras limpiar el historial de preparados recientes (solo UI). */
  recentPreparedClearedFeedback?: boolean;
  action: BoardColumnAction | null;
  busyItemIds: Record<string, boolean>;
  onMark: (
    orderId: string,
    itemId: string,
    next: "prepared" | "served",
  ) => void;
  sentPassesGrouping?: boolean;
  /** Cocina: marca todo el chunk como preparado vía la misma acción que una línea. */
  onPreparePassChunk?: (
    lines: BoardLine[],
    passKey: string,
    message: string,
  ) => void | Promise<void>;
  busyPassKey?: string | null;
  passTypeLabelOverride?: string;
}) {
  const prepareLabel =
    passTypeLabelOverride === "Bebidas"
      ? "Preparar bebidas"
      : "Preparar pase";

  const prepareFeedbackMessage =
    passTypeLabelOverride === "Bebidas"
      ? "Bebidas preparadas"
      : "Pase preparado";

  const pendingLabel =
    passTypeLabelOverride === "Bebidas"
      ? "bebidas pendientes"
      : "pendientes";

  const completedAvgLabel =
    passTypeLabelOverride === "Bebidas"
      ? "Bebidas media sesión"
      : "Prep media sesión";

  const recentPreparedTitle =
    passTypeLabelOverride === "Bebidas"
      ? "Últimas bebidas preparadas"
      : "Últimos preparados";

  const now = nowMs;
  let pendingCount = 0;
  let attentionCount = 0;
  let urgentCount = 0;
  let totalTime = 0;
  let prepTimeCount = 0;
  let maxTime = 0;
  if (showPendingColumnMetrics) {
    for (const g of groups) {
      for (const line of g.lines) {
        if (line.status === "sent") {
          pendingCount++;
          const sentAt = line.sentAtMs;
          if (typeof sentAt === "number" && Number.isFinite(sentAt)) {
            const elapsed = now - sentAt;
            totalTime += elapsed;
            prepTimeCount++;
            if (elapsed > maxTime) {
              maxTime = elapsed;
            }
            const min = elapsed / 60000;
            if (min >= 10) {
              urgentCount++;
            } else if (min >= 5) {
              attentionCount++;
            }
          }
        }
      }
    }
  }

  const avgTime = prepTimeCount > 0 ? totalTime / prepTimeCount : null;

  const stationMaxTimeMs = prepTimeCount > 0 ? maxTime : null;
  const stationStatus = getStationStatus(stationMaxTimeMs);

  const stationStatusLabel =
    stationStatus == null
      ? null
      : passTypeLabelOverride === "Bebidas"
        ? stationStatus === "En ritmo"
          ? "Barra en ritmo"
          : stationStatus === "Atención"
            ? "Barra atención"
            : "Barra lenta"
        : stationStatus;

  useEffect(() => {
    if (!showPendingColumnMetrics) return;
    const station = passTypeLabelOverride === "Bebidas" ? "barra" : "cocina";
    window.dispatchEvent(
      new CustomEvent("kds:station-status", {
        detail: {
          station,
          status: stationStatus,
        },
      }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("kds:station-status", {
          detail: { station, status: null },
        }),
      );
    };
  }, [stationStatus, showPendingColumnMetrics, passTypeLabelOverride]);

  const sortedGroups = [...groups].sort((a, b) => {
    const aScore = getGroupUrgencyScore(a.lines, nowMs);
    const bScore = getGroupUrgencyScore(b.lines, nowMs);
    return bScore - aScore;
  });

  const resolvedColumnStyle: CSSProperties = {
    ...columnStyle,
    ...(compactArchiveColumn
      ? { flex: 1, minHeight: 0, maxHeight: "100%", minWidth: 0 }
      : {}),
    ...(ticketRailLayout && railAccent
      ? { borderLeft: `4px solid ${railAccent}` }
      : {}),
    ...(archiveMuted
      ? {
          background: "rgba(15, 23, 42, 0.42)",
          borderColor: "rgba(71, 85, 105, 0.38)",
        }
      : {}),
  };
  let resolvedTitleStyle: CSSProperties = ticketRailLayout
    ? { ...columnTitleStyle, fontSize: 13, letterSpacing: "0.1em" }
    : columnTitleStyle;
  if (ticketRailLayout && railVerticalBand === "main") {
    resolvedTitleStyle = {
      ...resolvedTitleStyle,
      fontSize: 14,
      letterSpacing: "0.11em",
    };
  }
  if (archiveMuted) {
    resolvedTitleStyle = {
      ...resolvedTitleStyle,
      color: "#86efac",
      opacity: 0.84,
      fontSize: ticketRailLayout ? 12 : (resolvedTitleStyle.fontSize ?? 12),
    };
  }
  let resolvedHeaderStyle: CSSProperties = ticketRailLayout
    ? { ...columnHeaderStyle, paddingTop: 12, paddingBottom: 12 }
    : columnHeaderStyle;
  if (archiveMuted) {
    resolvedHeaderStyle = {
      ...resolvedHeaderStyle,
      borderBottom: "1px solid rgba(71, 85, 105, 0.35)",
      background: "rgba(21, 32, 28, 0.42)",
    };
  }
  if (ticketRailLayout && railVerticalBand === "compact") {
    resolvedHeaderStyle = {
      ...resolvedHeaderStyle,
      paddingTop: 10,
      paddingBottom: 10,
    };
  }
  const columnBodyMerged: CSSProperties = ticketRailLayout
    ? {
        ...columnBodyStyle,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: railVerticalBand === "compact" ? 8 : 10,
        paddingLeft: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingTop: servedHistoryPresentation ? 6 : railVerticalBand === "compact" ? 8 : 10,
      }
    : columnBodyStyle;
  const ticketRailInnerStyle: CSSProperties = ticketRailLayout
    ? groups.length === 0
      ? ticketRailEmptyAreaStyle
      : ticketRailStripStyle
    : ticketRailInnerLegacyStyle;

  return (
    <div
      style={resolvedColumnStyle}
      className={
        ticketRailLayout
          ? compactArchiveColumn
            ? "flex w-full min-w-0 flex-1 lg:min-h-0 min-h-0 max-h-full flex-col"
            : railVerticalBand === "main"
              ? "flex w-full min-w-0 flex-[2_1_0] basis-0 flex-col min-h-[240px] sm:min-h-[260px]"
              : railVerticalBand === "compact"
                ? "flex w-full min-w-0 flex-[1_1_0] basis-0 flex-col min-h-[200px] border-t border-white/10 pt-0.5 sm:min-h-[220px]"
                : "flex w-full min-w-0 flex-1 lg:min-h-0 min-h-[260px] flex-col"
          : compactArchiveColumn
            ? "flex min-h-0 flex-1 flex-col min-w-0"
            : undefined
      }
    >
      {!servedHistoryPresentation ? (
      <div style={resolvedHeaderStyle}>
        <h3 style={resolvedTitleStyle}>{title}</h3>
        <span style={columnCountStyle}>{count}</span>
      </div>
      ) : null}
      <div style={columnBodyMerged}>
        {showPendingColumnMetrics &&
        (pendingCount > 0 ||
          completedSessionPrepAvgMs != null ||
          sessionPrepResetFeedback ||
          recentPreparedEntries.length > 0 ||
          recentPreparedClearedFeedback) ? (
          <div
            className={ticketRailLayout ? "mb-2 px-2.5" : "mb-3"}
          >
            {stationStatus ? (
              <div
                className={`mb-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${getStationStatusClass(stationStatus)}`}
              >
                {stationStatusLabel}
              </div>
            ) : null}
            {pendingCount > 0 ? (
              <>
                <div className="flex gap-2">
                  <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
                    {pendingCount} {pendingLabel}
                  </div>
                  {attentionCount > 0 ? (
                    <div className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700">
                      {attentionCount} atención
                    </div>
                  ) : null}
                  {urgentCount > 0 ? (
                    <div className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                      {urgentCount} urgentes
                    </div>
                  ) : null}
                </div>
                {prepTimeCount > 0 && avgTime != null ? (
                  <div className={`text-xs ${getKdsMetricsClass(maxTime)}`}>
                    Media: {formatMin(avgTime)} · Máx: {formatMin(maxTime)}
                  </div>
                ) : null}
              </>
            ) : null}
            {completedSessionPrepAvgMs != null ? (
              <div className="text-xs text-blue-600">
                {completedAvgLabel}: {formatMin(completedSessionPrepAvgMs)}
                <button
                  type="button"
                  className="ml-2 text-xs text-gray-400 hover:text-gray-600"
                  onClick={(event) => {
                    event.stopPropagation();

                    const ok = window.confirm("¿Resetear media de sesión?");
                    if (!ok) return;

                    onResetSessionPrepAvg?.();
                    onAfterSessionPrepReset?.();
                  }}
                >
                  reset
                </button>
              </div>
            ) : null}
            {recentPreparedEntries.length > 0 ? (
              <div className="mt-2 text-xs text-gray-500">
                <div className="mb-1 flex flex-wrap items-center">
                  <span className="font-medium">{recentPreparedTitle}</span>
                  <button
                    type="button"
                    className="ml-2 text-xs text-gray-400 hover:text-gray-600"
                    onClick={(event) => {
                      event.stopPropagation();

                      const ok = window.confirm("¿Limpiar últimos preparados?");
                      if (!ok) return;

                      onClearRecentPrepared?.();
                    }}
                  >
                    limpiar
                  </button>
                </div>
                {recentPreparedEntries.map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{p.name}</span>
                    <span>{formatClock(p.time)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {recentPreparedClearedFeedback ? (
              <div className="text-xs text-green-600 mt-1">Historial limpiado</div>
            ) : null}
            {sessionPrepResetFeedback ? (
              <div className="text-xs text-green-600">Media reiniciada</div>
            ) : null}
          </div>
        ) : null}
        <div style={ticketRailInnerStyle}>
        {groups.length === 0 ? (
          <div style={emptyColumnStyle}>—</div>
        ) : (
          sortedGroups.map((g) => {
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
            const passChunks =
              sentPassesGrouping ? groupKitchenSentLinesByPase(g.lines) : null;
            const indexedPassChunks =
              passChunks?.map((chunk, originalIndex) => ({
                chunk,
                originalIndex,
              })) ?? null;
            const sortedPassChunks = indexedPassChunks
              ? [...indexedPassChunks].sort((a, b) => {
                  const aPrepared = a.chunk.every((l) => l.status === "prepared");
                  const bPrepared = b.chunk.every((l) => l.status === "prepared");
                  if (aPrepared === bPrepared) return 0;
                  if (aPrepared) return 1;
                  return -1;
                })
              : null;
            const score = getGroupUrgencyScore(g.lines, nowMs);
            const urgencyLabel = getUrgencyLabel(score);
            const cardUrgencyClass = getGroupCardUrgencyClassName(score);
            const tableCardStyle: CSSProperties = {
              ...cardBaseStyle,
              ...(cardUrgencyClass ? {} : { border: tone.border }),
            };
            if (cardUrgencyClass) {
              delete tableCardStyle.background;
            }
            return (
              <div
                key={g.tableKey}
                className={`transition-all duration-300${
                  cardUrgencyClass ? ` border ${cardUrgencyClass}` : ""
                }`.trim()}
                style={{
                  ...tableCardStyle,
                  ...(ticketRailLayout
                    ? {
                        ...ticketRailCardWrapStyle,
                        ...(archiveMuted
                          ? archiveTicketChromeStyle
                          : ticketRailCardChromeStyle),
                      }
                    : {}),
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "stretch",
                      gap: 8,
                      minWidth: 0,
                      flex: "1 1 auto",
                    }}
                  >
                    <span style={mesaChipStyle}>
                      {formatMesaChipLabel({
                        mesaRowText: g.tableLabel,
                        tableKey: g.tableKey,
                      })}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <h4 style={{ ...tableTitleStyle, fontWeight: 600, opacity: 0.92 }}>
                        {g.tableLabel}
                      </h4>
                      {urgencyLabel ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                            urgencyLabel === "Urgente"
                              ? "border-red-300/80 bg-transparent text-red-600"
                              : "border-orange-300/80 bg-transparent text-orange-700"
                          }`}
                        >
                          {urgencyLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
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
                {ticketRailLayout ? (
                  <div
                    style={{
                      margin: "6px 0 10px",
                      borderTop: "1px dashed rgba(148, 163, 184, 0.45)",
                    }}
                    aria-hidden
                  />
                ) : null}
                <div
                  className={
                    sortedPassChunks != null ? "flex flex-col space-y-2" : undefined
                  }
                  style={
                    sortedPassChunks != null
                      ? { display: "flex", flexDirection: "column" }
                      : { display: "flex", flexDirection: "column", gap: 6 }
                  }
                >
                  {sortedPassChunks != null ? (
                    sortedPassChunks.map(({ chunk, originalIndex }) => {
                      const oldestSent = oldestSentAtMsInChunk(chunk);
                      const passElapsedMs =
                        oldestSent != null && Number.isFinite(oldestSent)
                          ? nowMs - oldestSent
                          : null;
                      const preparedCount = chunk.filter(
                        (l) => l.status === "prepared",
                      ).length;
                      const totalCount = chunk.length;
                      const progressLabel =
                        preparedCount === 0
                          ? totalCount === 1
                            ? "1 línea"
                            : `${totalCount} líneas`
                          : preparedCount === totalCount
                            ? totalCount === 1
                              ? "1 lista"
                              : `${totalCount} listas`
                            : `${preparedCount}/${totalCount} listas`;
                      const passTypeLabel =
                        passTypeLabelOverride ??
                        kitchenPassChunkTypeLabel(chunk);
                      const isPassFullyPrepared =
                        preparedCount > 0 && preparedCount === totalCount;
                      const passTargets = chunk.filter((l) => l.status === "sent");
                      const passBulkBusy = passTargets.some(
                        (l) => busyItemIds[`${l.orderId}:${l.itemId}`],
                      );
                      const passKey = `${g.tableKey}-pase-${originalIndex}`;
                      const passPrepareBusy = busyPassKey === passKey;
                      const passMesaHeadline = passChunkMesaSummary(chunk);
                      return (
                      <div
                        key={`${g.tableKey}-pase-${originalIndex}`}
                        className={`${getPassChunkClassName(passTypeLabel)}${
                          isPassFullyPrepared ? " opacity-50" : ""
                        }`}
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div
                            className={`min-w-0 flex-1 flex flex-col gap-1.5 ${
                              isPassFullyPrepared ? "opacity-60" : ""
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span style={mesaChipStyle}>{passMesaHeadline}</span>
                              <span className="text-sm font-extrabold text-slate-800 tracking-tight">
                                Pase {originalIndex + 1}
                                {` · ${progressLabel}`}
                              </span>
                            </div>
                            <div className={getPassHeaderTextClassName(passTypeLabel)}>
                              {passTypeLabel}
                              {oldestSent != null
                                ? ` · ${formatPassSentClockHm(oldestSent)}`
                                : null}
                              {!isPassFullyPrepared &&
                              passElapsedMs != null &&
                              Number.isFinite(passElapsedMs) &&
                              passElapsedMs >= 0 ? (
                                <span
                                  className={`ml-1 text-xs ${passElapsedUrgencyTextClassFromMs(passElapsedMs)}`}
                                >
                                  · {formatPassElapsedMinutesFromMs(passElapsedMs)}
                                </span>
                              ) : null}
                              {isPassFullyPrepared ? (
                                <>
                                  {` · Completado`}
                                  <span className="ml-1 text-green-600">✓</span>
                                </>
                              ) : (
                                <>
                                  {` · `}
                                  <span className="ml-1 text-orange-600">
                                    Pendiente
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          {onPreparePassChunk &&
                          action &&
                          action.nextStatus === "prepared" &&
                          passTargets.length > 0 ? (
                            <button
                              type="button"
                              className={`rounded-full bg-green-600 px-2 py-1 text-xs font-medium text-white shrink-0 ${
                                !!busyPassKey || passBulkBusy
                                  ? "opacity-60 cursor-not-allowed"
                                  : ""
                              }`}
                              disabled={!!busyPassKey || passBulkBusy}
                              onClick={() =>
                                void onPreparePassChunk(
                                  chunk,
                                  passKey,
                                  prepareFeedbackMessage,
                                )
                              }
                            >
                              {passPrepareBusy ? "Preparando..." : prepareLabel}
                            </button>
                          ) : null}
                        </div>
                        <div className="my-1 h-px w-full bg-black/5" />
                        <div style={{ display: "grid", gap: 6 }}>
                          {chunk.map((line) => (
                            <BoardLineRow
                              key={`${line.orderId}:${line.itemId}`}
                              line={line}
                              nowMs={nowMs}
                              showUrgency={showUrgency}
                              action={action}
                              busyItemIds={busyItemIds}
                              onMark={onMark}
                              servedArchiveLayout={servedHistoryPresentation}
                            />
                          ))}
                        </div>
                      </div>
                      );
                    })
                  ) : (
                    courseSections.map((section) => (
                      <div key={section.label} style={{ display: "grid", gap: 6 }}>
                        {!servedHistoryPresentation ? (
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
                        ) : null}
                        {section.lines.map((line) => (
                          <BoardLineRow
                            key={`${line.orderId}:${line.itemId}`}
                            line={line}
                            nowMs={nowMs}
                            showUrgency={showUrgency}
                            action={action}
                            busyItemIds={busyItemIds}
                            onMark={onMark}
                            servedArchiveLayout={servedHistoryPresentation}
                          />
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>
    </div>
  );
}
