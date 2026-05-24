/**
 * Sesión de onboarding (paso, borrador catálogo IA, archivo) — recuperación al volver/refrescar.
 */

import type { ExtractedMenuRow } from "@/lib/carta/mock-menu-photo-import";

export const ONBOARDING_SESSION_KEY = "hostly.onboarding.session.v1";
export const ONBOARDING_CARTA_FILE_KEY = "hostly.onboarding.carta-file.v1";

const MAX_PERSIST_FILE_BYTES = 4 * 1024 * 1024;

export type OnboardingCartaPhase = "idle" | "file_ready" | "analyzed";

export type OnboardingFileMeta = {
  name: string;
  size: number;
  type: string;
  lastModified: number;
};

export type OnboardingSessionSnapshot = {
  v: 1;
  step: number;
  catalogDraft: ExtractedMenuRow[];
  cartaPhase: OnboardingCartaPhase;
  fileMeta: OnboardingFileMeta | null;
  analyzeError: string | null;
};

type StoredCartaFile = {
  meta: OnboardingFileMeta;
  dataUrl: string;
};

function emptySnapshot(): OnboardingSessionSnapshot {
  return {
    v: 1,
    step: 0,
    catalogDraft: [],
    cartaPhase: "idle",
    fileMeta: null,
    analyzeError: null,
  };
}

function parseCatalogDraft(raw: unknown): ExtractedMenuRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtractedMenuRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.tempId !== "string" || typeof r.nombre !== "string") continue;
    out.push({
      tempId: r.tempId,
      nombre: r.nombre,
      categoria: typeof r.categoria === "string" ? r.categoria : "",
      precio: typeof r.precio === "number" && Number.isFinite(r.precio) ? r.precio : 0,
      tipoVenta: r.tipoVenta === "bebida" ? "bebida" : "plato",
      selected: r.selected !== false,
      action: typeof r.action === "string" ? (r.action as ExtractedMenuRow["action"]) : undefined,
      targetPlatoId: typeof r.targetPlatoId === "string" ? r.targetPlatoId : r.targetPlatoId === null ? null : undefined,
      potentialDuplicates: Array.isArray(r.potentialDuplicates) ? (r.potentialDuplicates as ExtractedMenuRow["potentialDuplicates"]) : undefined,
      issues: Array.isArray(r.issues) ? (r.issues as ExtractedMenuRow["issues"]) : undefined,
      categoryLowConfidence: r.categoryLowConfidence === true ? true : undefined,
      familia: typeof r.familia === "string" ? r.familia : undefined,
      iaNotes: Array.isArray(r.iaNotes) ? (r.iaNotes as string[]) : undefined,
      disponible: r.disponible === false ? false : undefined,
    });
  }
  return out;
}

export function loadOnboardingSession(): OnboardingSessionSnapshot {
  if (typeof window === "undefined") return emptySnapshot();
  try {
    const raw = localStorage.getItem(ONBOARDING_SESSION_KEY);
    if (!raw) return emptySnapshot();
    const o = JSON.parse(raw) as Record<string, unknown>;
    const step = typeof o.step === "number" && o.step >= 0 && o.step <= 6 ? Math.floor(o.step) : 0;
    const cartaPhase =
      o.cartaPhase === "file_ready" || o.cartaPhase === "analyzed" || o.cartaPhase === "idle" ? o.cartaPhase : "idle";
    const fileMetaRaw = o.fileMeta;
    let fileMeta: OnboardingFileMeta | null = null;
    if (fileMetaRaw && typeof fileMetaRaw === "object") {
      const fm = fileMetaRaw as Record<string, unknown>;
      if (typeof fm.name === "string" && typeof fm.size === "number" && typeof fm.type === "string") {
        fileMeta = {
          name: fm.name,
          size: fm.size,
          type: fm.type,
          lastModified: typeof fm.lastModified === "number" ? fm.lastModified : Date.now(),
        };
      }
    }
    return {
      v: 1,
      step,
      catalogDraft: parseCatalogDraft(o.catalogDraft),
      cartaPhase,
      fileMeta,
      analyzeError: typeof o.analyzeError === "string" ? o.analyzeError : null,
    };
  } catch {
    return emptySnapshot();
  }
}

export function saveOnboardingSession(snapshot: OnboardingSessionSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ONBOARDING_SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

export function clearOnboardingCartaFileBlob(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ONBOARDING_CARTA_FILE_KEY);
  } catch {
    /* noop */
  }
}

export async function persistOnboardingCartaFile(file: File): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (file.size > MAX_PERSIST_FILE_BYTES) {
    clearOnboardingCartaFileBlob();
    return false;
  }
  const meta: OnboardingFileMeta = {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) {
          resolve(false);
          return;
        }
        const payload: StoredCartaFile = { meta, dataUrl };
        sessionStorage.setItem(ONBOARDING_CARTA_FILE_KEY, JSON.stringify(payload));
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    reader.onerror = () => resolve(false);
    reader.readAsDataURL(file);
  });
}

async function dataUrlToFile(meta: OnboardingFileMeta, dataUrl: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], meta.name, { type: meta.type || blob.type, lastModified: meta.lastModified });
}

export async function restoreOnboardingCartaFile(): Promise<{ file: File; previewUrl: string | null } | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ONBOARDING_CARTA_FILE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredCartaFile;
    if (!stored?.meta || typeof stored.dataUrl !== "string") return null;
    const file = await dataUrlToFile(stored.meta, stored.dataUrl);
    const previewUrl = file.type.startsWith("image/") ? stored.dataUrl : null;
    return { file, previewUrl };
  } catch {
    return null;
  }
}

export function fileMetaFromFile(file: File): OnboardingFileMeta {
  return { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified };
}
