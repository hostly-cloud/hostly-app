import { handleCallback } from "@vercel/queue";
import {
  catalogImageBulkQueueRetryDecision,
} from "@/lib/server/product-images/catalog-image-bulk-queue";
import { handleCatalogImageBulkQueueDelivery } from "@/lib/server/product-images/catalog-image-bulk-telemetry";

export const maxDuration = 120;

export const POST = handleCallback(
  async (message, metadata) => {
    await handleCatalogImageBulkQueueDelivery(message, metadata);
  },
  {
    visibilityTimeoutSeconds: 180,
    retry: (error, { deliveryCount }) =>
      catalogImageBulkQueueRetryDecision(error, deliveryCount),
  },
);
