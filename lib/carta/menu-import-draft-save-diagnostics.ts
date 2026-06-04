import { FirebaseError } from "firebase/app";

/** Instrumentación temporal para localizar fallos en persistDraft / updateMenuImportDraft. */
export function logMenuImportDraftSaveError(args: {
  phase: "persistDraft" | "updateMenuImportDraft";
  reason?: string;
  error?: unknown;
  restaurantId?: string | null;
  draftId?: string | null;
  userId?: string | null;
  payload?: Record<string, unknown>;
}): void {
  const error = args.error;
  const message =
    error instanceof Error
      ? error.message
      : error != null
        ? String(error)
        : args.reason ?? "unknown";

  let code: string | undefined;
  if (error instanceof FirebaseError) {
    code = error.code;
  } else if (error && typeof error === "object" && "code" in error) {
    const raw = (error as { code?: unknown }).code;
    if (typeof raw === "string") code = raw;
  }

  const stack =
    error instanceof Error && error.stack
      ? error.stack.split("\n").slice(0, 5).join("\n")
      : undefined;

  let payloadSummary: Record<string, unknown> | undefined;
  if (args.payload) {
    let serializedBytes: number | undefined;
    try {
      serializedBytes = JSON.stringify(args.payload).length;
    } catch (serializationError) {
      serializedBytes = undefined;
      payloadSummary = {
        ...args.payload,
        serializationFailed: true,
        serializationError:
          serializationError instanceof Error
            ? serializationError.message
            : String(serializationError),
      };
    }
    if (!payloadSummary) {
      payloadSummary = {
        ...args.payload,
        serializedBytes,
        exceedsFirestore1MiB:
          typeof serializedBytes === "number" ? serializedBytes > 1_048_576 : undefined,
      };
    }
  }

  console.error("[Hostly][Draft Save Error]", {
    phase: args.phase,
    reason: args.reason ?? null,
    message,
    code: code ?? null,
    stack: stack ?? null,
    restaurantId: args.restaurantId ?? null,
    draftId: args.draftId ?? null,
    userId: args.userId ?? null,
    payload: payloadSummary ?? null,
  });
}

export function summarizeMenuImportDraftSavePayload(args: {
  sections?: unknown;
  items?: unknown;
  updatedBy: string;
}): Record<string, unknown> {
  const sections = Array.isArray(args.sections) ? args.sections : [];
  const items = Array.isArray(args.items) ? args.items : [];
  const selectedForPublishCount = items.filter(
    (item) =>
      item != null &&
      typeof item === "object" &&
      (item as { selectedForPublish?: unknown }).selectedForPublish === true,
  ).length;

  return {
    updatedBy: args.updatedBy,
    sectionsCount: sections.length,
    itemsCount: items.length,
    selectedForPublishCount,
    sectionItemCounts: sections.map((section, index) => {
      if (section == null || typeof section !== "object") {
        return { index, name: null, itemsCount: 0 };
      }
      const rec = section as { name?: unknown; items?: unknown };
      const sectionItems = Array.isArray(rec.items) ? rec.items : [];
      return {
        index,
        name: typeof rec.name === "string" ? rec.name : null,
        itemsCount: sectionItems.length,
      };
    }),
  };
}
