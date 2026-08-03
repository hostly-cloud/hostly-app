import { mapAiMenuItemsToExtractedRows, type AiMenuDetectedItem } from "@/lib/carta/map-ai-menu-items-to-rows";
import type { ExtractedMenuRow } from "@/lib/carta/mock-menu-photo-import";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { auth } from "@/lib/firebase/client";

export class MenuImportNoProductsError extends Error {
  readonly code = "NO_PRODUCTS_DETECTED" as const;

  constructor(message: string) {
    super(message);
    this.name = "MenuImportNoProductsError";
  }
}

export class MenuImportExtractError extends Error {
  readonly code: string;

  constructor(message: string, code = "AI_IMPORT_FAILED") {
    super(message);
    this.name = "MenuImportExtractError";
    this.code = code;
  }
}

type ImportMenuApiResponse = {
  ok?: boolean;
  items?: AiMenuDetectedItem[];
  noProducts?: boolean;
  code?: string;
  error?: string;
  details?: string;
  ocrTextLength?: number;
};

export async function extractMenuFromUpload(file: File): Promise<{
  rows: ExtractedMenuRow[];
  ocrTextLength?: number;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new MenuImportExtractError("UNAUTHORIZED", "UNAUTHORIZED");
  }
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw new MenuImportExtractError(
      "No se pudo validar la sesión. Vuelve a intentarlo.",
      "AUTH_TOKEN_UNAVAILABLE",
    );
  }
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/ai/import-menu", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const text = await res.text();
  let json: ImportMenuApiResponse | null = null;
  try {
    json = text ? (JSON.parse(text) as ImportMenuApiResponse) : null;
  } catch {
    json = null;
  }

  if (json?.ok && json.noProducts) {
    throw new MenuImportNoProductsError(
      typeof json.details === "string" && json.details.trim()
        ? json.details.trim()
        : "NO_PRODUCTS_DETECTED",
    );
  }

  if (!res.ok || !json?.ok) {
    const msg =
      (typeof json?.details === "string" && json.details.trim()) ||
      (typeof json?.error === "string" && json.error.trim()) ||
      "AI_IMPORT_FAILED";
    throw new MenuImportExtractError(msg, typeof json?.code === "string" ? json.code : json?.error ?? "AI_IMPORT_FAILED");
  }

  const items = Array.isArray(json.items) ? json.items : [];
  if (items.length === 0) {
    throw new MenuImportNoProductsError("NO_PRODUCTS_DETECTED");
  }

  const rid = getBrowserRestauranteId();
  return {
    rows: mapAiMenuItemsToExtractedRows(items, rid),
    ocrTextLength: typeof json.ocrTextLength === "number" ? json.ocrTextLength : undefined,
  };
}
