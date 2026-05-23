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

export function useOperationStationKdsFilter(scope: KdsOperationStationFilterScope) {
  const { restaurantId, ready: authReady } = useAuth();
  const [stations, setStations] = useState<OperationStationDocument[]>([]);
  const [selectedOperationStationId, setSelectedOperationStationId] = useState(
    KDS_OPERATION_STATION_FILTER_ALL,
  );

  useEffect(() => {
    const rid = restaurantId?.trim() ?? "";
    if (!authReady || !rid) {
      setStations([]);
      return;
    }
    return listenOperationStations(rid, setStations);
  }, [authReady, restaurantId]);

  const activeStationsForScope = useMemo(
    () =>
      sortOperationStations(
        stations.filter((s) => s.active && s.type === scope),
      ),
    [stations, scope],
  );

  useEffect(() => {
    if (selectedOperationStationId === KDS_OPERATION_STATION_FILTER_ALL) {
      return;
    }
    const stillValid = activeStationsForScope.some(
      (s) => s.id === selectedOperationStationId,
    );
    if (!stillValid) {
      setSelectedOperationStationId(KDS_OPERATION_STATION_FILTER_ALL);
    }
  }, [activeStationsForScope, selectedOperationStationId]);

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
