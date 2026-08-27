"use client";

import {
  loadPlatos,
  PLATOS_CHANGED_EVENT,
  PLATOS_LOCAL_STORAGE_KEY,
} from "@/lib/carta/legacy-platos-storage";

export const LEGACY_PLATOS_ARCHIVE_META_KEY = "hostly.platos.v1.archiveMeta";

export const LEGACY_PLATOS_ARCHIVE_REASON = "catalog_migration_completed" as const;

export type LegacyPlatosArchiveReason = typeof LEGACY_PLATOS_ARCHIVE_REASON;

export type LegacyPlatosArchiveMeta = {
  archivedAt: string;
  count: number;
  reason: LegacyPlatosArchiveReason;
  archiveKey: string;
  restaurantId?: string;
};

export type ArchiveLegacyPlatosResult =
  | { ok: true; meta: LegacyPlatosArchiveMeta }
  | { ok: false; error: string };

export function legacyPlatosArchivedStorageKey(timestampMs: number): string {
  return `hostly.platos.v1.archived.${timestampMs}`;
}

/** Indica si la key activa `hostly.platos.v1` existe en localStorage. */
export function hasActiveLegacyPlatosStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(PLATOS_LOCAL_STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

/** Platos legacy del restaurante en la key activa (0 si no hay key o tenant vacío). */
export function countLegacyPlatosForRestaurant(restaurantId: string): number {
  const rid = restaurantId.trim();
  if (!rid) return 0;
  return loadPlatos(rid).length;
}

function countPlatosInRoot(raw: string, restaurantId?: string): number {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return 0;
    const root = parsed as Record<string, unknown>;
    if (restaurantId?.trim()) {
      const list = root[restaurantId.trim()];
      return Array.isArray(list) ? list.length : 0;
    }
    let total = 0;
    for (const value of Object.values(root)) {
      if (Array.isArray(value)) total += value.length;
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Archiva `hostly.platos.v1` en una copia timestamped y retira la key activa.
 * Solo navegador; requiere confirmación humana en UI antes de invocar.
 * No modifica Firestore ni el catálogo central.
 */
export function archiveLegacyPlatosLocalStorage(
  restaurantId?: string,
): ArchiveLegacyPlatosResult {
  if (typeof window === "undefined") {
    return { ok: false, error: "Solo disponible en el navegador." };
  }

  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";

  let raw: string | null;
  try {
    raw = localStorage.getItem(PLATOS_LOCAL_STORAGE_KEY);
  } catch {
    return { ok: false, error: "No se pudo leer el catálogo local." };
  }

  if (raw == null || raw === "") {
    return { ok: false, error: "No hay catálogo legacy activo en este navegador." };
  }

  const count = countPlatosInRoot(raw, rid || undefined);
  if (rid && count === 0) {
    return { ok: false, error: "No hay platos legacy para este restaurante." };
  }

  const timestampMs = Date.now();
  const archiveKey = legacyPlatosArchivedStorageKey(timestampMs);

  try {
    localStorage.setItem(archiveKey, raw);
  } catch {
    return {
      ok: false,
      error: "No se pudo guardar la copia de seguridad (espacio insuficiente o bloqueo del navegador).",
    };
  }

  try {
    const verify = localStorage.getItem(archiveKey);
    if (verify !== raw) {
      localStorage.removeItem(archiveKey);
      return { ok: false, error: "Verificación de copia fallida. Catálogo activo intacto." };
    }
  } catch {
    try {
      localStorage.removeItem(archiveKey);
    } catch {
      /* ignore */
    }
    return { ok: false, error: "Verificación de copia fallida. Catálogo activo intacto." };
  }

  const meta: LegacyPlatosArchiveMeta = {
    archivedAt: new Date(timestampMs).toISOString(),
    count,
    reason: LEGACY_PLATOS_ARCHIVE_REASON,
    archiveKey,
    ...(rid ? { restaurantId: rid } : {}),
  };

  try {
    localStorage.setItem(LEGACY_PLATOS_ARCHIVE_META_KEY, JSON.stringify(meta));
  } catch {
    return {
      ok: false,
      error:
        "Copia guardada pero no se pudo registrar la metadata. El catálogo activo no se ha retirado.",
    };
  }

  try {
    localStorage.removeItem(PLATOS_LOCAL_STORAGE_KEY);
    window.dispatchEvent(new Event(PLATOS_CHANGED_EVENT));
  } catch {
    return {
      ok: false,
      error: "Copia archivada pero no se pudo retirar el catálogo activo. Revisa localStorage manualmente.",
    };
  }

  return { ok: true, meta };
}
