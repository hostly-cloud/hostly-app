"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  resolveKdsDestination,
  type KdsDestination,
} from "@/lib/kds/kds-destination";
import {
  readOperationStationFieldsFromFirestoreRecord,
  readStationFieldsFromFirestoreRecord,
} from "@/lib/kds/order-line-station";
import {
  parseFirestoreSelectedModifiers,
  resolveOrderLineModifierPresentation,
} from "@/lib/modifiers/cart-order-modifiers";
import {
  buildKdsVisualBatchLines,
  isKdsBatchFullyPrepared,
} from "@/lib/kds/kds-batch-group";
import { pickKdsFocusTableKeys } from "@/lib/kds/kds-focus-ticket";
import { computeKdsHeatSnapshot } from "@/lib/kds/kds-heat-state";
import {
  readKdsBatchCollapsed,
  writeKdsBatchCollapsed,
} from "@/lib/kds/kds-smart-collapse";
import {
  kdsSlaLevelLabel,
  kdsSlaProgressRatio,
  kdsSlaScoreFromElapsedMs,
  resolveKdsSlaLevel,
  type KdsSlaLevel,
  type KdsStationKind,
} from "@/lib/kds/kds-sla";
import { KdsHeatHeader } from "@/components/kds/kds-heat-header";
import { KdsVisualBatchSummary } from "@/components/kds/kds-batch-lines";
import { KdsLineGestureRow } from "@/components/kds/kds-line-gesture-row";
import {
  getHomogeneousPassChunkTypeLabel,
  getMenuCourseLabel,
  getMenuCourseSectionLabel,
  menuCourseGroupKey,
  readItemCourseFromRecord,
  sortMenuCourseKey,
} from "@/lib/carta/menu-course";
import { isKitchenLineWaitingMarch } from "@/lib/carta/comanda-line-release";

export type BoardItem = {
  id: string;
  name: string;
  qty: number;
  status?: string;
  productId?: string;
  categoria?: string;
  category?: string;
  categoryName?: string;
  station?: string;
  preparationArea?: string;
  operationStationId?: string;
  operationStationName?: string;
  sentAt?: unknown;
  preparedAt?: unknown;
  servedAt?: unknown;
  extras?: { name: string }[];
  note?: string;
  displayName?: string;
  modifiersLabel?: string;
  modifiersSubtitle?: string;
  baseProductName?: string;
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

type BoardStatus = "sent" | "prepared" | "served" | "waiting_march";

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
  modifiersSubtitle?: string;
  removedIngredients?: string[];
  course: number;
  /** Destino KDS resuelto (station o fallback categoría). */
  kdsDestination?: KdsDestination;
  /** Nombre estación operativa (Barra 2, etc.) para badge informativo. */
  operationStationName?: string;
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
  /** Si es false con `groupSentPasses`, solo agrupación visual sin “Preparar pase”. Cocina: `false` (Fase 1: solo Listo por línea). */
  enablePreparePassBulk?: boolean;
  /** Cabecera de tipo de pase agrupado (ej. Barra → “Bebidas”). Cocina: Entrantes/Primeros/Segundos/Postres/Mixto. */
  passTypeLabelOverride?: string;
  /** Cocina: tickets en fila horizontal con scroll táctil por columna de estado. */
  ticketRailLayout?: boolean;
  /** Cocina: oculta la columna permanente “Servido”; usar panel/archivo controlado por `servedArchiveOpen`. */
  kitchenHideServedColumn?: boolean;
  /** Abierto el panel compacto de líneas servidas (solo presentación). */
  servedArchiveOpen?: boolean;
  /** Cocina Fase 2: panel colapsable de líneas listas (prepared); columna principal = En producción. */
  preparedPanelOpen?: boolean;
  /** Notifica total de líneas en estado servido (para chip en barra de métricas). */
  onServedLineCountChange?: (count: number) => void;
  /** Notifica total de líneas prepared (para chip Listos en barra de métricas). */
  onPreparedLineCountChange?: (count: number) => void;
  /** SLA y heat map por estación (cocina vs barra/cóctel). */
  kdsStationKind?: KdsStationKind;
};

function readItemNoteFromRecord(rec: Record<string, unknown>): string | undefined {
  const keys = ["note", "lineNote", "notes", "comment", "observations"] as const;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
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
    const selectedModifiers = parseFirestoreSelectedModifiers(rec.selectedModifiers);
    const presentation = resolveOrderLineModifierPresentation({
      baseProductName: String(name || "Producto"),
      displayName:
        typeof rec.displayName === "string" ? rec.displayName : undefined,
      selectedModifiers,
      lineNote: readItemNoteFromRecord(rec),
    });
    const note = presentation.note || undefined;
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
    const productIdRaw =
      typeof rec.productId === "string" && rec.productId.trim()
        ? rec.productId.trim()
        : undefined;
    const stationFields = readStationFieldsFromFirestoreRecord(rec);
    const opFields = readOperationStationFieldsFromFirestoreRecord(rec);
    out.push({
      id,
      name: presentation.displayName,
      qty,
      status,
      ...(productIdRaw ? { productId: productIdRaw } : {}),
      ...(presentation.baseProductName
        ? { baseProductName: presentation.baseProductName }
        : {}),
      ...(presentation.displayName ? { displayName: presentation.displayName } : {}),
      ...(presentation.modifiersLabel
        ? { modifiersLabel: presentation.modifiersLabel }
        : {}),
      ...(presentation.modifiersSubtitle
        ? { modifiersSubtitle: presentation.modifiersSubtitle }
        : {}),
      categoria:
        typeof rec.categoria === "string" ? (rec.categoria as string) : undefined,
      category:
        typeof rec.category === "string" ? (rec.category as string) : undefined,
      categoryName:
        typeof rec.categoryName === "string"
          ? (rec.categoryName as string)
          : undefined,
      ...(stationFields.station ? { station: stationFields.station } : {}),
      ...(stationFields.preparationArea
        ? { preparationArea: stationFields.preparationArea }
        : {}),
      ...(opFields.operationStationId
        ? { operationStationId: opFields.operationStationId }
        : {}),
      ...(opFields.operationStationName
        ? { operationStationName: opFields.operationStationName }
        : {}),
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

const TERMINAL_STATUSES = new Set(["closed", "paid", "cancelled", "canceled", "merged"]);

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

/** Cocina: pending retenido (post-Comanda) → waiting_march; barra/sala sin cambio. */
function classifyKitchenBoardStatus(
  item: BoardItem,
  orderStatus: string | undefined,
): BoardStatus | null {
  const direct = classifyBoardStatus(item.status);
  if (direct) return direct;
  if (isKitchenLineWaitingMarch(item, orderStatus)) {
    return "waiting_march";
  }
  return null;
}

function kitchenCourseSectionOpsLabel(lines: BoardLine[]): string {
  if (lines.length === 0) return "";
  if (lines.every((l) => l.status === "waiting_march")) {
    return "Esperando marcha";
  }
  return "En producción";
}

function urgencyTone(minutes: number): {
  border: string;
  badgeBg: string;
  badgeColor: string;
} {
  if (minutes >= 20) {
    return {
      border: "1px solid rgba(180, 70, 70, 0.35)",
      badgeBg: "var(--hostly-danger-soft)",
      badgeColor: "#7f1d1d",
    };
  }
  if (minutes >= 10) {
    return {
      border: "1px solid rgba(200, 120, 60, 0.35)",
      badgeBg: "var(--hostly-warning-soft)",
      badgeColor: "var(--hostly-navy-deep)",
    };
  }
  return {
    border: "1px solid var(--hostly-line)",
    badgeBg: "var(--hostly-ice-100)",
    badgeColor: "var(--hostly-navy-mid)",
  };
}

const servedTone = {
  border: "1px solid rgba(46, 125, 80, 0.22)",
  badgeBg: "var(--hostly-success-soft)",
  badgeColor: "var(--hostly-navy-deep)",
};

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${Math.floor(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Cocina: texto del badge de tiempo (SLA/urgencia siguen usando minutos en bruto). */
function formatKitchenTicketElapsed(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${Math.floor(minutes)} min`;
  return `${Math.floor(minutes / 60)}h`;
}

const boardStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const columnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  minWidth: 0,
  borderRadius: 10,
  border: "1px solid var(--hostly-line)",
  background: "var(--hostly-surface-card-solid)",
  boxShadow: "var(--hostly-shadow-hairline)",
};

const columnHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 10px",
  borderBottom: "1px solid var(--hostly-line)",
  color: "var(--hostly-navy-deep)",
  background: "var(--hostly-ice-50)",
};

const columnTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--hostly-navy-mid)",
};

const columnCountStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "1px 7px",
  borderRadius: 999,
  background: "var(--hostly-ice-100)",
  color: "var(--hostly-navy-deep)",
  border: "1px solid var(--hostly-line)",
};

const columnBodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: 6,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

/** Contenedor vertical métricas + rail en modo comandero (cocina). */
const ticketRailOuterBodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  paddingTop: 6,
};

/** Carril horizontal de tickets por estado (scroll táctil). */
const ticketRailStripStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "row",
  gap: 8,
  alignItems: "stretch",
  overflowX: "auto",
  overflowY: "hidden",
  paddingLeft: 6,
  paddingRight: 6,
  paddingBottom: 8,
  overscrollBehaviorX: "contain",
  scrollSnapType: "x proximity",
  touchAction: "pan-x",
  WebkitOverflowScrolling: "touch",
};

/** Carril horizontal cocina: gap/padding mínimos (ancho vía CSS `cqi` en globals). */
const kitchenTicketRailStripStyle: CSSProperties = {
  ...ticketRailStripStyle,
  gap: 5,
  paddingLeft: 3,
  paddingRight: 3,
  paddingBottom: 5,
  scrollSnapType: "x mandatory",
};

/** Una tarjeta-ticket dentro del rail: ancho estable + snap + scroll vertical interno. */
const ticketRailCardWrapStyle: CSSProperties = {
  flex: "0 0 auto",
  width: "clamp(220px, 76vw, 288px)",
  minWidth: "clamp(220px, 76vw, 288px)",
  maxHeight: "100%",
  overflowY: "auto",
  scrollSnapAlign: "start",
};

const ticketRailCardChromeStyle: CSSProperties = {
  border: "1px solid var(--hostly-line)",
  boxShadow: "var(--hostly-shadow-hairline)",
};

/** Ticket dentro del archivo servidos (menos contraste). */
const archiveTicketChromeStyle: CSSProperties = {
  border: "1px solid var(--hostly-line)",
  boxShadow: "none",
  opacity: 0.97,
};

const emptyColumnStyle: CSSProperties = {
  padding: "14px 8px",
  textAlign: "center",
  color: "var(--hostly-ink-muted)",
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
  padding: "0 8px 12px",
};

/** Columna interna cuando no hay rail (lista vertical clásica). */
const ticketRailInnerLegacyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

/** Panel desplegable cocina: archivo servidos o bandeja Listos (solo UI). */
const kitchenSecondaryPanelStyle: CSSProperties = {
  flexShrink: 0,
  borderRadius: 12,
  border: "1px solid var(--hostly-line)",
  background: "var(--hostly-surface-card-solid)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "var(--hostly-shadow-hairline)",
};

const kitchenServedArchivePanelStyle: CSSProperties = {
  ...kitchenSecondaryPanelStyle,
  maxHeight: "min(40vh, 360px)",
};

const kitchenPreparedPanelStyle: CSSProperties = {
  ...kitchenSecondaryPanelStyle,
  maxHeight: "min(34vh, 300px)",
};

const cardBaseStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 8,
  borderRadius: 8,
  background: "#ffffff",
  color: "var(--hostly-ink)",
  border: "1px solid var(--hostly-line)",
  boxShadow: "var(--hostly-shadow-hairline)",
};

const mesaChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  padding: "3px 8px",
  borderRadius: 6,
  background: "var(--hostly-navy-deep)",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.03em",
  lineHeight: 1,
};

const mesaChipArchiveStyle: CSSProperties = {
  ...mesaChipStyle,
  padding: "3px 8px",
  fontSize: 11,
};

const archiveLineProductStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "var(--hostly-navy-deep)",
  lineHeight: 1.3,
  letterSpacing: "-0.02em",
};

const archiveLineSecondaryRowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--hostly-ink-muted)",
  lineHeight: 1.35,
};

const archiveServedRowSurfaceStyle: CSSProperties = {
  border: "1px solid var(--hostly-line)",
  background: "var(--hostly-ice-50)",
};

const badgeStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 999,
  letterSpacing: "0.03em",
};

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

/** Cocina — chrome del ticket; ancho vía `.hostly-kds-kitchen-ticket` + container query del rail. */
const kitchenTicketCardWrapStyle: CSSProperties = {
  flex: "0 0 auto",
  maxHeight: "100%",
  overflowY: "auto",
  scrollSnapAlign: "start",
};

const kitchenTicketCardSurfaceStyle: CSSProperties = {
  ...cardBaseStyle,
  gap: 7,
  padding: "9px 10px",
  borderRadius: 10,
};

const kitchenTicketHeaderMesaStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  padding: "5px 11px",
  borderRadius: 8,
  background: "var(--hostly-navy-deep)",
  color: "#ffffff",
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: "0.04em",
  lineHeight: 1.1,
  textTransform: "uppercase",
};

const kitchenTicketTimeBadgeStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  padding: "5px 10px",
  borderRadius: 999,
  letterSpacing: "0.02em",
  lineHeight: 1.1,
  flexShrink: 0,
};

const kitchenLineNameStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "var(--hostly-navy-deep)",
  lineHeight: 1.32,
  letterSpacing: "-0.02em",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  minWidth: 0,
  flex: "1 1 auto",
};

const kitchenLineRowStyle: CSSProperties = {
  ...lineRowStyle,
  padding: "7px 8px",
  gap: 6,
  alignItems: "flex-start",
};

const kitchenMarkBtnPrimaryClass =
  "hostly-button-primary hostly-kds-kitchen-line-cta !min-h-11 !min-w-[44px] !px-2 !py-2 !text-[13px] !font-semibold";

const kitchenMarkBtnServeClass =
  "hostly-button-secondary hostly-kds-kitchen-line-cta !min-h-11 !min-w-[44px] !border-emerald-200 !bg-emerald-600 !px-2 !py-2 !text-[13px] !font-semibold !text-white hover:!bg-emerald-700";

const kitchenPassPrepareBtnClass =
  "hostly-button-primary hostly-kds-kitchen-pass-cta !min-h-11 !px-2.5 !py-2 !text-[12px] !font-semibold shrink-0";

const kitchenLineSecondaryStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1.3,
  color: "var(--hostly-ink-muted)",
  opacity: 0.88,
};

const lineMetaStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--hostly-ink-muted)",
  marginTop: 4,
};

const lineNoteStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  fontStyle: "italic",
  color: "#9a5d16",
  lineHeight: 1.3,
  marginTop: 3,
  wordBreak: "break-word",
};

const lineCourseTypeStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--hostly-ink-muted)",
  lineHeight: 1.2,
  marginTop: 2,
};

const lineMesaLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--hostly-ink-muted)",
  lineHeight: 1.2,
};

const lineExtrasJoinedStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--hostly-accent)",
  lineHeight: 1.25,
  marginTop: 3,
  wordBreak: "break-word",
};

const lineModifiersStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  lineHeight: 1.25,
  marginTop: 4,
  wordBreak: "break-word",
};

const lineRemovedStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--hostly-ink-soft)",
  lineHeight: 1.25,
  marginTop: 3,
  wordBreak: "break-word",
};

const coursePillStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.06em",
  padding: "2px 6px",
  borderRadius: 4,
  background: "var(--hostly-info-soft)",
  color: "var(--hostly-navy-deep)",
  border: "1px solid rgba(49, 95, 125, 0.18)",
  lineHeight: 1.1,
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
      const ka = sortMenuCourseKey(a.course);
      const kb = sortMenuCourseKey(b.course);
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
      const ka = sortMenuCourseKey(a.course);
      const kb = sortMenuCourseKey(b.course);
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

/** Orden visual de mesas: 2 = crítico, 1 = atención, 0 = resto. */
function getGroupUrgencyScore(
  lines: BoardLine[],
  nowMs: number,
  station?: KdsStationKind,
): number {
  let maxScore = 0;
  for (const line of lines) {
    const t = line.sentAtMs ?? line.preparedAtMs;
    if (typeof t === "number" && Number.isFinite(t)) {
      const elapsed = nowMs - t;
      if (station) {
        maxScore = Math.max(maxScore, kdsSlaScoreFromElapsedMs(elapsed, station));
      } else {
        const min = elapsed / 60000;
        if (min >= 10) {
          maxScore = Math.max(maxScore, 2);
        } else if (min >= 5) {
          maxScore = Math.max(maxScore, 1);
        }
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
  return getHomogeneousPassChunkTypeLabel(chunk);
}

function getPassChunkClassName(label: string): string {
  if (label === "Bebidas")
    return "rounded-lg border border-sky-200/80 bg-sky-50/90 p-1.5";
  if (label === "Entrantes")
    return "rounded-lg border border-emerald-200/80 bg-emerald-50/80 p-1.5";
  if (label === "Primeros")
    return "rounded-lg border border-sky-200/80 bg-sky-50/85 p-1.5";
  if (label === "Segundos")
    return "rounded-lg border border-amber-200/80 bg-amber-50/70 p-1.5";
  if (label === "Postres")
    return "rounded-lg border border-violet-200/80 bg-violet-50/70 p-1.5";
  return "rounded-lg border border-[var(--hostly-line)] bg-[var(--hostly-ice-50)] p-1.5";
}

function getPassHeaderTextClassName(label: string): string {
  if (label === "Bebidas") return "text-[11px] font-bold text-sky-800";
  if (label === "Entrantes") return "text-[11px] font-bold text-emerald-800";
  if (label === "Primeros") return "text-[11px] font-bold text-sky-900";
  if (label === "Segundos") return "text-[11px] font-bold text-amber-900";
  if (label === "Postres") return "text-[11px] font-bold text-violet-800";
  return "text-[11px] font-bold text-[var(--hostly-ink-muted)]";
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
  preparedPanelOpen = false,
  onServedLineCountChange,
  onPreparedLineCountChange,
  kdsStationKind = "kitchen",
}: OrderItemsBoardProps) {
  const { restaurantId, ready: authReady, user } = useAuth();
  const { matchesOrder } = useOperationFilter();
  const kdsScopeKey = `${restaurantId ?? "none"}:${kdsStationKind}`;
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
  const [collapsedBatchKeys, setCollapsedBatchKeys] = useState<Record<string, boolean>>(
    {},
  );
  const [manualPriorityKeys, setManualPriorityKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [lineQuickNotes, setLineQuickNotes] = useState<Record<string, string>>({});
  const [kdsQuickMenu, setKdsQuickMenu] = useState<{
    orderId: string;
    itemId: string;
    x: number;
    y: number;
  } | null>(null);
  const boardScrollNearTopRef = useRef(true);
  const userInteractingRef = useRef(false);
  const focusScrollGuardUntilRef = useRef(0);

  const showBoardFeedback = (message: string) => {
    setBoardFeedbackMessage(message);
    setTimeout(() => {
      setBoardFeedbackMessage(null);
    }, 1500);
  };

  const showPreparePassBulk =
    kdsStationKind !== "kitchen" &&
    groupSentPasses &&
    enablePreparePassBulk !== false;

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
        const bs =
          kdsStationKind === "kitchen"
            ? classifyKitchenBoardStatus(item, order.status)
            : classifyBoardStatus(item.status);
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
          kdsDestination: resolveKdsDestination(item),
          mesaRowText,
          ...(item.extras && item.extras.length > 0
            ? { extras: item.extras }
            : {}),
          ...(item.note ? { note: item.note } : {}),
          ...(item.modifiersSubtitle
            ? { modifiersSubtitle: item.modifiersSubtitle }
            : {}),
          ...(item.removedIngredients && item.removedIngredients.length > 0
            ? { removedIngredients: item.removedIngredients }
            : {}),
          ...(item.operationStationName
            ? { operationStationName: item.operationStationName }
            : {}),
        };
        if (bs === "sent" || bs === "waiting_march") sent.push(line);
        else if (bs === "prepared") prepared.push(line);
        else served.push(line);
      }
    }
    return {
      sent: groupLinesByTable(sent),
      prepared: groupLinesByTable(prepared),
      served: groupLinesByTable(served),
    };
  }, [orders, itemFilter, matchesOrder, kdsStationKind]);

  const servedLineCount = useMemo(
    () => columns.served.reduce((acc, g) => acc + g.lines.length, 0),
    [columns.served],
  );

  const preparedLineCount = useMemo(
    () => columns.prepared.reduce((acc, g) => acc + g.lines.length, 0),
    [columns.prepared],
  );

  useEffect(() => {
    onServedLineCountChange?.(servedLineCount);
  }, [servedLineCount, onServedLineCountChange]);

  useEffect(() => {
    onPreparedLineCountChange?.(preparedLineCount);
  }, [preparedLineCount, onPreparedLineCountChange]);

  const kdsHeatSnapshot = useMemo(() => {
    let pendingCount = 0;
    let criticalCount = 0;
    let attentionCount = 0;
    let totalWait = 0;
    let waitSamples = 0;
    let openBatchCount = 0;

    for (const group of columns.sent) {
      const passChunks = groupSentPasses
        ? groupKitchenSentLinesByPase(group.lines)
        : null;
      if (passChunks && passChunks.length > 0) {
        openBatchCount += passChunks.filter(
          (chunk) => !isKdsBatchFullyPrepared(chunk),
        ).length;
      } else if (group.lines.some((line) => line.status === "sent")) {
        openBatchCount += 1;
      }

      for (const line of group.lines) {
        if (line.status !== "sent" || line.sentAtMs == null) continue;
        pendingCount += 1;
        const elapsed = nowMs - line.sentAtMs;
        totalWait += elapsed;
        waitSamples += 1;
        const level = resolveKdsSlaLevel(elapsed, kdsStationKind);
        if (level === "critical") criticalCount += 1;
        else if (level === "attention") attentionCount += 1;
      }
    }

    return computeKdsHeatSnapshot({
      station: kdsStationKind,
      pendingCount,
      preparedCount: columns.prepared.reduce(
        (acc, group) => acc + group.lines.length,
        0,
      ),
      criticalCount,
      attentionCount,
      avgWaitMs: waitSamples > 0 ? totalWait / waitSamples : null,
      openBatchCount,
    });
  }, [columns.prepared, columns.sent, groupSentPasses, kdsStationKind, nowMs]);

  const focusTableKeys = useMemo(
    () =>
      pickKdsFocusTableKeys(
        columns.sent,
        kdsStationKind,
        manualPriorityKeys,
      ),
    [columns.sent, kdsStationKind, manualPriorityKeys],
  );

  const toggleBatchCollapsed = useCallback(
    (batchKey: string, defaultCollapsed: boolean) => {
      setCollapsedBatchKeys((prev) => {
        const current =
          prev[batchKey] ??
          readKdsBatchCollapsed(kdsScopeKey, batchKey, defaultCollapsed);
        const next = !current;
        writeKdsBatchCollapsed(kdsScopeKey, batchKey, next);
        return { ...prev, [batchKey]: next };
      });
    },
    [kdsScopeKey],
  );

  const isBatchCollapsed = useCallback(
    (batchKey: string, defaultCollapsed: boolean) =>
      collapsedBatchKeys[batchKey] ??
      readKdsBatchCollapsed(kdsScopeKey, batchKey, defaultCollapsed),
    [collapsedBatchKeys, kdsScopeKey],
  );

  const toggleManualPriority = useCallback((tableKey: string) => {
    setManualPriorityKeys((prev) => {
      const next = new Set(prev);
      if (next.has(tableKey)) next.delete(tableKey);
      else next.add(tableKey);
      return next;
    });
  }, []);

  useEffect(() => {
    if (focusTableKeys.length === 0) return;
    if (userInteractingRef.current) return;
    if (!boardScrollNearTopRef.current) return;
    if (Date.now() < focusScrollGuardUntilRef.current) return;
    const target = document.querySelector(
      `[data-kds-focus-table="${focusTableKeys[0]}"]`,
    );
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusTableKeys.join("|")]);

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
    const idleCopy =
      emptyMessage.toLowerCase().includes("barra")
        ? "La barra está al día."
        : emptyMessage.toLowerCase().includes("sala") ||
            emptyMessage.toLowerCase().includes("servir")
          ? "Todo servido o sin platos listos."
          : "La cocina está al día.";
    return (
      <div className="hostly-mobile-empty-state hostly-mobile-card-soft flex min-h-[200px] flex-1 flex-col justify-center">
        <div className="hostly-mobile-empty-state__icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h3 className="hostly-mobile-empty-state__title">{emptyMessage}</h3>
        <p className="hostly-mobile-empty-state__desc">{idleCopy}</p>
      </div>
    );
  }

  const kitchenOpsUi = Boolean(
    kitchenHideServedColumn && ticketRailLayout && kdsStationKind === "kitchen",
  );

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
      {!kitchenHideServedColumn ? (
        <KdsHeatHeader
          snapshot={kdsHeatSnapshot}
          stationLabel={
            kdsStationKind === "bar"
              ? "Barra · operación"
              : kdsStationKind === "cocktail"
                ? "Coctelería · operación"
                : "Cocina · operación"
          }
          saturationMessage={
            kdsStationKind === "bar"
              ? "Barra entrando en saturación"
              : kdsStationKind === "cocktail"
                ? "Coctelería entrando en saturación"
                : "Cocina entrando en saturación"
          }
        />
      ) : null}
      {kitchenOpsUi && preparedPanelOpen ? (
        <figure
          className="hostly-mobile-operational-card hostly-kds-kitchen-prepared-panel !gap-0 !p-0 !shadow-none ring-1 ring-amber-500/15"
          style={kitchenPreparedPanelStyle}
          role="region"
          aria-label="Platos listos para servir"
          id="kds-prepared-panel"
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              padding: "8px 10px 10px",
            }}
          >
            <BoardColumn
              title="Listo"
              count={preparedLineCount}
              groups={columns.prepared}
              nowMs={nowMs}
              showUrgency
              ticketRailLayout={ticketRailLayout}
              railAccent="#fbbf24"
              compactArchiveColumn
              kitchenOpsUi={kitchenOpsUi}
              action={preparedAction}
              busyItemIds={busyItemIds}
              onMark={handleMarkNext}
              sentPassesGrouping={false}
              lineQuickNotes={lineQuickNotes}
              onLineLongPress={(line, anchor) =>
                setKdsQuickMenu({
                  orderId: line.orderId,
                  itemId: line.itemId,
                  x: anchor.x,
                  y: anchor.y,
                })
              }
            />
          </div>
        </figure>
      ) : null}
      {kitchenHideServedColumn && servedArchiveOpen ? (
        <figure
          className="hostly-mobile-operational-card !gap-0 !p-0 !shadow-none ring-1 ring-emerald-500/10"
          style={kitchenServedArchivePanelStyle}
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
        </figure>
      ) : null}
      <div
        className={`hostly-kds-board${
          kitchenOpsUi ? " hostly-kds-board--kitchen-ops hostly-kds-board--kitchen-single-focus" : ""
        }${
          ticketRailLayout && kitchenHideServedColumn
            ? " flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
            : ticketRailLayout
              ? " flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-3"
              : ""
        }`}
        data-kds-rush={kdsHeatSnapshot.mode === "rush" ? "true" : undefined}
        onScroll={(event) => {
          boardScrollNearTopRef.current = event.currentTarget.scrollTop < 120;
        }}
        onPointerDown={() => {
          userInteractingRef.current = true;
          focusScrollGuardUntilRef.current = Date.now() + 4000;
        }}
        onPointerUp={() => {
          window.setTimeout(() => {
            userInteractingRef.current = false;
          }, 800);
        }}
        style={
          ticketRailLayout
            ? { flex: 1, minHeight: 0, minWidth: 0 }
            : kitchenHideServedColumn && !kitchenOpsUi
              ? { ...boardStyle, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }
              : boardStyle
        }
      >
        <BoardColumn
          title={kitchenOpsUi ? "En producción" : "Pendiente"}
          count={columns.sent.reduce((a, g) => a + g.lines.length, 0)}
          groups={columns.sent}
          nowMs={nowMs}
          showUrgency
          ticketRailLayout={ticketRailLayout}
          railVerticalBand={
            ticketRailLayout && kitchenHideServedColumn && !kitchenOpsUi
              ? "main"
              : undefined
          }
          railAccent="#38bdf8"
          showPendingColumnMetrics={!kitchenHideServedColumn}
          kitchenOpsUi={kitchenOpsUi}
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
          kdsStationKind={kdsStationKind}
          kdsRushMode={kdsHeatSnapshot.mode === "rush"}
          focusTableKeys={focusTableKeys}
          manualPriorityKeys={manualPriorityKeys}
          onToggleManualPriority={toggleManualPriority}
          isBatchCollapsed={isBatchCollapsed}
          onToggleBatchCollapsed={toggleBatchCollapsed}
          lineQuickNotes={lineQuickNotes}
          onLineLongPress={(line, anchor) =>
            setKdsQuickMenu({
              orderId: line.orderId,
              itemId: line.itemId,
              x: anchor.x,
              y: anchor.y,
            })
          }
        />
        {!kitchenOpsUi ? (
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
          kitchenOpsUi={kitchenOpsUi}
          action={preparedAction}
          busyItemIds={busyItemIds}
          onMark={handleMarkNext}
          sentPassesGrouping={false}
        />
        ) : null}
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
          <div className="hostly-mobile-card--compact hostly-button-primary cursor-default rounded-full !px-4 !py-2 !text-[13px] !shadow-md">
            {boardFeedbackMessage}
          </div>
        </div>
      )}
      {kdsQuickMenu ? (
        <>
          <button
            type="button"
            className="hostly-kds-quick-menu-backdrop"
            aria-label="Cerrar menú"
            onClick={() => setKdsQuickMenu(null)}
          />
          <div
            className="hostly-kds-quick-menu"
            style={{
              top: Math.max(8, kdsQuickMenu.y - 8),
              left: Math.max(8, Math.min(kdsQuickMenu.x - 90, window.innerWidth - 200)),
            }}
          >
            <button
              type="button"
              onClick={() => {
                void handleMarkNext(
                  kdsQuickMenu.orderId,
                  kdsQuickMenu.itemId,
                  sentAction.nextStatus,
                );
                setKdsQuickMenu(null);
              }}
            >
              {kitchenOpsUi ? "Marcar listo" : "Marcar preparado"}
            </button>
            <button
              type="button"
              onClick={() => {
                const line = columns.sent
                  .flatMap((group) => group.lines)
                  .find(
                    (entry) =>
                      entry.orderId === kdsQuickMenu.orderId &&
                      entry.itemId === kdsQuickMenu.itemId,
                  );
                if (line?.tableKey) toggleManualPriority(line.tableKey);
                setKdsQuickMenu(null);
              }}
            >
              Prioridad manual
            </button>
            <button
              type="button"
              onClick={() => {
                const note = window.prompt("Nota rápida (solo sesión KDS)");
                if (note == null) return;
                const trimmed = note.trim();
                const key = `${kdsQuickMenu.orderId}:${kdsQuickMenu.itemId}`;
                setLineQuickNotes((prev) => {
                  if (!trimmed) {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                  }
                  return { ...prev, [key]: trimmed };
                });
                setKdsQuickMenu(null);
              }}
            >
              Nota rápida
            </button>
          </div>
        </>
      ) : null}
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
  kdsStationKind,
  lineQuickNote,
  onLongPress,
  kitchenOpsUi = false,
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
  kdsStationKind?: KdsStationKind;
  lineQuickNote?: string;
  onLongPress?: (anchor: { x: number; y: number }) => void;
  /** Cocina Fase 2: tipografía táctil y sin mesa/tiempo duplicados en rail. */
  kitchenOpsUi?: boolean;
}) {
  const minutes =
    line.sentAtMs != null ? Math.floor((nowMs - line.sentAtMs) / 60000) : 0;
  const busy = busyItemIds[`${line.orderId}:${line.itemId}`];
  const isWaitingMarch = line.status === "waiting_march";
  const lineAction =
    action && line.status === "sent" ? action : null;
  const isServeAction = lineAction?.nextStatus === "served";
  const markBtnClass = kitchenOpsUi
    ? isServeAction
      ? kitchenMarkBtnServeClass
      : kitchenMarkBtnPrimaryClass
    : isServeAction
      ? "hostly-button-secondary !min-h-11 !min-w-[48px] !border-emerald-200 !bg-emerald-600 !px-3 !py-2 !text-[13px] !font-semibold !text-white hover:!bg-emerald-700"
      : "hostly-button-primary !min-h-11 !min-w-[48px] !px-3 !py-2 !text-[13px]";
  const markLabel = kitchenOpsUi
    ? isServeAction
      ? "Servir"
      : "Listo"
    : isServeAction
      ? "Servir"
      : (lineAction?.label ?? "");

  const archiveProductRow =
    servedArchiveLayout && line.status === "served";

  if (archiveProductRow) {
    const coursePart =
      line.course >= 1 && line.course <= 4 ? getMenuCourseLabel(line.course) : "";
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
          {line.modifiersSubtitle ? (
            <div style={{ ...lineModifiersStyle, marginTop: 4, fontSize: 11 }}>
              {line.modifiersSubtitle}
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
        {lineAction ? (
          <button
            type="button"
            disabled={busy}
            className={`${markBtnClass} shrink-0 self-center disabled:opacity-60`}
            style={{ cursor: busy ? "progress" : "pointer" }}
            onClick={() =>
              onMark(line.orderId, line.itemId, lineAction.nextStatus)
            }
          >
            {busy ? (lineAction.busyLabel ?? "Guardando…") : markLabel}
          </button>
        ) : null}
      </div>
    );
  }

  let itemBorder = "1px solid #e5e7eb"; // gray-200
  let itemBg = "#ffffff";
  if (isWaitingMarch) {
    itemBorder = "1px solid rgba(148, 163, 184, 0.35)";
    itemBg = "rgba(248, 250, 252, 0.96)";
  }
  const elapsedMs =
    line.sentAtMs != null ? Math.max(0, nowMs - line.sentAtMs) : null;
  const slaLevel: KdsSlaLevel =
    elapsedMs != null && kdsStationKind
      ? resolveKdsSlaLevel(elapsedMs, kdsStationKind)
      : "normal";
  if (kdsStationKind && slaLevel === "critical") {
    itemBorder = "1px solid #fca5a5";
    itemBg = "#fef2f2";
  } else if (kdsStationKind && slaLevel === "attention") {
    itemBorder = "1px solid #fdba74";
    itemBg = "#fff7ed";
  } else if (!kdsStationKind && minutes >= 10) {
    itemBorder = "1px solid #ef4444";
    itemBg = "#fef2f2";
  } else if (!kdsStationKind && minutes >= 5) {
    itemBorder = "1px solid #fb923c";
    itemBg = "#fff7ed";
  }

  const rowBody = (
    <div
      className={
        kitchenOpsUi
          ? `hostly-kds-kitchen-line-row${
              isWaitingMarch ? " is-waiting-march" : ""
            }`
          : "hostly-kds-line-row"
      }
      style={{
        ...(kitchenOpsUi ? kitchenLineRowStyle : lineRowStyle),
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
            gap: kitchenOpsUi ? 4 : 6,
          }}
        >
          {!kitchenOpsUi ? (
            <span style={mesaChipStyle}>{formatMesaChipLabel(line)}</span>
          ) : null}
          {line.course >= 1 && line.course <= 4 && !kitchenOpsUi ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#64748b",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {getMenuCourseLabel(line.course)}
            </span>
          ) : null}
          <div
            style={
              kitchenOpsUi
                ? {
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                    minWidth: 0,
                  }
                : {
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    flexWrap: "wrap",
                  }
            }
          >
            <span
              className={
                kitchenOpsUi ? "hostly-kds-kitchen-product-name" : undefined
              }
              style={kitchenOpsUi ? kitchenLineNameStyle : lineNameStyle}
            >
              x{line.qty} {line.name}
            </span>
            {line.kdsDestination === "cocktail" ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#5b21b6",
                  background: "rgba(139, 92, 246, 0.12)",
                  border: "1px solid rgba(139, 92, 246, 0.28)",
                  borderRadius: 4,
                  padding: "1px 5px",
                  lineHeight: 1.3,
                }}
              >
                Cóctel
              </span>
            ) : null}
            {line.operationStationName ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  color: "#334155",
                  background: "rgba(148, 163, 184, 0.16)",
                  border: "1px solid rgba(100, 116, 139, 0.28)",
                  borderRadius: 4,
                  padding: "1px 5px",
                  lineHeight: 1.3,
                  maxWidth: "min(140px, 42vw)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={line.operationStationName}
              >
                {line.operationStationName}
              </span>
            ) : null}
          </div>
        </div>
        {line.extras && line.extras.length > 0 ? (
          <div
            style={
              kitchenOpsUi
                ? { ...lineExtrasJoinedStyle, ...kitchenLineSecondaryStyle }
                : lineExtrasJoinedStyle
            }
          >
            {line.extras.map((e) => `+ ${e.name}`).join(" · ")}
          </div>
        ) : null}
        {line.modifiersSubtitle ? (
          <div
            style={
              kitchenOpsUi
                ? { ...lineModifiersStyle, ...kitchenLineSecondaryStyle }
                : lineModifiersStyle
            }
          >
            {line.modifiersSubtitle}
          </div>
        ) : null}
        {line.removedIngredients && line.removedIngredients.length > 0 ? (
          <div
            style={
              kitchenOpsUi
                ? { ...lineRemovedStyle, ...kitchenLineSecondaryStyle }
                : lineRemovedStyle
            }
          >
            Sin: {line.removedIngredients.join(" · ")}
          </div>
        ) : null}
        {line.note ? <div style={lineNoteStyle}>Nota: {line.note}</div> : null}
        {lineQuickNote ? (
          <div style={{ ...lineNoteStyle, color: "#0369a1" }}>
            Quick: {lineQuickNote}
          </div>
        ) : null}
        {!kitchenOpsUi ? (
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
            {kdsStationKind && slaLevel !== "normal" ? (
              <span
                className={`hostly-kds-sla-pill${
                  slaLevel === "critical" ? " is-critical" : " is-attention"
                }`}
              >
                {kdsSlaLevelLabel(slaLevel)}
              </span>
            ) : null}
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
        ) : null}
        {!kitchenOpsUi && kdsStationKind && elapsedMs != null ? (
          <div className="hostly-kds-sla-progress" aria-hidden>
            <span
              style={{
                width: `${Math.round(kdsSlaProgressRatio(elapsedMs, kdsStationKind) * 100)}%`,
              }}
            />
          </div>
        ) : null}
      </div>
      {lineAction ? (
        <button
          type="button"
          disabled={busy}
          className={`${markBtnClass} shrink-0 ${
            kitchenOpsUi ? "self-end" : "self-center"
          } disabled:opacity-60`}
          style={{ cursor: busy ? "progress" : "pointer" }}
          onClick={() =>
            onMark(line.orderId, line.itemId, lineAction.nextStatus)
          }
        >
          {busy ? (lineAction.busyLabel ?? "Guardando…") : markLabel}
        </button>
      ) : null}
    </div>
  );

  if (!lineAction || servedArchiveLayout || isWaitingMarch) {
    return rowBody;
  }

  return (
    <KdsLineGestureRow
      enabled={Boolean(onLongPress) || Boolean(lineAction)}
      onSwipePrepare={() =>
        onMark(line.orderId, line.itemId, lineAction.nextStatus)
      }
      onDoubleTapPrepare={() =>
        onMark(line.orderId, line.itemId, lineAction.nextStatus)
      }
      onLongPress={onLongPress}
    >
      {rowBody}
    </KdsLineGestureRow>
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
  kdsStationKind,
  kdsRushMode = false,
  focusTableKeys = [],
  manualPriorityKeys,
  onToggleManualPriority,
  isBatchCollapsed,
  onToggleBatchCollapsed,
  lineQuickNotes,
  onLineLongPress,
  kitchenOpsUi = false,
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
  kdsStationKind?: KdsStationKind;
  kdsRushMode?: boolean;
  focusTableKeys?: string[];
  manualPriorityKeys?: Set<string>;
  onToggleManualPriority?: (tableKey: string) => void;
  isBatchCollapsed?: (batchKey: string, defaultCollapsed: boolean) => boolean;
  onToggleBatchCollapsed?: (batchKey: string, defaultCollapsed: boolean) => void;
  lineQuickNotes?: Record<string, string>;
  onLineLongPress?: (
    line: BoardLine,
    anchor: { x: number; y: number },
  ) => void;
  /** Cocina Fase 2: tickets más legibles en rail de cocina. */
  kitchenOpsUi?: boolean;
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
            if (kdsStationKind) {
              const level = resolveKdsSlaLevel(elapsed, kdsStationKind);
              if (level === "critical") urgentCount++;
              else if (level === "attention") attentionCount++;
            } else if (min >= 10) {
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
        : passTypeLabelOverride === "Cócteles"
          ? stationStatus === "En ritmo"
            ? "Coctelería en ritmo"
            : stationStatus === "Atención"
              ? "Coctelería atención"
              : "Coctelería lenta"
          : stationStatus;

  useEffect(() => {
    if (!showPendingColumnMetrics) return;
    const station =
      passTypeLabelOverride === "Bebidas"
        ? "barra"
        : passTypeLabelOverride === "Cócteles"
          ? "cocteleria"
          : "cocina";
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
    const aFocusBoost = focusTableKeys.includes(a.tableKey) ? 4 : 0;
    const bFocusBoost = focusTableKeys.includes(b.tableKey) ? 4 : 0;
    const aManual = manualPriorityKeys?.has(a.tableKey) ? 2 : 0;
    const bManual = manualPriorityKeys?.has(b.tableKey) ? 2 : 0;
    const aScore =
      getGroupUrgencyScore(a.lines, nowMs, kdsStationKind) +
      aFocusBoost +
      aManual;
    const bScore =
      getGroupUrgencyScore(b.lines, nowMs, kdsStationKind) +
      bFocusBoost +
      bManual;
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
          background: "var(--hostly-success-soft)",
          borderColor: "rgba(46, 125, 80, 0.22)",
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
      color: "var(--hostly-navy-deep)",
      opacity: 1,
      fontSize: ticketRailLayout ? 12 : (resolvedTitleStyle.fontSize ?? 12),
    };
  }
  let resolvedHeaderStyle: CSSProperties = ticketRailLayout
    ? { ...columnHeaderStyle, paddingTop: 12, paddingBottom: 12 }
    : columnHeaderStyle;
  if (archiveMuted) {
    resolvedHeaderStyle = {
      ...resolvedHeaderStyle,
      borderBottom: "1px solid rgba(46, 125, 80, 0.2)",
      background: "rgba(255, 255, 255, 0.35)",
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
      : kitchenOpsUi
        ? kitchenTicketRailStripStyle
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
                ? "flex w-full min-w-0 flex-[1_1_0] basis-0 flex-col min-h-[200px] border-t border-[var(--hostly-line)] pt-0.5 sm:min-h-[220px]"
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
                className={`hostly-mobile-pill pointer-events-none mb-1.5 !px-2 !py-0.5 !text-[10px] font-bold ${getStationStatusClass(stationStatus)}`}
              >
                {stationStatusLabel}
              </div>
            ) : null}
            {pendingCount > 0 ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <div className="hostly-mobile-pill pointer-events-none !px-2 !py-0.5 !text-[10px] font-bold text-[var(--hostly-navy-deep)]">
                    {pendingCount} {pendingLabel}
                  </div>
                  {attentionCount > 0 ? (
                    <div className="hostly-mobile-pill pointer-events-none !border-amber-200/80 !bg-amber-50 !px-2 !py-0.5 !text-[10px] font-bold text-amber-900">
                      {attentionCount} atención
                    </div>
                  ) : null}
                  {urgentCount > 0 ? (
                    <div className="hostly-mobile-pill pointer-events-none !border-red-200 !bg-red-50 !px-2 !py-0.5 !text-[10px] font-bold text-red-800">
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
        <div
          style={ticketRailInnerStyle}
          {...(kitchenOpsUi && ticketRailLayout
            ? { "data-kds-kitchen-ticket-rail": "" }
            : {})}
        >
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
              const key = menuCourseGroupKey(line.course);
              const arr = byCourse.get(key) ?? [];
              arr.push(line);
              byCourse.set(key, arr);
            }
            const courseSections = Array.from(byCourse.entries())
              .sort((a, b) => sortMenuCourseKey(a[0]) - sortMenuCourseKey(b[0]))
              .map(([course, lines]) => ({
                course,
                label: getMenuCourseSectionLabel(course).toUpperCase(),
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
            const score = getGroupUrgencyScore(g.lines, nowMs, kdsStationKind);
            const urgencyLabel = getUrgencyLabel(score);
            const cardUrgencyClass = getGroupCardUrgencyClassName(score);
            const isFocusTicket = focusTableKeys.includes(g.tableKey);
            const tableCardStyle: CSSProperties =
              kitchenOpsUi && ticketRailLayout
                ? {
                    ...kitchenTicketCardSurfaceStyle,
                    ...(cardUrgencyClass ? {} : { border: tone.border }),
                  }
                : {
                    ...cardBaseStyle,
                    ...(cardUrgencyClass ? {} : { border: tone.border }),
                  };
            if (cardUrgencyClass) {
              delete tableCardStyle.background;
            }
            return (
              <div
                key={g.tableKey}
                data-kds-focus-table={g.tableKey}
                className={`hostly-kds-ticket-card transition-all duration-150 hostly-kds-line-enter${
                  cardUrgencyClass ? ` border ${cardUrgencyClass}` : ""
                }${isFocusTicket ? " hostly-kds-focus-ticket" : ""}${
                  kitchenOpsUi ? " hostly-kds-kitchen-ticket" : ""
                }`.trim()}
                style={{
                  ...tableCardStyle,
                  ...(ticketRailLayout
                    ? {
                        ...(kitchenOpsUi
                          ? kitchenTicketCardWrapStyle
                          : ticketRailCardWrapStyle),
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
                    alignItems: kitchenOpsUi ? "center" : "flex-start",
                    justifyContent: "space-between",
                    gap: kitchenOpsUi ? 10 : 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: kitchenOpsUi ? 0 : 6,
                      flexWrap: "wrap",
                      minWidth: 0,
                      flex: kitchenOpsUi ? "0 1 auto" : "1 1 auto",
                    }}
                  >
                    <span
                      style={
                        kitchenOpsUi
                          ? kitchenTicketHeaderMesaStyle
                          : mesaChipStyle
                      }
                    >
                      {formatMesaChipLabel({
                        mesaRowText: g.tableLabel,
                        tableKey: g.tableKey,
                      })}
                    </span>
                    {!kitchenOpsUi && urgencyLabel ? (
                      <span
                        className={`hostly-kds-urgency-label rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                          urgencyLabel === "Urgente"
                            ? "border border-red-200 bg-red-50 text-red-800"
                            : "border border-amber-200 bg-amber-50 text-amber-900"
                        }`}
                      >
                        {urgencyLabel}
                      </span>
                    ) : null}
                  </div>
                  {showUrgency && g.oldestSentAtMs != null ? (
                    <span
                      className="hostly-kds-ticket-time"
                      style={{
                        ...(kitchenOpsUi
                          ? kitchenTicketTimeBadgeStyle
                          : badgeStyle),
                        background: tone.badgeBg,
                        color: tone.badgeColor,
                      }}
                    >
                      {kitchenOpsUi
                        ? formatKitchenTicketElapsed(oldestMinutes)
                        : formatMinutes(oldestMinutes)}
                    </span>
                  ) : null}
                </div>
                {ticketRailLayout && !kitchenOpsUi ? (
                  <div
                    style={{
                      margin: "4px 0 6px",
                      borderTop: "1px dashed rgba(54, 86, 116, 0.18)",
                    }}
                    aria-hidden
                  />
                ) : null}
                <div
                  className={
                    kitchenOpsUi
                      ? "hostly-kds-kitchen-course-stack"
                      : sortedPassChunks != null
                        ? "flex flex-col space-y-2"
                        : undefined
                  }
                  style={
                    kitchenOpsUi
                      ? undefined
                      : sortedPassChunks != null
                        ? { display: "flex", flexDirection: "column" }
                        : { display: "flex", flexDirection: "column", gap: 6 }
                  }
                >
                  {kitchenOpsUi ? (
                    courseSections.map((section) => {
                      const sectionOpsLabel = kitchenCourseSectionOpsLabel(
                        section.lines,
                      );
                      const sectionAllWaiting = section.lines.every(
                        (l) => l.status === "waiting_march",
                      );
                      return (
                      <div
                        key={`${g.tableKey}-course-${section.course}`}
                        className={`hostly-kds-kitchen-course-section${
                          sectionAllWaiting ? " is-waiting-march" : ""
                        }`}
                        data-kds-course={section.course}
                      >
                        <p
                          className="hostly-kds-kitchen-course-heading"
                          role="heading"
                          aria-level={3}
                          aria-label={`${getMenuCourseSectionLabel(section.course)}: ${section.lines.length} líneas, ${sectionOpsLabel}`}
                        >
                          <span className="hostly-kds-kitchen-course-heading__label">
                            {section.label}
                          </span>
                          <span
                            className="hostly-kds-kitchen-course-heading__count"
                            aria-hidden
                          >
                            ({section.lines.length})
                          </span>
                          <span
                            className={`hostly-kds-kitchen-course-heading__ops${
                              sectionAllWaiting ? " is-waiting-march" : ""
                            }`}
                          >
                            {sectionOpsLabel}
                          </span>
                        </p>
                        <div className="hostly-kds-kitchen-course-lines">
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
                              kdsStationKind={kdsStationKind}
                              kitchenOpsUi={kitchenOpsUi}
                              lineQuickNote={
                                lineQuickNotes?.[`${line.orderId}:${line.itemId}`]
                              }
                              onLongPress={
                                onLineLongPress
                                  ? (anchor) => onLineLongPress(line, anchor)
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                    })
                  ) : sortedPassChunks != null ? (
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
                      const batchVisual = buildKdsVisualBatchLines(chunk);
                      const defaultCollapsed = isPassFullyPrepared;
                      const collapsed =
                        isBatchCollapsed?.(passKey, defaultCollapsed) ??
                        defaultCollapsed;
                      const showPreparePass =
                        Boolean(onPreparePassChunk) &&
                        Boolean(action) &&
                        action?.nextStatus === "prepared" &&
                        passTargets.length > 0;
                      const preparePassButton = showPreparePass ? (
                        <button
                          type="button"
                          className={`${
                            kitchenOpsUi
                              ? kitchenPassPrepareBtnClass
                              : "hostly-button-primary !min-h-11 !min-w-[48px] !px-3 !py-2 !text-[13px] !font-semibold shrink-0"
                          } ${
                            !!busyPassKey || passBulkBusy
                              ? "cursor-not-allowed opacity-60"
                              : ""
                          }`}
                          disabled={!!busyPassKey || passBulkBusy}
                          onClick={() =>
                            void onPreparePassChunk!(
                              chunk,
                              passKey,
                              prepareFeedbackMessage,
                            )
                          }
                        >
                          {passPrepareBusy ? "Preparando..." : prepareLabel}
                        </button>
                      ) : null;
                      const passLineRows = !collapsed
                        ? chunk.map((line) => (
                            <BoardLineRow
                              key={`${line.orderId}:${line.itemId}`}
                              line={line}
                              nowMs={nowMs}
                              showUrgency={showUrgency}
                              action={action}
                              busyItemIds={busyItemIds}
                              onMark={onMark}
                              servedArchiveLayout={servedHistoryPresentation}
                              kdsStationKind={kdsStationKind}
                              kitchenOpsUi={kitchenOpsUi}
                              lineQuickNote={
                                lineQuickNotes?.[`${line.orderId}:${line.itemId}`]
                              }
                              onLongPress={
                                onLineLongPress
                                  ? (anchor) => onLineLongPress(line, anchor)
                                  : undefined
                              }
                            />
                          ))
                        : null;
                      return (
                      <div
                        key={`${g.tableKey}-pase-${originalIndex}`}
                        className={`${getPassChunkClassName(passTypeLabel)}${
                          kitchenOpsUi ? " hostly-kds-kitchen-pass-chunk" : ""
                        }${
                          isPassFullyPrepared ? " opacity-50" : ""
                        }${kdsRushMode ? " !p-1" : ""}`}
                      >
                        {kitchenOpsUi ? (
                          <>
                            <div
                              className="hostly-kds-kitchen-pass-lines"
                              style={{
                                display: "grid",
                                gap: kdsRushMode ? 4 : 6,
                              }}
                            >
                              {passLineRows}
                            </div>
                            <div
                              className={`hostly-kds-kitchen-pass-footer${
                                isPassFullyPrepared ? " opacity-60" : ""
                              }`}
                            >
                              {preparePassButton ? (
                                <div className="hostly-kds-kitchen-pass-cta-row">
                                  {preparePassButton}
                                </div>
                              ) : null}
                              <p className="hostly-kds-kitchen-pass-aux">
                                <span>
                                  Pase {originalIndex + 1} · {progressLabel} ·{" "}
                                  {passTypeLabel}
                                </span>
                                <span
                                  className={
                                    isPassFullyPrepared
                                      ? "hostly-kds-kitchen-pass-aux-status is-done"
                                      : "hostly-kds-kitchen-pass-aux-status is-pending"
                                  }
                                >
                                  {isPassFullyPrepared
                                    ? " · Listo"
                                    : kitchenOpsUi
                                      ? " · En producción"
                                      : " · Pendiente"}
                                </span>
                              </p>
                              {batchVisual.length >= 2 ? (
                                <div className="hostly-kds-kitchen-batch-wrap">
                                  <KdsVisualBatchSummary
                                    batches={batchVisual}
                                    collapsed={collapsed}
                                    onToggle={() =>
                                      onToggleBatchCollapsed?.(
                                        passKey,
                                        defaultCollapsed,
                                      )
                                    }
                                  />
                                </div>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <>
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div
                            className={`min-w-0 flex-1 flex flex-col gap-1.5 ${
                              isPassFullyPrepared ? "opacity-60" : ""
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span style={mesaChipStyle}>
                                {passMesaHeadline}
                              </span>
                              <span className="text-[13px] font-extrabold tracking-tight text-[var(--hostly-navy-deep)]">
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
                          {preparePassButton}
                        </div>
                        <div className="my-1 h-px w-full bg-black/5" />
                        {batchVisual.length >= 2 ? (
                          <KdsVisualBatchSummary
                            batches={batchVisual}
                            collapsed={collapsed}
                            onToggle={() =>
                              onToggleBatchCollapsed?.(passKey, defaultCollapsed)
                            }
                          />
                        ) : null}
                        <div
                          style={{ display: "grid", gap: kdsRushMode ? 4 : 6 }}
                        >
                          {passLineRows}
                        </div>
                          </>
                        )}
                      </div>
                      );
                    })
                  ) : (
                    courseSections.map((section) => (
                      <div key={section.label} style={{ display: "grid", gap: 6 }}>
                        {!servedHistoryPresentation ? (
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: "0.07em",
                            textTransform: "uppercase",
                            color: "var(--hostly-ink-muted)",
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
                            kdsStationKind={kdsStationKind}
                            kitchenOpsUi={kitchenOpsUi}
                            lineQuickNote={
                              lineQuickNotes?.[`${line.orderId}:${line.itemId}`]
                            }
                            onLongPress={
                              onLineLongPress
                                ? (anchor) => onLineLongPress(line, anchor)
                                : undefined
                            }
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
