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

const EMPTY_WAITERS: OperationWaiter[] = [];
const EMPTY_ZONES: OperationZone[] = [];
const EMPTY_WAITER_BY_TABLE: Record<string, string> = {};
const EMPTY_ZONE_BY_TABLE: Record<string, TableZoneInfo> = {};

export function OperationFilterProvider({ children }: { children: ReactNode }) {
  const { user, restaurantId, ready, profileReady } = useAuth();
  const [waiterFilter, setWaiterFilter] =
    useState<OperationWaiterFilter>("all");
  const [zoneFilter, setZoneFilter] = useState<OperationZoneFilter>("all");
  const [waitersReloadToken, setWaitersReloadToken] = useState(0);
  const rid = restaurantId?.trim() ?? "";
  const rosterKey = `${rid}:${waitersReloadToken}`;
  const canLoadRoster = Boolean(
    ready && profileReady && user?.uid && isFirebaseConfigured && rid,
  );
  const [rosterSnapshot, setRosterSnapshot] = useState<{
    key: string;
    waiters: OperationWaiter[];
    status: OperationRosterLoadStatus;
    errorKind: RestaurantRosterErrorKind | null;
  } | null>(null);
  const currentRoster =
    canLoadRoster && rosterSnapshot?.key === rosterKey
      ? rosterSnapshot
      : null;
  const waiters = currentRoster?.waiters ?? EMPTY_WAITERS;
  const waitersLoadStatus: OperationRosterLoadStatus = canLoadRoster
    ? (currentRoster?.status ?? "loading")
    : "idle";
  const waitersErrorKind = currentRoster?.errorKind ?? null;

  const canLoadTables = Boolean(ready && isFirebaseConfigured && rid);
  const [tablesSnapshot, setTablesSnapshot] = useState<{
    restaurantId: string;
    tableWaiterById: Record<string, string>;
    tableZoneById: Record<string, TableZoneInfo>;
    zones: OperationZone[];
  } | null>(null);
  const currentTables =
    canLoadTables && tablesSnapshot?.restaurantId === rid
      ? tablesSnapshot
      : null;
  const tableWaiterById = currentTables?.tableWaiterById ?? EMPTY_WAITER_BY_TABLE;
  const tableZoneById = currentTables?.tableZoneById ?? EMPTY_ZONE_BY_TABLE;
  const zones = currentTables?.zones ?? EMPTY_ZONES;

  /** Último usuario para logs de snapshot sin meter `user` en deps (objeto inestable / tamaño de array). */
  const tablesSnapAuthUidRef = useRef<string | null>(null);
  const tablesSnapAuthEmailRef = useRef<string | null>(null);
  useEffect(() => {
    tablesSnapAuthUidRef.current = user?.uid ?? null;
    tablesSnapAuthEmailRef.current =
      typeof user?.email === "string" ? user.email : null;
  }, [user?.email, user?.uid]);

  useEffect(() => {
    if (!canLoadRoster || !user) return;
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
        setRosterSnapshot({
          key: rosterKey,
          waiters: mapped,
          status: "ready",
          errorKind: null,
        });
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setRosterSnapshot({
            key: rosterKey,
            waiters: [],
            status: "error",
            errorKind:
              error instanceof RestaurantRosterError
                ? error.kind
                : "network",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canLoadRoster, rid, rosterKey, user]);

  const retryWaiters = useCallback(() => {
    setWaitersReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!canLoadTables) return;
    const q = query(
      collection(db, "tables"),
      where("restaurantId", "==", rid),
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
      setTablesSnapshot({
        restaurantId: rid,
        tableWaiterById: waiterMap,
        tableZoneById: zoneMap,
        zones: list,
      });
    }, (err) => {
      console.error(err);
      logFirestorePermissionError(
        {
          file: "components/kds/operation-filter-context.tsx",
          op: "onSnapshot",
          path: `tables (where restaurantId==${rid})`,
          restaurantId: rid,
          uid: tablesSnapAuthUidRef.current,
          email: tablesSnapAuthEmailRef.current,
        },
        err,
      );
    });
    return () => unsub();
  }, [canLoadTables, rid]);

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
