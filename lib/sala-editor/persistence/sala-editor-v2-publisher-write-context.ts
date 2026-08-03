/**
 * Lightweight publisher last-op context builders.
 * Used when SALA_EDITOR_DEV_DIAGNOSTICS is false so production still keeps
 * getLastSalaEditorV2PublisherFirestoreOperation useful without building expensive
 * diagnostic rows (safeWritePayload / describePublicationWrite).
 */

export type PublisherWriteRefLike = {
  path: string;
  id: string;
  parent: { path: string };
};

export type PublisherWriteLike = {
  ref: PublisherWriteRefLike;
  data: Record<string, unknown>;
  mode: "update" | "setMerge";
  diagnosticLabel?: string;
  existingRestaurantId?: string | null;
};

export type PublisherWriteOperation =
  | "batch.set"
  | "batch.update"
  | "setDoc"
  | "updateDoc";

export type PublisherLastOpSnapshot = {
  operation: string;
  documentPath: string | null;
  collectionName: string | null;
  restaurantId: string | null;
  uid: string | null;
  payloadRestaurantId: string | null;
  existingRestaurantId: string | null;
  payloadKeys: string[];
};

export type PublisherRememberPlan = {
  /** When true, commit paths may build describePublicationWrite rows / console diagnostics. */
  buildExpensiveDiagnosticRows: boolean;
  /** How lastFirestoreOperation should be populated before the write/commit. */
  rememberVia: "diagnostic-rows" | "light-write-context";
};

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function writePayloadKeys(data: Record<string, unknown> | null | undefined): string[] {
  return data ? Object.keys(data).sort() : [];
}

export function planPublisherWriteRemember(
  diagnosticsEnabled: boolean,
): PublisherRememberPlan {
  if (diagnosticsEnabled) {
    return {
      buildExpensiveDiagnosticRows: true,
      rememberVia: "diagnostic-rows",
    };
  }
  return {
    buildExpensiveDiagnosticRows: false,
    rememberVia: "light-write-context",
  };
}

export function buildPublicationWriteLastOpContext(params: {
  write: PublisherWriteLike;
  restaurantId: string;
  operation: PublisherWriteOperation;
  uid: string | null;
}): PublisherLastOpSnapshot {
  const { write, restaurantId, operation, uid } = params;
  const pathSegments = write.ref.path.split("/").filter(Boolean);
  const collectionPath = pathSegments.slice(0, -1).join("/");
  return {
    operation,
    documentPath: write.ref.path,
    collectionName: collectionPath || write.ref.parent.path || null,
    restaurantId,
    uid,
    payloadRestaurantId: stringOrEmpty(write.data.restaurantId) || null,
    existingRestaurantId: write.existingRestaurantId ?? null,
    payloadKeys: writePayloadKeys(write.data),
  };
}

export function buildBatchChunkLastOpContext(params: {
  chunk: PublisherWriteLike[];
  restaurantId: string;
  uid: string | null;
}): PublisherLastOpSnapshot {
  const { chunk, restaurantId, uid } = params;
  const first = chunk[0];
  return {
    operation: "batch.commit",
    documentPath:
      chunk.length === 1 ? first?.ref.path ?? null : `batch:${chunk.length}:documents`,
    collectionName:
      chunk.length === 1
        ? first?.ref.parent.path ?? null
        : [...new Set(chunk.map((write) => write.ref.parent.path))].join(", "),
    restaurantId,
    uid,
    payloadRestaurantId:
      chunk.length === 1 ? stringOrEmpty(chunk[0]?.data.restaurantId) || null : null,
    existingRestaurantId:
      chunk.length === 1 ? chunk[0]?.existingRestaurantId ?? null : null,
    payloadKeys: [...new Set(chunk.flatMap((write) => writePayloadKeys(write.data)))].sort(),
  };
}
