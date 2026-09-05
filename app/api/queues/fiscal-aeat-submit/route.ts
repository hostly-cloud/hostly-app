import { handleCallback } from "@vercel/queue";
import {
  fiscalQueueRetryDecision,
  processFiscalOutboxMessage,
} from "@/lib/server/fiscal/fiscal-outbox-queue";

export const maxDuration = 120;

export const POST = handleCallback(
  async (message) => {
    await processFiscalOutboxMessage(message);
  },
  { visibilityTimeoutSeconds: 150, retry: fiscalQueueRetryDecision },
);
