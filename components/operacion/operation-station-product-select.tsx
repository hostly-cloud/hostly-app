"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ensureDefaultOperationStations,
  listenOperationStations,
} from "@/lib/firestore/operation-stations";
import {
  isLegacyOperationStationSelectValue,
  legacyFallbackSelectOptionLabel,
  OPERATION_STATION_SELECT_NONE,
} from "@/lib/operacion/product-operation-station";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";

type OperationStationProductSelectProps = {
  restaurantId: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  id?: string;
};

const defaultInputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20";

export function OperationStationProductSelect({
  restaurantId,
  value,
  onChange,
  disabled = false,
  className,
  style,
  id,
}: OperationStationProductSelectProps) {
  const [stations, setStations] = useState<OperationStationDocument[]>([]);
  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";

  useEffect(() => {
    if (!rid) {
      setStations([]);
      return;
    }
    let defaultsEnsured = false;
    const unsub = listenOperationStations(
      rid,
      (list) => {
        setStations(list);
        if (!defaultsEnsured && list.length === 0) {
          defaultsEnsured = true;
          void ensureDefaultOperationStations(rid).catch((e) =>
            console.error("ensureDefaultOperationStations", e),
          );
        }
      },
      (e) => console.error("listenOperationStations", e),
    );
    return () => unsub();
  }, [rid]);

  const activeStations = useMemo(
    () => stations.filter((s) => s.active),
    [stations],
  );

  const legacyLabel = useMemo(
    () => legacyFallbackSelectOptionLabel(value),
    [value],
  );

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className ?? defaultInputClass}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      <option value={OPERATION_STATION_SELECT_NONE}>Sin estación</option>
      {isLegacyOperationStationSelectValue(value) && legacyLabel ? (
        <option value={value}>{legacyLabel}</option>
      ) : null}
      {activeStations.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
