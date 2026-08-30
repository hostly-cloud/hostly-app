"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  getUsersByRestaurant,
  RestaurantRosterError,
  type RestaurantRosterErrorKind,
} from "@/lib/firestore/users";
import { logFirestorePermissionError } from "@/lib/firestore/log-firestore-permission-error";
import { operationZoneFilterId } from "@/lib/operacion/operation-zone-filter";

export type OperationWaiterFilter = "all" | "me" | string;

export type OperationZoneFilter = "all" | "unassigned" | string;

export type OperationWaiter = {
  id: string;
  name: string;
};

export type OperationRosterLoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export type OperationZone = {
  id: string;
  name: string;
};

export type OperationFilterOrderLike = {
  waiterId?: unknown;
  tableId?: unknown;
};

type TableZoneInfo = {
  zoneId: string | null;
  zoneName: string | null;
};

type Ctx = {
  waiterFilter: OperationWaiterFilter;
  setWaiterFilter: (f: OperationWaiterFilter) => void;
  zoneFilter: OperationZoneFilter;
  setZoneFilter: (f: OperationZoneFilter) => void;
  waiters: OperationWaiter[];
  waitersLoadStatus: OperationRosterLoadStatus;
  waitersErrorKind: RestaurantRosterErrorKind | null;
  retryWaiters: () => void;
  zones: OperationZone[];
  tableWaiterById: Record<string, string>;
  tableZoneById: Record<string, TableZoneInfo>;
  currentUserId: string | undefined;
  matchesOrder: (order: OperationFilterOrderLike) => boolean;
};

const defaultCtx: Ctx = {
  waiterFilter: "all",
  setWaiterFilter: () => {},
  zoneFilter: "all",
  setZoneFilter: () => {},
  waiters: [],
  waitersLoadStatus: "idle",
  waitersErrorKind: null,
  retryWaiters: () => {},
  zones: [],
  tableWaiterById: {},
  tableZoneById: {},
  currentUserId: undefined,
  matchesOrder: () => true,
};

const OperationFilterCtx = createContext<Ctx>(defaultCtx);

function readUserDisplayName(row: Record<string, unknown>): string {
  const display =
    typeof row.displayName === "string" ? row.displayName.trim() : "";
  if (display) return display;
  const nombre = typeof row.nombre === "string" ? row.nombre.trim() : "";
  if (nombre) return nombre;
  const email = typeof row.email === "string" ? row.email.trim() : "";
  if (email.includes("@")) return email.split("@")[0] ?? email;
  return email || "—";
}

function readString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function OperationFilterProvider({ children }: { children: ReactNode }) {
  const { user, restaurantId, ready, profileReady } = useAuth();
  const [waiterFilter, setWaiterFilter] =
    useState<OperationWaiterFilter>("all");
  const [zoneFilter, setZoneFilter] = useState<OperationZoneFilter>("all");
  const [waiters, setWaiters] = useState<OperationWaiter[]>([]);
  const [waitersLoadStatus, setWaitersLoadStatus] =
    useState<OperationRosterLoadStatus>("idle");
  const [waitersErrorKind, setWaitersErrorKind] =
    useState<RestaurantRosterErrorKind | null>(null);
  const [waitersReloadToken, setWaitersReloadToken] = useState(0);
  const [tableWaiterById, setTableWaiterById] = useState<
    Record<string, string>
  >({});
  const [tableZoneById, setTableZoneById] = useState<
    Record<string, TableZoneInfo>
  >({});
  const [zones, setZones] = useState<OperationZone[]>([]);

  /** Último usuario para logs de snapshot sin meter `user` en deps (objeto inestable / tamaño de array). */
  const tablesSnapAuthUidRef = useRef<string | null>(null);
  const tablesSnapAuthEmailRef = useRef<string | null>(null);
  tablesSnapAuthUidRef.current = user?.uid ?? null;
  tablesSnapAuthEmailRef.current =
    typeof user?.email === "string" ? user.email : null;

  useEffect(() => {
    const rid = restaurantId?.trim() ?? "";
    if (!ready || !profileReady || !user?.uid || !isFirebaseConfigured || !rid) {
      setWaiters([]);
      setWaitersLoadStatus("idle");
      setWaitersErrorKind(null);
      return;
    }
    setWaiters([]);
    setWaitersLoadStatus("loading");
    setWaitersErrorKind(null);
    let cancelled = false;
    void (async () => {
      try {
        const list = await getUsersByRestaurant({ restaurantId: rid, user });
        if (cancelled) return;
        const mapped: OperationWaiter[] = (list as Record<string, unknown>[])
          .map((u) => ({
            id: String(u.id ?? ""),
            name: readUserDisplayName(u),
          }))
          .filter((u) => u.id);
        mapped.sort((a, b) => a.name.localeCompare(b.name, "es"));
        setWaiters(mapped);
        setWaitersLoadStatus("ready");
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setWaitersLoadStatus("error");
          setWaitersErrorKind(
            error instanceof RestaurantRosterError
              ? error.kind
              : "network",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, profileReady, user, restaurantId, waitersReloadToken]);

  const retryWaiters = useCallback(() => {
    setWaitersReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!ready || !isFirebaseConfigured || !restaurantId) {
      setTableWaiterById({});
      setTableZoneById({});
      setZones([]);
      return;
    }
    const q = query(
      collection(db, "tables"),
      where("restaurantId", "==", restaurantId),
    );
    const unsub = onSnapshot(q, (snap) => {
      const waiterMap: Record<string, string> = {};
      const zoneMap: Record<string, TableZoneInfo> = {};
      const zonesByKey = new Map<string, string>();
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const w = readString(data.waiterId);
        if (w) waiterMap[d.id] = w;
        const zoneId = readString(data.zoneId);
        const zoneName = readString(data.zoneName);
        const legacyZone = readString(data.zone);
        const effectiveId = zoneId || legacyZone || "";
        const effectiveName =
          zoneName || legacyZone || (zoneId ? zoneId : "");
        const filterZoneId = operationZoneFilterId(effectiveName || effectiveId);
        zoneMap[d.id] = {
          zoneId: filterZoneId || null,
          zoneName: effectiveName || null,
        };
        if (filterZoneId && !zonesByKey.has(filterZoneId)) {
          zonesByKey.set(filterZoneId, effectiveName || effectiveId);
        }
      }
      const list: OperationZone[] = Array.from(zonesByKey.entries()).map(
        ([id, name]) => ({ id, name }),
      );
      list.sort((a, b) => a.name.localeCompare(b.name, "es"));
      setTableWaiterById(waiterMap);
      setTableZoneById(zoneMap);
      setZones(list);
    }, (err) => {
      console.error(err);
      logFirestorePermissionError(
        {
          file: "components/kds/operation-filter-context.tsx",
          op: "onSnapshot",
          path: `tables (where restaurantId==${restaurantId})`,
          restaurantId,
          uid: tablesSnapAuthUidRef.current,
          email: tablesSnapAuthEmailRef.current,
        },
        err,
      );
    });
    return () => unsub();
  }, [ready, restaurantId]);

  const currentUserId = user?.uid;

  const matchesOrder = useCallback(
    (order: OperationFilterOrderLike) => {
      const tableId = readString(order.tableId);

      if (waiterFilter !== "all") {
        const orderWaiter = readString(order.waiterId);
        const tableWaiter = tableId ? tableWaiterById[tableId] : undefined;
        const effectiveWaiter = orderWaiter || tableWaiter || null;
        if (waiterFilter === "me") {
          if (!currentUserId || effectiveWaiter !== currentUserId) return false;
        } else if (effectiveWaiter !== waiterFilter) {
          return false;
        }
      }

      if (zoneFilter !== "all") {
        const info = tableId ? tableZoneById[tableId] : undefined;
        const effectiveZone = info?.zoneId ?? null;
        if (zoneFilter === "unassigned") {
          if (effectiveZone) return false;
        } else if (effectiveZone !== zoneFilter) {
          return false;
        }
      }

      return true;
    },
    [
      waiterFilter,
      zoneFilter,
      tableWaiterById,
      tableZoneById,
      currentUserId,
    ],
  );

  const value = useMemo<Ctx>(
    () => ({
      waiterFilter,
      setWaiterFilter,
      zoneFilter,
      setZoneFilter,
      waiters,
      waitersLoadStatus,
      waitersErrorKind,
      retryWaiters,
      zones,
      tableWaiterById,
      tableZoneById,
      currentUserId,
      matchesOrder,
    }),
    [
      waiterFilter,
      zoneFilter,
      waiters,
      waitersLoadStatus,
      waitersErrorKind,
      retryWaiters,
      zones,
      tableWaiterById,
      tableZoneById,
      currentUserId,
      matchesOrder,
    ],
  );

  return (
    <OperationFilterCtx.Provider value={value}>
      {children}
    </OperationFilterCtx.Provider>
  );
}

export function useOperationFilter(): Ctx {
  return useContext(OperationFilterCtx);
}
