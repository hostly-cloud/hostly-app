import { createHash, createHmac } from "node:crypto";

export const MARKETING_LEAD_MAX_BODY_BYTES = 16 * 1024;
export const MARKETING_LEAD_DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

export const MARKETING_LEAD_RATE_LIMIT_POLICY = {
  burst: {
    limit: 3,
    windowMs: 60 * 1000,
  },
  sustained: {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  },
} as const;

export type MarketingLeadRateLimitState = {
  burstWindowStartedAtMs?: number;
  burstCount?: number;
  sustainedWindowStartedAtMs?: number;
  sustainedCount?: number;
};

export type MarketingLeadRateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAtMs: number;
  nextState: Required<MarketingLeadRateLimitState>;
};

export class MarketingLeadBodyTooLargeError extends Error {
  constructor() {
    super("MARKETING_LEAD_BODY_TOO_LARGE");
    this.name = "MarketingLeadBodyTooLargeError";
  }
}

function normalizeWindow(
  startedAtMs: unknown,
  count: unknown,
  nowMs: number,
  windowMs: number,
) {
  const start =
    typeof startedAtMs === "number" && Number.isFinite(startedAtMs)
      ? startedAtMs
      : nowMs;
  const value =
    typeof count === "number" && Number.isFinite(count) && count >= 0
      ? Math.floor(count)
      : 0;

  if (nowMs - start >= windowMs || nowMs < start) {
    return { startedAtMs: nowMs, count: 0 };
  }

  return { startedAtMs: start, count: value };
}

export function evaluateMarketingLeadRateLimit(
  state: MarketingLeadRateLimitState | null | undefined,
  nowMs: number,
): MarketingLeadRateLimitDecision {
  const burst = normalizeWindow(
    state?.burstWindowStartedAtMs,
    state?.burstCount,
    nowMs,
    MARKETING_LEAD_RATE_LIMIT_POLICY.burst.windowMs,
  );
  const sustained = normalizeWindow(
    state?.sustainedWindowStartedAtMs,
    state?.sustainedCount,
    nowMs,
    MARKETING_LEAD_RATE_LIMIT_POLICY.sustained.windowMs,
  );

  const burstBlocked = burst.count >= MARKETING_LEAD_RATE_LIMIT_POLICY.burst.limit;
  const sustainedBlocked =
    sustained.count >= MARKETING_LEAD_RATE_LIMIT_POLICY.sustained.limit;
  const allowed = !burstBlocked && !sustainedBlocked;

  const nextState = {
    burstWindowStartedAtMs: burst.startedAtMs,
    burstCount: burst.count + (allowed ? 1 : 0),
    sustainedWindowStartedAtMs: sustained.startedAtMs,
    sustainedCount: sustained.count + (allowed ? 1 : 0),
  };

  const blockedResetTimes = [
    ...(burstBlocked
      ? [burst.startedAtMs + MARKETING_LEAD_RATE_LIMIT_POLICY.burst.windowMs]
      : []),
    ...(sustainedBlocked
      ? [
          sustained.startedAtMs +
            MARKETING_LEAD_RATE_LIMIT_POLICY.sustained.windowMs,
        ]
      : []),
  ];
  const resetAtMs = allowed
    ? Math.min(
        burst.startedAtMs + MARKETING_LEAD_RATE_LIMIT_POLICY.burst.windowMs,
        sustained.startedAtMs +
          MARKETING_LEAD_RATE_LIMIT_POLICY.sustained.windowMs,
      )
    : Math.max(...blockedResetTimes);

  const burstRemaining = Math.max(
    0,
    MARKETING_LEAD_RATE_LIMIT_POLICY.burst.limit - nextState.burstCount,
  );
  const sustainedRemaining = Math.max(
    0,
    MARKETING_LEAD_RATE_LIMIT_POLICY.sustained.limit -
      nextState.sustainedCount,
  );

  return {
    allowed,
    remaining: Math.min(burstRemaining, sustainedRemaining),
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000)),
    resetAtMs,
    nextState,
  };
}

export function extractMarketingLeadClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  if (firstForwarded) return firstForwarded;

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

export function hashMarketingLeadClientKey(value: string, secret: string) {
  return createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex");
}

export function fingerprintMarketingLeadSubmission(input: {
  name: string;
  email: string;
  business: string;
  city: string;
  businessType: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.name,
        input.email,
        input.business,
        input.city,
        input.businessType,
        input.utmSource,
        input.utmMedium,
        input.utmCampaign,
        input.utmContent,
        input.utmTerm,
      ]),
    )
    .digest("hex");
}

export async function readMarketingLeadBodyWithLimit(
  request: Request,
  maxBytes = MARKETING_LEAD_MAX_BODY_BYTES,
) {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new MarketingLeadBodyTooLargeError();
    }
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new MarketingLeadBodyTooLargeError();
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}
