import { createHmac, timingSafeEqual } from "node:crypto";

export function normalizePhoneNumber(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const plus = raw.startsWith("+") ? "+" : "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return `${plus}${digits}`;
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function twimlSayAndGather(args: {
  message: string;
  actionUrl: string;
  language?: string;
}): string {
  const language = args.language || "es-ES";
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${xmlEscape(args.actionUrl)}" method="POST" speechTimeout="auto" language="${xmlEscape(language)}"><Say language="${xmlEscape(language)}">${xmlEscape(args.message)}</Say></Gather><Say language="${xmlEscape(language)}">No he podido oírte. Te paso con el restaurante.</Say><Hangup/></Response>`;
}

export function twimlSayAndHangup(message: string, language = "es-ES"): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="${xmlEscape(language)}">${xmlEscape(message)}</Say><Hangup/></Response>`;
}

export function validateTwilioSignature(args: {
  authToken: string;
  url: string;
  params: URLSearchParams;
  signature: string;
}): boolean {
  if (!args.authToken || !args.signature || !args.url) return false;
  const sorted = [...args.params.entries()].sort(([a], [b]) => a.localeCompare(b));
  let payload = args.url;
  for (const [key, value] of sorted) payload += `${key}${value}`;
  const expected = createHmac("sha1", args.authToken).update(payload).digest("base64");
  const left = Buffer.from(expected);
  const right = Buffer.from(args.signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function canonicalTwilioUrl(req: Request): string {
  const configured = process.env.HOSTLY_PHONE_AI_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "");
  const parsed = new URL(req.url);
  return configured ? `${configured}${parsed.pathname}${parsed.search}` : req.url;
}
