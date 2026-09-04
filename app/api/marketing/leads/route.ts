import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import {
  MARKETING_LEAD_DUPLICATE_WINDOW_MS,
  MarketingLeadBodyTooLargeError,
  evaluateMarketingLeadRateLimit,
  extractMarketingLeadClientIp,
  fingerprintMarketingLeadSubmission,
  hashMarketingLeadClientKey,
  readMarketingLeadBodyWithLimit,
  resolveMarketingLeadAbuseSecret,
  type MarketingLeadRateLimitDecision,
  type MarketingLeadRateLimitState,
} from "@/lib/security/marketing-lead-abuse";

type LeadPayload = {
  name?: string;
  email?: string;
  business?: string;
  city?: string;
  businessType?: string;
  consent?: boolean;
  website?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function jsonResponse(
  body: Record<string, unknown>,
  init?: { status?: number; headers?: HeadersInit },
) {
  return NextResponse.json(body, {
    status: init?.status,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

function jsonError(status: number, error: string, headers?: HeadersInit) {
  return jsonResponse({ ok: false, error }, { status, headers });
}

function rateLimitHeaders(decision: MarketingLeadRateLimitDecision) {
  return {
    "RateLimit-Remaining": String(decision.remaining),
    "RateLimit-Reset": String(Math.ceil(decision.resetAtMs / 1000)),
    ...(decision.retryAfterSeconds > 0
      ? { "Retry-After": String(decision.retryAfterSeconds) }
      : {}),
  };
}

async function consumeRateLimit(req: Request) {
  const db = getHostlyFirestore();
  const secret = resolveMarketingLeadAbuseSecret();
  if (!db || !secret) return null;

  const clientIp = extractMarketingLeadClientIp(req.headers);
  const clientKey = hashMarketingLeadClientKey(clientIp, secret);
  const ref = db.collection("_marketingLeadRateLimits").doc(clientKey);
  const nowMs = Date.now();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const state = snapshot.exists
      ? (snapshot.data() as MarketingLeadRateLimitState)
      : null;
    const decision = evaluateMarketingLeadRateLimit(state, nowMs);

    if (decision.allowed) {
      transaction.set(
        ref,
        {
          ...decision.nextState,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    return decision;
  });
}

export async function POST(req: Request) {
  try {
    const db = getHostlyFirestore();
    if (!db || !resolveMarketingLeadAbuseSecret()) {
      return jsonError(503, "LEAD_STORAGE_UNAVAILABLE");
    }

    const rateLimit = await consumeRateLimit(req);
    if (!rateLimit) return jsonError(503, "LEAD_STORAGE_UNAVAILABLE");
    if (!rateLimit.allowed) {
      return jsonError(
        429,
        "TOO_MANY_REQUESTS",
        rateLimitHeaders(rateLimit),
      );
    }

    let rawBody: string;
    try {
      rawBody = await readMarketingLeadBodyWithLimit(req);
    } catch (error) {
      if (error instanceof MarketingLeadBodyTooLargeError) {
        return jsonError(413, "PAYLOAD_TOO_LARGE", rateLimitHeaders(rateLimit));
      }
      throw error;
    }

    let body: LeadPayload | null = null;
    try {
      body = JSON.parse(rawBody) as LeadPayload;
    } catch {
      body = null;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError(400, "INVALID_JSON", rateLimitHeaders(rateLimit));
    }

    // Honeypot: bots commonly fill hidden website fields. Return success so the
    // endpoint does not become an oracle for spam tooling.
    if (clean(body.website, 200)) {
      return jsonResponse(
        { ok: true },
        { headers: rateLimitHeaders(rateLimit) },
      );
    }

    const name = clean(body.name, 100);
    const email = clean(body.email, 180).toLowerCase();
    const business = clean(body.business, 140);
    const city = clean(body.city, 100);
    const businessType = clean(body.businessType, 80);

    if (!name || name.length < 2) {
      return jsonError(400, "NAME_REQUIRED", rateLimitHeaders(rateLimit));
    }
    if (!EMAIL_RE.test(email)) {
      return jsonError(400, "EMAIL_INVALID", rateLimitHeaders(rateLimit));
    }
    if (!business || business.length < 2) {
      return jsonError(400, "BUSINESS_REQUIRED", rateLimitHeaders(rateLimit));
    }
    if (body.consent !== true) {
      return jsonError(400, "CONSENT_REQUIRED", rateLimitHeaders(rateLimit));
    }

    const attribution = {
      utmSource: clean(body.utmSource, 120),
      utmMedium: clean(body.utmMedium, 120),
      utmCampaign: clean(body.utmCampaign, 160),
      utmContent: clean(body.utmContent, 160),
      utmTerm: clean(body.utmTerm, 160),
    };
    const submissionFingerprint = fingerprintMarketingLeadSubmission({
      name,
      email,
      business,
      city,
      businessType,
      ...attribution,
    });
    const nowMs = Date.now();

    // Stable hash avoids exposing an email address in document IDs while also
    // deduplicating repeated submissions from the same address.
    const leadId = createHash("sha256").update(email).digest("hex");
    const ref = db.collection("_marketingLeads").doc(leadId);

    await db.runTransaction(async (transaction) => {
      const previous = await transaction.get(ref);
      const previousData = previous.exists ? previous.data() : undefined;
      const lastFingerprint =
        typeof previousData?.lastSubmissionFingerprint === "string"
          ? previousData.lastSubmissionFingerprint
          : "";
      const lastSubmissionAtMs =
        typeof previousData?.lastSubmissionAtMs === "number"
          ? previousData.lastSubmissionAtMs
          : 0;
      const duplicate =
        previous.exists &&
        lastFingerprint === submissionFingerprint &&
        nowMs - lastSubmissionAtMs >= 0 &&
        nowMs - lastSubmissionAtMs < MARKETING_LEAD_DUPLICATE_WINDOW_MS;

      if (duplicate) return;

      transaction.set(
        ref,
        {
          name,
          email,
          business,
          city,
          businessType,
          consent: true,
          status: previous.exists
            ? previousData?.status ?? "identified"
            : "identified",
          source: "marketing_landing",
          attribution,
          lastSubmittedAt: FieldValue.serverTimestamp(),
          lastSubmissionAtMs: nowMs,
          lastSubmissionFingerprint: submissionFingerprint,
          submissionCount: FieldValue.increment(1),
          ...(previous.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true },
      );
    });

    return jsonResponse(
      { ok: true },
      { headers: rateLimitHeaders(rateLimit) },
    );
  } catch (error) {
    console.error("[marketing/leads]", error);
    return jsonError(500, "LEAD_CREATE_FAILED");
  }
}
