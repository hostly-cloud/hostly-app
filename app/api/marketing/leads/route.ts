import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";

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

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as LeadPayload | null;
    if (!body || typeof body !== "object") return jsonError(400, "INVALID_JSON");

    // Honeypot: bots commonly fill hidden website fields. Return success so the
    // endpoint does not become an oracle for spam tooling.
    if (clean(body.website, 200)) {
      return NextResponse.json({ ok: true });
    }

    const name = clean(body.name, 100);
    const email = clean(body.email, 180).toLowerCase();
    const business = clean(body.business, 140);
    const city = clean(body.city, 100);
    const businessType = clean(body.businessType, 80);

    if (!name || name.length < 2) return jsonError(400, "NAME_REQUIRED");
    if (!EMAIL_RE.test(email)) return jsonError(400, "EMAIL_INVALID");
    if (!business || business.length < 2) return jsonError(400, "BUSINESS_REQUIRED");
    if (body.consent !== true) return jsonError(400, "CONSENT_REQUIRED");

    const db = getHostlyFirestore();
    if (!db) return jsonError(503, "LEAD_STORAGE_UNAVAILABLE");

    // Stable hash avoids exposing an email address in document IDs while also
    // deduplicating repeated submissions from the same address.
    const leadId = createHash("sha256").update(email).digest("hex");
    const ref = db.collection("_marketingLeads").doc(leadId);
    const previous = await ref.get();

    const attribution = {
      utmSource: clean(body.utmSource, 120),
      utmMedium: clean(body.utmMedium, 120),
      utmCampaign: clean(body.utmCampaign, 160),
      utmContent: clean(body.utmContent, 160),
      utmTerm: clean(body.utmTerm, 160),
    };

    await ref.set(
      {
        name,
        email,
        business,
        city,
        businessType,
        consent: true,
        status: previous.exists ? previous.data()?.status ?? "identified" : "identified",
        source: "marketing_landing",
        attribution,
        lastSubmittedAt: FieldValue.serverTimestamp(),
        submissionCount: FieldValue.increment(1),
        ...(previous.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[marketing/leads]", error);
    return jsonError(500, "LEAD_CREATE_FAILED");
  }
}
