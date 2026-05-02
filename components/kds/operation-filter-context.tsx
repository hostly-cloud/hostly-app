"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { getUsersByRestaurant } from "@/lib/firestore/users";

export type OperationWaiterFilter = "all" | "me" | string;

export type OperationZoneFilter = "all" | "unassigned" | string;

export type OperationWaiter = {
  id: string;
  name: string;
};

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
  const { user, restaurantId, ready } = useAuth();
  const [waiterFilter, setWaiterFilter] =
    useState<OperationWaiterFilter>("all");
  const [zoneFilter, setZoneFilter] = useState<OperationZoneFilter>("all");
  const [waiters, setWaiters] = useState<OperationWaiter[]>([]);
  const [tableWaiterById, setTableWaiterById] = useState<
    Record<string, string>
  >({});
  const [tableZoneById, setTableZoneById] = useState<
    Record<string, TableZoneInfo>
  >({});
  const [zones, setZones] = useState<OperationZone[]>([]);

  useEffect(() => {
    if (!ready || !isFirebaseConfigured || !restaurantId) {
      setWaiters([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await getUsersByRestaurant(restaurantId);
        if (cancelled) return;
        const mapped: OperationWaiter[] = (list as Record<string, unknown>[])
          .map((u) => ({
            id: String(u.id ?? ""),
            name: readUserDisplayName(u),
          }))
          .filter((u) => u.id);
        mapped.sort((a, b) => a.name.localeCompare(b.name, "es"));
        setWaiters(mapped);
      } catch {
        if (!cancelled) setWaiters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, restaurantId]);

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
        zoneMap[d.id] = {
          zoneId: effectiveId || null,
          zoneName: effectiveName || null,
        };
        if (effectiveId) {
          const existing = zonesByKey.get(effectiveId);
          if (!existing || (effectiveName && existing !== effectiveName)) {
            zonesByKey.set(effectiveId, effectiveName || effectiveId);
          }
        }
      }
      const list: OperationZone[] = Array.from(zonesByKey.entries()).map(
        ([id, name]) => ({ id, name }),
      );
      list.sort((a, b) => a.name.localeCompare(b.name, "es"));
      setTableWaiterById(waiterMap);
      setTableZoneById(zoneMap);
      setZones(list);
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
