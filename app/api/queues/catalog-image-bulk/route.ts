import { handleCallback } from "@vercel/queue";
import { processCatalogImageBulkQueueMessage } from "@/lib/server/product-images/catalog-image-bulk-queue";

export const maxDuration = 120;

export const POST = handleCallback(
  async (message) => {
    await processCatalogImageBulkQueueMessage(message);
  },
  {
    visibilityTimeoutSeconds: 180,
    retry: (_error, { deliveryCount }) => ({
      afterSeconds: Math.min(60, Math.max(2, deliveryCount * 5)),
    }),
  },
);
