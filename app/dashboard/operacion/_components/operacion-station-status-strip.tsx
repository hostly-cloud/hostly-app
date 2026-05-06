"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type StationKey = "cocina" | "barra" | "sala";

const ORDER = ["cocina", "barra", "sala"] as const;

const formatTime = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
};

const getStatusIcon = (status: string) => {
  if (status.includes("lenta") || status === "Lento") return "🔴";
  if (status.includes("atención") || status === "Atención") return "🟠";
  return "🟢";
};

const isStale = (updatedAt: number | null) => {
  if (!updatedAt) return false;
  return Date.now() - updatedAt > 60000;
};

type StationSnapshot = {
  status: string | null;
  updatedAt: number | null;
};

export default function OperacionStationStatusStrip() {
  const router = useRouter();
  const [stationStatus, setStationStatus] = useState<
    Record<StationKey, StationSnapshot>
  >({
    cocina: { status: null, updatedAt: null },
    barra: { status: null, updatedAt: null },
    sala: { status: null, updatedAt: null },
  });

  const [showHint, setShowHint] = useState(true);

  const [, setStaleTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStaleTick((t) => t + 1), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{
        station?: string;
        status?: string | null;
      }>;
      const { station, status } = ce.detail ?? {};
      if (station !== "cocina" && station !== "barra" && station !== "sala") {
        return;
      }

      setStationStatus((prev) => ({
        ...prev,
        [station]: {
          status: status ?? null,
          updatedAt: Date.now(),
        },
      }));
    };

    window.addEventListener("kds:station-status", handler);

    return () => {
      window.removeEventListener("kds:station-status", handler);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(t);
  }, []);

  const handleClick = (station: string) => {
    if (station === "cocina") router.push("/dashboard/operacion/cocina");
    if (station === "barra") router.push("/dashboard/operacion/barra");
    if (station === "sala") router.push("/dashboard/operacion/sala");
  };

  return (
    <div className="mb-4 px-4 pt-4">
      <div className="flex flex-wrap gap-2">
        {ORDER.map((s) => {
        const { status, updatedAt } = stationStatus[s];

        const isEmpty = !status;

        const stationLabel =
          s === "cocina"
            ? "Cocina"
            : s === "barra"
              ? "Barra"
              : "Sala";

        const fallbackText = `${stationLabel} sin datos`;

        const text = isEmpty
          ? ""
          : s === "sala"
            ? status
            : s === "barra"
              ? status === "Lento"
                ? "Barra lenta"
                : status === "Atención"
                  ? "Barra atención"
                  : "Barra en ritmo"
              : `Cocina ${
                  status === "Lento"
                    ? "lento"
                    : status === "Atención"
                      ? "atención"
                      : "en ritmo"
                }`;

        const finalText = isEmpty ? fallbackText : text;

        const stale = isStale(updatedAt);

        const color = isEmpty
          ? "bg-gray-100 text-gray-500"
          : stale
            ? "bg-yellow-100 text-yellow-700"
            : status.includes("lenta") || status === "Lento"
              ? "bg-red-100 text-red-700"
              : status.includes("atención") || status === "Atención"
                ? "bg-orange-100 text-orange-700"
                : "bg-green-100 text-green-700";

        const labelledFinalText =
          stale && !isEmpty ? `${finalText} (sin actualizar)` : finalText;

        const icon = isEmpty ? "⚪" : getStatusIcon(status);

        return (
          <div
            key={s}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${color}`}
            title={
              s === "cocina"
                ? "Ir a Cocina"
                : s === "barra"
                  ? "Ir a Barra"
                  : "Ir a Sala"
            }
            onClick={() => handleClick(s)}
          >
            <div className="flex flex-col leading-tight">
              <span>{`${icon} ${labelledFinalText}`}</span>
              {!isEmpty && updatedAt ? (
                <span className="text-[10px] opacity-60">
                  {formatTime(updatedAt)}
                </span>
              ) : null}
            </div>
          </div>
        );
        })}
      </div>
      {showHint && (
        <div className="mt-1 text-[10px] text-gray-400">
          C Cocina · B Barra · S Sala
        </div>
      )}
    </div>
  );
}
