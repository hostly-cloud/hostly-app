import { createHash } from "node:crypto";
import type {
  CatalogImageBulkEstimate,
  CatalogImageBulkItemKind,
  CatalogImageBulkItemStatus,
  CatalogImageBulkSummary,
} from "@/lib/productos/catalog-image-bulk-contract";

export type CatalogImageBulkConfirmationItem = {
  productId: string;
  kind: CatalogImageBulkItemKind;
  status: CatalogImageBulkItemStatus;
};

export function buildCatalogImageBulkConfirmationToken(input: {
  summary: CatalogImageBulkSummary;
  estimate: CatalogImageBulkEstimate;
  classified: CatalogImageBulkConfirmationItem[];
}): string {
  const classified = input.classified
    .map((item) => ({
      productId: item.productId,
      kind: item.kind,
      status: item.status,
    }))
    .sort((left, right) => left.productId.localeCompare(right.productId));

  const payload = JSON.stringify({
    summary: input.summary,
    estimate: {
      aiGenerationRequests: input.estimate.aiGenerationRequests,
      catalogSearchRequests: input.estimate.catalogSearchRequests,
      credits: input.estimate.credits,
      mode: input.estimate.mode,
    },
    classified,
  });

  return createHash("sha256").update(payload).digest("hex");
}
