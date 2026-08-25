"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardItem } from "@/components/kds/order-items-board";
import { useAuth } from "@/components/auth/auth-context";
import { listenOperationStations } from "@/lib/firestore/operation-stations";
import {
  KDS_OPERATION_STATION_FILTER_ALL,
  kdsOperationStationAllLabel,
  matchesKdsBoardItemFilter,
  type KdsOperationStationFilterScope,
} from "@/lib/kds/operation-station-kds-filter";
import {
  sortOperationStations,
  type OperationStationDocument,
} from "@/lib/operacion/operation-station-types";

const KDS_STATION_STORAGE_PREFIX = "hostly:kds-operation-station";

function stationStorageKey(
  restaurantId: string,
  scope: KdsOperationStationFilterScope,
) {
  return `${KDS_STATION_STORAGE_PREFIX}:${restaurantId}:${scope}`;
}

function readStoredStationId(
  restaurantId: string,
  scope: KdsOperationStationFilterScope,
) {
  if (typeof window === "undefined") {
    return KDS_OPERATION_STATION_FILTER_ALL;
  }

  try {
    const stored = window.localStorage.getItem(
      stationStorageKey(restaurantId, scope),
    );
    return stored?.trim() || KDS_OPERATION_STATION_FILTER_ALL;
  } catch {
    return KDS_OPERATION_STATION_FILTER_ALL;
  }
}

function writeStoredStationId(
  restaurantId: string,
  scope: KdsOperationStationFilterScope,
  stationId: string,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      stationStorageKey(restaurantId, scope),
      stationId,
    );
  } catch {
    // localStorage can be unavailable in private/restricted browser contexts.
  }
}

export function useOperationStationKdsFilter(scope: KdsOperationStationFilterScope) {
  const { restaurantId, ready: authReady } = useAuth();
  const [stations, setStations] = useState<OperationStationDocument[]>([]);
  const [selectedOperationStationId, setSelectedOperationStationId] = useState(
    KDS_OPERATION_STATION_FILTER_ALL,
  );
  const [selectionRestored, setSelectionRestored] = useState(false);

  useEffect(() => {
    const rid = restaurantId?.trim() ?? "";
    if (!authReady || !rid) {
      setStations([]);
      setSelectedOperationStationId(KDS_OPERATION_STATION_FILTER_ALL);
      setSelectionRestored(false);
      return;
    }

    setSelectedOperationStationId(readStoredStationId(rid, scope));
    setSelectionRestored(true);
    return listenOperationStations(rid, setStations);
  }, [authReady, restaurantId, scope]);

  const activeStationsForScope = useMemo(
    () =>
      sortOperationStations(
        stations.filter((s) => s.active && s.type === scope),
      ),
    [stations, scope],
  );

  useEffect(() => {
    if (!selectionRestored) return;
    if (selectedOperationStationId === KDS_OPERATION_STATION_FILTER_ALL) {
      return;
    }
    const stillValid = activeStationsForScope.some(
      (s) => s.id === selectedOperationStationId,
    );
    if (!stillValid) {
      setSelectedOperationStationId(KDS_OPERATION_STATION_FILTER_ALL);
    }
  }, [
    activeStationsForScope,
    selectedOperationStationId,
    selectionRestored,
  ]);

  useEffect(() => {
    const rid = restaurantId?.trim() ?? "";
    if (!authReady || !rid || !selectionRestored) return;
    writeStoredStationId(rid, scope, selectedOperationStationId);
  }, [
    authReady,
    restaurantId,
    scope,
    selectedOperationStationId,
    selectionRestored,
  ]);

  const allLabel = useMemo(() => kdsOperationStationAllLabel(scope), [scope]);

  const itemFilter = useCallback(
    (item: BoardItem) =>
      matchesKdsBoardItemFilter(item, scope, selectedOperationStationId),
    [scope, selectedOperationStationId],
  );

  return {
    activeStationsForScope,
    selectedOperationStationId,
    setSelectedOperationStationId,
    itemFilter,
    allLabel,
  };
}
