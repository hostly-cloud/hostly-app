import { handleCallback } from "@vercel/queue";
import {
  catalogImageBulkQueueRetryDecision,
  processCatalogImageBulkQueueMessage,
} from "@/lib/server/product-images/catalog-image-bulk-queue";

export const maxDuration = 120;

export const POST = handleCallback(
  async (message) => {
    await processCatalogImageBulkQueueMessage(message);
  },
  {
    visibilityTimeoutSeconds: 180,
    retry: (error, { deliveryCount }) =>
      catalogImageBulkQueueRetryDecision(error, deliveryCount),
  },
);
