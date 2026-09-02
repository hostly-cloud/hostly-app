"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  archiveLegacyPlatosLocalStorage,
  countLegacyPlatosForRestaurant,
  hasActiveLegacyPlatosStorage,
} from "@/lib/carta/archive-legacy-platos-local-storage";
import { PLATOS_CHANGED_EVENT } from "@/lib/carta/legacy-platos-storage";
import type { OperationalCatalogSource } from "@/lib/carta/use-central-products-for-carta";

type LegacyPlatosArchivePanelProps = {
  restaurantId: string;
  catalogSource: OperationalCatalogSource | null;
  iceVisual?: boolean;
  onArchived?: () => void;
};

const ARCHIVE_CONFIRM_MESSAGE =
  "Se guardará una copia local de seguridad y se retirará el catálogo antiguo de este navegador.";
const subscribeHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function readLegacyPresence(restaurantId: string) {
  const count = countLegacyPlatosForRestaurant(restaurantId);
  return {
    restaurantId: restaurantId.trim(),
    legacyPresent: hasActiveLegacyPlatosStorage() && count > 0,
    legacyCount: count,
  };
}

export function LegacyPlatosArchivePanel({
  restaurantId,
  catalogSource,
  iceVisual = false,
  onArchived,
}: LegacyPlatosArchivePanelProps) {
  const [legacySnapshot, setLegacySnapshot] = useState(() =>
    typeof window === "undefined"
      ? { restaurantId: "", legacyPresent: false, legacyCount: 0 }
      : readLegacyPresence(restaurantId),
  );
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const currentLegacySnapshot =
    hydrated && legacySnapshot.restaurantId === restaurantId.trim()
      ? legacySnapshot
      : hydrated
        ? readLegacyPresence(restaurantId)
        : { restaurantId: "", legacyPresent: false, legacyCount: 0 };
  const { legacyPresent, legacyCount } = currentLegacySnapshot;
  const [archiving, setArchiving] = useState(false);
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshLegacyPresence = useCallback(() => {
    setLegacySnapshot(readLegacyPresence(restaurantId));
  }, [restaurantId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = () => refreshLegacyPresence();
    window.addEventListener(PLATOS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PLATOS_CHANGED_EVENT, onChange);
  }, [refreshLegacyPresence]);

  const runArchive = useCallback(async () => {
    const ok = window.confirm(ARCHIVE_CONFIRM_MESSAGE);
    if (!ok) return;

    setArchiving(true);
    setError(null);
    const result = archiveLegacyPlatosLocalStorage(restaurantId);
    setArchiving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setArchived(true);
    setLegacySnapshot(readLegacyPresence(restaurantId));
    onArchived?.();
  }, [onArchived, restaurantId]);

  if (catalogSource !== "central") return null;
  if (!legacyPresent && !archived) return null;

  const border = iceVisual
    ? "1px solid rgba(148, 163, 184, 0.22)"
    : "1px solid rgba(56, 189, 248, 0.28)";
  const bg = iceVisual ? "rgba(224, 242, 254, 0.92)" : "rgba(8, 47, 73, 0.22)";
  const ink = iceVisual ? "#0369a1" : "#bae6fd";
  const successBorder = iceVisual
    ? "1px solid rgba(34, 197, 94, 0.35)"
    : "1px solid rgba(34, 197, 94, 0.3)";
  const successBg = iceVisual ? "rgba(220, 252, 231, 0.92)" : "rgba(6, 78, 59, 0.18)";
  const successInk = iceVisual ? "#166534" : "#bbf7d0";

  if (archived) {
    return (
      <div
        style={{
          flexShrink: 0,
          padding: "8px 11px",
          borderRadius: 8,
          border: successBorder,
          background: successBg,
          color: successInk,
          fontSize: 12,
          lineHeight: 1.4,
        }}
        data-legacy-platos-archive-panel="completed"
      >
        <strong style={{ fontWeight: 700 }}>Copia local archivada</strong>
        <p style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.95 }}>
          El catálogo central en Firestore no se ha modificado. Este navegador ya no usará el
          fallback legacy al recargar.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        flexShrink: 0,
        padding: "8px 11px",
        borderRadius: 8,
        border,
        background: bg,
        color: ink,
        fontSize: 12,
        lineHeight: 1.4,
      }}
      data-legacy-platos-archive-panel="pending"
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontWeight: 700 }}>Catálogo local antiguo detectado</strong>
          <p style={{ margin: "4px 0 0", opacity: 0.9, fontSize: 11 }}>
            Hay {legacyCount} producto{legacyCount === 1 ? "" : "s"} antiguo{legacyCount === 1 ? "" : "s"} pendiente
            {legacyCount === 1 ? "" : "s"} de migrar en{" "}
            <code style={{ fontSize: 10 }}>hostly.platos.v1</code>. Ya usas catálogo central;
            revísalos antes de limpiar datos o archiva la copia local de forma segura.
          </p>
        </div>
        <button
          type="button"
          disabled={archiving}
          onClick={() => void runArchive()}
          style={{
            border: "1px solid rgba(56, 189, 248, 0.45)",
            background: iceVisual ? "#fff" : "rgba(56, 189, 248, 0.12)",
            color: iceVisual ? "#0369a1" : "#e0f2fe",
            padding: "5px 10px",
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 11,
            cursor: archiving ? "wait" : "pointer",
            opacity: archiving ? 0.7 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {archiving ? "Archivando…" : "Archivar copia local antigua"}
        </button>
      </div>
      {error ? (
        <p
          style={{
            margin: "8px 0 0",
            color: iceVisual ? "#b91c1c" : "#fecaca",
            fontSize: 11,
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
