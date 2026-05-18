"use client";

import type { CSSProperties, WheelEvent as ReactWheelEvent } from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  EditableFloorMap,
  getPlanElementBaseVisualStyle,
} from "@/components/map/EditableFloorMap";
import { ElementCard } from "@/components/map/element-map-card";
import { PinchZoomMap } from "@/app/dashboard/carta/_components/pinch-zoom-map";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import {
  entityBelongsToFloorPlan,
  getFloorPlans,
  resolveFloorPlanCanvasSize,
  type FloorPlan,
} from "@/lib/firestore/floorPlans";
import {
  listenReservationsForDate,
  type Reservation,
} from "@/lib/firestore/reservations";
import {
  orderDocHasActiveLinesForMapOccupancy,
  readOrderCreatedAtMs,
} from "@/lib/firestore/order-table-occupancy";
import {
  filterTablesForTpvMap,
  isDecorativePlanElementType,
  sortTablesForTpvMap,
  TABLE_MAP_STATUS_FREE,
  type Table,
} from "@/lib/firestore/tables";
import { getZones, type Zone } from "@/lib/firestore/zones";
import {
  buildDisplayReservationByTableIdForMap,
  buildReservationPressureByTableIdForMap,
  nextBookedReservationForMainTable,
} from "@/lib/reservas/reservation-map-live";
import { useTableGroups } from "@/hooks/useTableGroups";
import { collection, onSnapshot, query, where } from "firebase/firestore";

function pickerDecorativeStyle(
  element: Table,
  x: number,
  y: number,
  width: number,
  height: number,
): CSSProperties {
  const baseVisual = getPlanElementBaseVisualStyle(element, "premium");
  const readonlyLayer =
    element.type === "bar"
      ? 8
      : element.type === "wall"
        ? 3
        : element.type === "door"
          ? 8
          : isDecorativePlanElementType(element.type)
            ? 5
            : 6;
  return {
    position: "absolute",
    left: x,
    top: y,
    width,
    height,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    pointerEvents: "none",
    zIndex: readonlyLayer,
    ...baseVisual,
  };
}

function todayYmd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isClusterBusy(
  mainTileId: string,
  occupied: Set<string>,
  groupedTables: Record<string, string[]>,
): boolean {
  const m = mainTileId.trim();
  if (!m) return false;
  if (occupied.has(m)) return true;
  const sec = groupedTables[m];
  if (Array.isArray(sec)) {
    for (const s of sec) {
      if (occupied.has(String(s).trim())) return true;
    }
  }
  return false;
}

function reservationStatusChipLabel(status: Reservation["status"]): string {
  switch (status) {
    case "booked":
      return "Reserva";
    case "seated":
      return "En sala";
    case "completed":
      return "Cerrada";
    case "no_show":
      return "No show";
    case "cancelled":
      return "Cancelada";
    default:
      return "Reserva";
  }
}

function liveToneFromReservationStatus(
  status: Reservation["status"],
): "booked" | "seated" | "completed" | "no_show" | null {
  if (
    status === "booked" ||
    status === "seated" ||
    status === "completed" ||
    status === "no_show"
  ) {
    return status;
  }
  return null;
}

function overlayStatusChipStyle(status: Reservation["status"]): {
  background: string;
  border: string;
  color: string;
} {
  switch (status) {
    case "booked":
      return {
        background: "rgba(238, 242, 255, 0.97)",
        border: "1px solid rgba(99, 102, 241, 0.32)",
        color: "#312e81",
      };
    case "seated":
      return {
        background: "rgba(224, 242, 254, 0.97)",
        border: "1px solid rgba(14, 116, 144, 0.38)",
        color: "#0c4a6e",
      };
    case "completed":
      return {
        background: "rgba(241, 245, 249, 0.97)",
        border: "1px solid rgba(100, 116, 139, 0.3)",
        color: "#475569",
      };
    case "no_show":
      return {
        background: "rgba(255, 241, 242, 0.97)",
        border: "1px solid rgba(225, 29, 72, 0.28)",
        color: "#9f1239",
      };
    default:
      return {
        background: "rgba(248, 250, 252, 0.97)",
        border: "1px solid rgba(148, 163, 184, 0.32)",
        color: "#334155",
      };
  }
}
export type ReservationFloorMapPickerConfirm = {
  tableId: string;
  tableLabel: string;
  floorPlanId: string;
  floorName: string;
  zoneId: string;
  zoneName: string;
};

export type ReservationFloorMapPickerProps = {
  open: boolean;
  onClose: () => void;
  restaurantId: string | null;
  /** YYYY-MM-DD de la reserva */
  reservationDateYmd: string;
  tables: Table[];
  /** Mesa ya guardada: id Firestore (se normaliza a principal al abrir). */
  initialTableId?: string | null;
  /** Plano guardado en la reserva (prioridad sobre la mesa al abrir). */
  initialFloorPlanId?: string | null;
  /** Reserva en edición: se excluye del badge “reservada” para no ensuciar la mesa propia. */
  excludeReservationId?: string | null;
  onConfirm: (payload: ReservationFloorMapPickerConfirm) => void;
};

export function ReservationFloorMapPicker({
  open,
  onClose,
  restaurantId,
  reservationDateYmd,
  tables,
  initialTableId,
  initialFloorPlanId,
  excludeReservationId: _excludeReservationId,
  onConfirm,
}: ReservationFloorMapPickerProps) {
  const { user, ready: authReady } = useAuth();
  const { groupedTablesMapHandlers, groupedTables } = useTableGroups({
    restaurantId,
  });

  const [mobileMapGestures, setMobileMapGestures] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobileMapGestures(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [selectedFloorPlanId, setSelectedFloorPlanId] = useState<string | null>(
    null,
  );
  const [dayReservations, setDayReservations] = useState<Reservation[]>([]);
  const [occupiedTableIds, setOccupiedTableIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [occupancyStartMsByTable, setOccupancyStartMsByTable] = useState<
    Record<string, number>
  >({});

  const [selectedMainTableId, setSelectedMainTableId] = useState<string | null>(
    null,
  );

  const operationalFloorPlans = useMemo(
    () => floorPlans.filter((p) => p.active !== false),
    [floorPlans],
  );

  const didAlignPlanRef = useRef(false);

  const [livePreview, setLivePreview] = useState<
    | null
    | {
        kind: "reservation";
        reservation: Reservation;
        mainTableId: string;
      }
    | { kind: "occupied-only"; mainTableId: string }
  >(null);

  useEffect(() => {
    if (!open) setLivePreview(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const rid = restaurantId?.trim() ?? "";
    if (!rid || !isFirebaseConfigured || !authReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const [plans, zones] = await Promise.all([
          getFloorPlans(rid),
          getZones(rid),
        ]);
        if (cancelled) return;
        setFloorPlans(plans);
        setZonesList(zones);
        const op = plans.filter((p) => p.active !== false);
        const pool = op.length > 0 ? op : plans;
        setSelectedFloorPlanId((prev) => {
          if (prev && pool.some((p) => p.id === prev)) return prev;
          return (
            pool.find((p) => p.isDefault === true)?.id ??
            pool[0]?.id ??
            null
          );
        });
      } catch {
        if (!cancelled) {
          setFloorPlans([]);
          setZonesList([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, restaurantId, authReady]);

  useEffect(() => {
    if (!open) {
      didAlignPlanRef.current = false;
      return;
    }
    if (didAlignPlanRef.current) return;
    if (floorPlans.length === 0) return;
    const op = floorPlans.filter((p) => p.active !== false);
    const pool = op.length > 0 ? op : floorPlans;
    const initFp = String(initialFloorPlanId ?? "").trim();
    if (initFp && pool.some((p) => p.id === initFp)) {
      setSelectedFloorPlanId(initFp);
      didAlignPlanRef.current = true;
      return;
    }
    const raw = String(initialTableId ?? "").trim();
    if (raw) {
      const main =
        groupedTablesMapHandlers?.resolveMainTableId?.(raw) ?? raw;
      const t = tables.find(
        (x) => String(x.id).trim() === String(main).trim(),
      );
      const fp = t?.floorPlanId?.trim();
      if (fp && pool.some((p) => p.id === fp)) {
        setSelectedFloorPlanId(fp);
      }
    }
    didAlignPlanRef.current = true;
  }, [
    open,
    floorPlans,
    initialFloorPlanId,
    initialTableId,
    tables,
    groupedTablesMapHandlers,
  ]);

  useEffect(() => {
    if (!open) return;
    const op = floorPlans.filter((p) => p.active !== false);
    if (op.length === 0) return;
    if (
      !selectedFloorPlanId ||
      !op.some((p) => p.id === selectedFloorPlanId)
    ) {
      setSelectedFloorPlanId(
        op.find((p) => p.isDefault === true)?.id ?? op[0]?.id ?? null,
      );
    }
  }, [open, floorPlans, selectedFloorPlanId]);

  useEffect(() => {
    if (!open) return;
    const rid = restaurantId?.trim() ?? "";
    const d = reservationDateYmd.trim();
    if (!rid || !d || !authReady || !isFirebaseConfigured) {
      setDayReservations([]);
      return;
    }
    const unsub = listenReservationsForDate(rid, d, setDayReservations, () =>
      setDayReservations([]),
    );
    return () => unsub();
  }, [open, restaurantId, reservationDateYmd, authReady]);

  useEffect(() => {
    if (!open) {
      setOccupiedTableIds(new Set());
      setOccupancyStartMsByTable({});
      return;
    }
    const rid = restaurantId?.trim() ?? "";
    if (
      !rid ||
      !user?.uid ||
      !authReady ||
      !isFirebaseConfigured ||
      !isAuthReady()
    ) {
      setOccupiedTableIds(new Set());
      setOccupancyStartMsByTable({});
      return;
    }
    const q = query(collection(db, "orders"), where("restaurantId", "==", rid));
    const unsub = onSnapshot(q, (snapshot) => {
      const ids = new Set<string>();
      const startMs: Record<string, number> = {};
      for (const d of snapshot.docs) {
        const data = d.data() as {
          tableId?: string | null;
          status?: string;
          createdAt?: unknown;
          openedAt?: unknown;
          items?: unknown;
          total?: unknown;
        };
        if (!orderDocHasActiveLinesForMapOccupancy(data)) continue;
        const tid = typeof data.tableId === "string" ? data.tableId.trim() : "";
        if (!tid) continue;
        ids.add(tid);
        const openedMs = readOrderCreatedAtMs(data.openedAt);
        const createdMs = readOrderCreatedAtMs(data.createdAt);
        const ms = openedMs ?? createdMs;
        if (ms == null) continue;
        const prev = startMs[tid];
        if (prev == null || ms < prev) startMs[tid] = ms;
      }
      setOccupiedTableIds(ids);
      setOccupancyStartMsByTable(startMs);
    });
    return () => unsub();
  }, [open, restaurantId, user?.uid, authReady]);

  useEffect(() => {
    if (!open) {
      setSelectedMainTableId(null);
      return;
    }
    const raw = String(initialTableId ?? "").trim();
    if (!raw) {
      setSelectedMainTableId(null);
      return;
    }
    const main =
      groupedTablesMapHandlers?.resolveMainTableId?.(raw) ?? raw;
    setSelectedMainTableId(String(main).trim() || null);
  }, [open, initialTableId, groupedTablesMapHandlers]);

  const selectedFloorPlan = useMemo(() => {
    if (!selectedFloorPlanId) return null;
    return floorPlans.find((p) => p.id === selectedFloorPlanId) ?? null;
  }, [floorPlans, selectedFloorPlanId]);

  const planSize = useMemo(
    () => resolveFloorPlanCanvasSize(selectedFloorPlan, floorPlans),
    [selectedFloorPlan, floorPlans],
  );

  const planElementsForPicker = useMemo(() => {
    const activeElements = tables.filter(
      (element) => element.isActive !== false,
    );
    if (!selectedFloorPlanId) return activeElements;
    return activeElements.filter((element) =>
      entityBelongsToFloorPlan(element, selectedFloorPlanId, floorPlans),
    );
  }, [tables, selectedFloorPlanId, floorPlans]);

  const zonesForPicker = useMemo(() => {
    if (!selectedFloorPlanId) return zonesList;
    return zonesList.filter((zone) =>
      entityBelongsToFloorPlan(zone, selectedFloorPlanId, floorPlans),
    );
  }, [zonesList, selectedFloorPlanId, floorPlans]);

  const mapTablesForPicker = useMemo(() => {
    const list = filterTablesForTpvMap(planElementsForPicker);
    return [...list].sort(sortTablesForTpvMap);
  }, [planElementsForPicker]);

  const decorativePlanElementsForPicker = useMemo(
    () =>
      planElementsForPicker.filter((el) => isDecorativePlanElementType(el.type)),
    [planElementsForPicker],
  );

  const mapElementsForPickerRender = useMemo(() => {
    const tableIds = new Set(
      mapTablesForPicker.map((t) => String(t.id ?? "").trim()),
    );
    const decorative = decorativePlanElementsForPicker.filter(
      (el) => !tableIds.has(String(el.id ?? "").trim()),
    );
    return [...decorative, ...mapTablesForPicker];
  }, [decorativePlanElementsForPicker, mapTablesForPicker]);

  const tablesById = useMemo(() => {
    const m = new Map<string, Table>();
    for (const t of tables) {
      const id = String(t.id ?? "").trim();
      if (id) m.set(id, t);
    }
    return m;
  }, [tables]);

  const referenceMinutesFromMidnight = useMemo(() => {
    const isToday = reservationDateYmd.trim() === todayYmd();
    if (!isToday) return 0;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, [reservationDateYmd, open]);

  const resolveMain = useMemo(
    () => groupedTablesMapHandlers?.resolveMainTableId ?? ((x: string) => x),
    [groupedTablesMapHandlers],
  );

  const applyReservationPressure = useMemo(
    () => reservationDateYmd.trim() === todayYmd(),
    [reservationDateYmd],
  );

  const displayReservationByTableId = useMemo(
    () =>
      buildDisplayReservationByTableIdForMap(dayReservations, resolveMain, {
        referenceMinutesFromMidnight,
      }),
    [dayReservations, resolveMain, referenceMinutesFromMidnight],
  );

  const reservationPressureByTableId = useMemo(
    () =>
      buildReservationPressureByTableIdForMap(dayReservations, resolveMain, {
        applyPressure: applyReservationPressure,
        referenceMinutesFromMidnight,
      }),
    [
      dayReservations,
      resolveMain,
      applyReservationPressure,
      referenceMinutesFromMidnight,
    ],
  );

  const mapAutoFitKey = useMemo(() => {
    const planKey = selectedFloorPlanId ?? "legacy";
    return [
      planKey,
      planSize.width,
      planSize.height,
      mapElementsForPickerRender.length,
      mapElementsForPickerRender
        .map((element) =>
          [
            element.id,
            element.type,
            element.x,
            element.y,
            element.width,
            element.height,
          ].join(":"),
        )
        .join("|"),
    ].join("|");
  }, [
    selectedFloorPlanId,
    planSize.width,
    planSize.height,
    mapElementsForPickerRender,
  ]);

  const selectedTableRow = useMemo(() => {
    if (!selectedMainTableId) return null;
    return tablesById.get(selectedMainTableId) ?? null;
  }, [selectedMainTableId, tablesById]);

  const assignDisabledReason = useMemo(() => {
    if (!selectedMainTableId) return "Elige una mesa en el plano.";
    if (
      isClusterBusy(
        selectedMainTableId,
        occupiedTableIds,
        groupedTables,
      )
    ) {
      return "Mesa ocupada ahora; no se puede asignar desde aquí.";
    }
    return null;
  }, [selectedMainTableId, occupiedTableIds, groupedTables]);

  const handleTablePick = useCallback(
    (tableId: string) => {
      const id = String(tableId ?? "").trim();
      if (!id) return;
      const main =
        String(
          groupedTablesMapHandlers?.resolveMainTableId?.(id) ?? id,
        ).trim() || id;
      const busy = isClusterBusy(main, occupiedTableIds, groupedTables);
      const displayRes = displayReservationByTableId[main];
      const followBooked = busy
        ? nextBookedReservationForMainTable(
            dayReservations,
            main,
            resolveMain,
            { referenceMinutesFromMidnight },
          )
        : null;

      if (busy) {
        if (followBooked) {
          setSelectedMainTableId(null);
          setLivePreview({
            kind: "reservation",
            reservation: followBooked,
            mainTableId: main,
          });
          return;
        }
        setSelectedMainTableId(null);
        setLivePreview({ kind: "occupied-only", mainTableId: main });
        return;
      }

      if (displayRes) {
        setSelectedMainTableId(null);
        setLivePreview({
          kind: "reservation",
          reservation: displayRes,
          mainTableId: main,
        });
        return;
      }

      setLivePreview(null);
      setSelectedMainTableId(main);
    },
    [
      groupedTablesMapHandlers,
      occupiedTableIds,
      groupedTables,
      displayReservationByTableId,
      dayReservations,
      resolveMain,
      referenceMinutesFromMidnight,
    ],
  );

  const handleMapWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement | null;
    if (
      t?.closest(
        "input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']",
      )
    ) {
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    const oe = e.nativeEvent;
    if (typeof oe.deltaX === "number" && typeof oe.deltaY === "number") {
      e.preventDefault();
      e.currentTarget.scrollLeft += oe.deltaX;
      e.currentTarget.scrollTop += oe.deltaY;
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (!selectedMainTableId || assignDisabledReason) return;
    const table = tablesById.get(selectedMainTableId);
    if (!table) return;
    const plan =
      floorPlans.find((p) => p.id === selectedFloorPlanId) ?? null;
    onConfirm({
      tableId: table.id,
      tableLabel: table.name,
      floorPlanId: selectedFloorPlanId?.trim() ?? "",
      floorName: plan?.name?.trim() ?? "",
      zoneId: table.zoneId ?? "",
      zoneName: table.zoneName ?? table.zone ?? "",
    });
  }, [
    selectedMainTableId,
    assignDisabledReason,
    tablesById,
    onConfirm,
    floorPlans,
    selectedFloorPlanId,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (livePreview) {
        e.preventDefault();
        e.stopPropagation();
        setLivePreview(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, livePreview]);

  if (!open) return null;

  const surfaceBg = "var(--hostly-surface-card-solid, #f8fafc)";

  return (
    <div
      className="fixed inset-0 z-[2200] flex items-stretch justify-center"
      style={{
        background: "rgba(15, 23, 42, 0.28)",
        backdropFilter: "blur(2px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hostly-res-map-picker-title"
    >
      <div
        className="flex min-h-0 w-full max-w-[1100px] flex-col shadow-xl md:m-4 md:max-h-[calc(100dvh-32px)] md:rounded-2xl"
        style={{
          background: surfaceBg,
          border: "1px solid var(--hostly-line, rgba(148,163,184,0.35))",
        }}
      >
        <header
          className="shrink-0 border-b px-4 py-3 md:px-5"
          style={{ borderColor: "var(--hostly-line, rgba(148,163,184,0.35))" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="hostly-res-map-picker-title"
                className="m-0 text-lg font-bold text-[var(--hostly-navy-deep,#0f172a)]"
              >
                Elegir mesa en plano
              </h2>
              <p className="mt-1 m-0 text-sm text-[var(--hostly-ink-muted,#64748b)]">
                Toca una mesa libre o reservada. Las mesas con comanda activa no se
                pueden asignar desde aquí.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {operationalFloorPlans.length > 1 ? (
                <label className="flex flex-col gap-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--hostly-navy-mid,#334155)]">
                  Plano
                  <select
                    className="hostly-select !min-h-9 !text-sm"
                    value={selectedFloorPlanId ?? ""}
                    onChange={(e) =>
                      setSelectedFloorPlanId(e.target.value.trim() || null)
                    }
                  >
                    {operationalFloorPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="hostly-button-secondary !min-h-9"
                onClick={onClose}
              >
                Cerrar
              </button>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            className="shrink-0 border-b px-4 py-2 md:px-5"
            style={{ borderColor: "var(--hostly-line, rgba(148,163,184,0.35))" }}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold text-[var(--hostly-navy-deep,#0f172a)] md:text-[12px]">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: "#dff0e4" }}
                  aria-hidden
                />
                Libre
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    background: "linear-gradient(180deg, #eef2ff 0%, #e8e0f5 100%)",
                  }}
                  aria-hidden
                />
                Reserva
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    background: "linear-gradient(180deg, #e0f2fe 0%, #dbeafe 100%)",
                  }}
                  aria-hidden
                />
                En sala
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    background: "linear-gradient(180deg, #f1f5f9 0%, #e8edf3 100%)",
                  }}
                  aria-hidden
                />
                Cerrada
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    background: "linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)",
                  }}
                  aria-hidden
                />
                No show
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: "#dcecf3" }}
                  aria-hidden
                />
                Ocupada
              </span>
              <span className="inline-flex items-center gap-1.5 text-[var(--hostly-ink-muted,#64748b)]">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-[rgba(63,100,120,0.35)]"
                  style={{ background: "rgba(255,255,255,0.85)" }}
                  aria-hidden
                />
                Agrupada (+N)
              </span>
            </div>
          </div>

          <div className="relative min-h-[280px] flex-1 overflow-auto bg-[#f1f5f9]">
            {mapTablesForPicker.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm font-semibold text-[#64748b]">
                No hay mesas en este plano. Usa el selector de mesa o revisa el
                editor de plano.
              </div>
            ) : (
              <div
                className="relative h-[min(520px,calc(100dvh-280px))] min-h-[320px] w-full md:h-[min(560px,calc(100dvh-320px))]"
                onWheel={handleMapWheel}
              >
                <PinchZoomMap
                  enabled={mobileMapGestures}
                  minZoom={0.6}
                  maxZoom={2.5}
                  initialZoom={1}
                >
                  <EditableFloorMap
                    editable={false}
                    editorPlanSurface
                    editorVisualPreset="premium"
                    mapLayoutEmphasis
                    hideZoneOverlays
                    viewportFitPaddingPx={16}
                    viewportFitMode="content"
                    viewportFitElements={planElementsForPicker}
                    viewportFitZones={zonesForPicker}
                    viewportFitZoomMax={1.78}
                    mapAutoFitKey={mapAutoFitKey}
                    floorSurfacePreset="ice"
                    planSize={planSize}
                    elements={mapElementsForPickerRender}
                    zones={zonesForPicker.map((z) => ({
                      id: z.id,
                      name: z.name,
                      color: z.color,
                      x: z.x,
                      y: z.y,
                      width: z.width,
                      height: z.height,
                    }))}
                    renderElement={(ctx) => {
                      const tableId = ctx.elementId;
                      if (isDecorativePlanElementType(ctx.element.type)) {
                        return (
                          <div
                            aria-hidden
                            style={pickerDecorativeStyle(
                              ctx.element,
                              ctx.mapLayoutX,
                              ctx.mapLayoutY,
                              ctx.mapTileWidth,
                              ctx.mapTileHeight,
                            )}
                          />
                        );
                      }
                      if (
                        groupedTablesMapHandlers?.isJoinedSecondaryTable?.(
                          tableId,
                        )
                      ) {
                        return null;
                      }
                      const stableTable =
                        tablesById.get(tableId) ?? ctx.element;
                      const busy = isClusterBusy(
                        tableId,
                        occupiedTableIds,
                        groupedTables,
                      );
                      const tileVisual = busy ? "busy-short" : "free";
                      const displayRes = displayReservationByTableId[tableId];
                      const pressureRow = reservationPressureByTableId[tableId];
                      const reservationPressure = pressureRow
                        ? {
                            type: pressureRow.type,
                            time: pressureRow.time,
                          }
                        : null;
                      const groupedBadgeText =
                        groupedTablesMapHandlers?.getGroupedBadgeText?.(
                          tableId,
                        ) ?? null;
                      const nextBk = busy
                        ? nextBookedReservationForMainTable(
                            dayReservations,
                            tableId,
                            resolveMain,
                            { referenceMinutesFromMidnight },
                          )
                        : null;
                      const followHint =
                        busy && nextBk
                          ? `Reserva ${nextBk.time} · ${nextBk.partySize}p`
                          : null;
                      const liveTone =
                        !busy && displayRes
                          ? liveToneFromReservationStatus(displayRes.status)
                          : null;
                      const chipStyle = displayRes
                        ? overlayStatusChipStyle(displayRes.status)
                        : null;
                      const showNameOverlay = Boolean(!busy && displayRes);

                      return (
                        <Fragment key={stableTable.id}>
                          <ElementCard
                            table={stableTable}
                            tableId={tableId}
                            busy={busy}
                            tileVisual={tileVisual}
                            durationLabel={null}
                            showProductCount={false}
                            activeLineCount={0}
                            badgeTier="low"
                            isCriticalTable={false}
                            ariaLabel={
                              busy
                                ? `${String(stableTable.name ?? "").trim()}, ocupada`
                                : displayRes
                                  ? `${displayRes.customerName}, ${reservationStatusChipLabel(displayRes.status)}`
                                  : undefined
                            }
                            mapLibreLabel=""
                            onTableClick={() => handleTablePick(tableId)}
                            occupancyStart={
                              occupancyStartMsByTable[tableId] ?? 0
                            }
                            priority={0}
                            prefersReducedMotion={prefersReducedMotion}
                            isUltraFastMode={false}
                            mapLayoutX={ctx.mapLayoutX}
                            mapLayoutY={ctx.mapLayoutY}
                            mapTileWidth={ctx.mapTileWidth}
                            mapTileHeight={ctx.mapTileHeight}
                            tableShape={
                              stableTable.tableShape === "round"
                                ? "round"
                                : "square"
                            }
                            seats={stableTable.seats}
                            tableMapStatus={
                              stableTable.status ?? TABLE_MAP_STATUS_FREE
                            }
                            hasOpenOrder={busy}
                            priorityLevel={0}
                            reservationBadge={null}
                            reservationPressure={reservationPressure}
                            readyToClose={false}
                            groupedBadgeText={groupedBadgeText}
                            mapJoinDragEnabled={false}
                            showVisualChairs
                            isMapGroupedPrimary={Boolean(
                              groupedTablesMapHandlers?.isGroupedPrimaryTable?.(
                                tableId,
                              ),
                            )}
                            isMapGroupedSelectionElevated={
                              selectedMainTableId === tableId
                            }
                            reservasLiveTone={liveTone}
                            reservasLiveFollowUpHint={followHint}
                          />
                          {showNameOverlay && displayRes && chipStyle ? (
                            <div
                              data-hostly-reservas-overlay
                              data-hostly-reservation-id={displayRes.id}
                              data-hostly-table-main-id={tableId}
                              style={{
                                position: "absolute",
                                left: ctx.mapLayoutX,
                                top: ctx.mapLayoutY,
                                width: ctx.mapTileWidth,
                                height: ctx.mapTileHeight,
                                pointerEvents: "none",
                                zIndex: 12,
                                boxSizing: "border-box",
                                padding: "5px 6px 4px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "stretch",
                                justifyContent: "flex-start",
                                gap: 3,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 750,
                                  lineHeight: 1.15,
                                  color: "#0f172a",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  letterSpacing: "-0.01em",
                                }}
                              >
                                {displayRes.customerName || "—"}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                  gap: 4,
                                  minWidth: 0,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 750,
                                    fontVariantNumeric: "tabular-nums",
                                    color: "#334155",
                                  }}
                                >
                                  {displayRes.time}
                                </span>
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 650,
                                    color: "#64748b",
                                  }}
                                >
                                  {displayRes.partySize} pax
                                </span>
                                <span
                                  style={{
                                    fontSize: 8.5,
                                    fontWeight: 780,
                                    letterSpacing: "0.05em",
                                    textTransform: "uppercase",
                                    padding: "2px 6px",
                                    borderRadius: 999,
                                    ...chipStyle,
                                  }}
                                >
                                  {reservationStatusChipLabel(
                                    displayRes.status
                                  )}
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </Fragment>
                      );
                    }}
                  />
                </PinchZoomMap>
                {livePreview ? (
                  <div
                    data-hostly-reservas-preview
                    className="pointer-events-auto absolute bottom-2.5 left-2 right-2 z-[50] max-h-[min(220px,38vh)] w-auto max-w-[380px] overflow-y-auto rounded-xl px-3 py-2.5 md:left-auto md:right-3 md:w-[min(380px,calc(100%-24px))]"
                    style={{
                      border: "1px solid rgba(148, 163, 184, 0.38)",
                      background: "var(--hostly-surface-card-solid, #ffffff)",
                      boxShadow:
                        "0 10px 32px rgba(15, 23, 42, 0.12), 0 1px 0 rgba(255,255,255,0.9) inset",
                    }}
                    role="region"
                    aria-label="Detalle contextual"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748b]">
                          Mesa
                        </div>
                        <div className="truncate text-sm font-bold text-[#0f172a]">
                          {tablesById.get(livePreview.mainTableId)?.name ??
                            livePreview.mainTableId}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-lg font-light leading-none text-[#475569] hover:bg-[#f1f5f9]"
                        style={{ borderColor: "rgba(148, 163, 184, 0.45)" }}
                        aria-label="Cerrar detalle"
                        onClick={() => setLivePreview(null)}
                      >
                        ×
                      </button>
                    </div>
                    {livePreview.kind === "occupied-only" ? (
                      <>
                        <p className="mb-0 mt-2.5 text-sm font-semibold text-[#0f172a]">
                          Comanda activa
                        </p>
                        <p className="mt-1.5 text-xs leading-snug text-[#64748b]">
                          Esta mesa tiene consumo abierto. Si hay otra reserva,
                          aparecerá como chip sobre la ficha.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <span
                            className="truncate text-base font-bold text-[#0f172a]"
                            data-hostly-preview-customer
                          >
                            {livePreview.reservation.customerName || "—"}
                          </span>
                          <span
                            style={{
                              ...overlayStatusChipStyle(
                                livePreview.reservation.status,
                              ),
                              fontSize: 9,
                              fontWeight: 780,
                              letterSpacing: "0.05em",
                              textTransform: "uppercase",
                              padding: "3px 8px",
                              borderRadius: 999,
                            }}
                          >
                            {reservationStatusChipLabel(
                              livePreview.reservation.status,
                            )}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#475569]">
                          <span className="tabular-nums">
                            {livePreview.reservation.time}
                          </span>
                          <span>{livePreview.reservation.partySize} pax</span>
                        </div>
                        {livePreview.reservation.notes?.trim() ? (
                          <p
                            className="mt-2 mb-0 rounded-lg border px-2 py-1.5 text-xs leading-snug text-[#475569]"
                            style={{
                              borderColor: "rgba(148, 163, 184, 0.35)",
                              background: "rgba(248, 250, 252, 0.85)",
                            }}
                          >
                            {livePreview.reservation.notes.trim()}
                          </p>
                        ) : null}
                      </>
                    )}
                    <div
                      className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5"
                      style={{ borderColor: "rgba(148, 163, 184, 0.35)" }}
                      data-hostly-preview-actions-row
                    >
                      <button
                        type="button"
                        disabled
                        data-hostly-action-placeholder="seat"
                        title="Próximamente"
                        className="cursor-not-allowed rounded-lg border px-2.5 py-1.5 text-[11px] font-bold opacity-50"
                        style={{
                          borderColor: "rgba(148, 163, 184, 0.45)",
                          color: "#334155",
                          background: "#fff",
                        }}
                      >
                        Sentar
                      </button>
                      <button
                        type="button"
                        disabled
                        data-hostly-action-placeholder="edit"
                        title="Próximamente"
                        className="cursor-not-allowed rounded-lg border px-2.5 py-1.5 text-[11px] font-bold opacity-50"
                        style={{
                          borderColor: "rgba(148, 163, 184, 0.45)",
                          color: "#334155",
                          background: "#fff",
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled
                        data-hostly-action-placeholder="release"
                        title="Próximamente"
                        className="cursor-not-allowed rounded-lg border px-2.5 py-1.5 text-[11px] font-bold opacity-50"
                        style={{
                          borderColor: "rgba(148, 163, 184, 0.45)",
                          color: "#334155",
                          background: "#fff",
                        }}
                      >
                        Liberar
                      </button>
                    </div>
                    <p className="mb-0 mt-2 text-[10px] font-medium italic text-[#94a3b8]">
                      Roadmap: drag entre mesas, doble turno, SLA retraso, VIP
                      por zona.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <footer
          className="shrink-0 border-t px-4 py-3 md:px-5"
          style={{
            borderColor: "var(--hostly-line, rgba(148,163,184,0.35))",
            background: surfaceBg,
          }}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 text-sm font-semibold text-[var(--hostly-navy-deep,#0f172a)]">
              {selectedTableRow ? (
                <span>
                  Mesa seleccionada:{" "}
                  <span className="text-[var(--hostly-accent,#0d9488)]">
                    {selectedTableRow.name}
                  </span>
                </span>
              ) : (
                <span className="text-[var(--hostly-ink-muted,#64748b)]">
                  Mesa libre: pulsa para asignar. Con reserva u ocupación: pulsa
                  para ver detalle.
                </span>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="hostly-button-secondary !min-h-10"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="hostly-button-primary !min-h-10 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={Boolean(assignDisabledReason)}
                title={assignDisabledReason ?? undefined}
                onClick={handleConfirm}
              >
                Asignar mesa
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
