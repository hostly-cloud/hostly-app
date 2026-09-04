import { buildHostlyHealthSnapshot } from "@/lib/observability/hostly-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEALTH_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export async function GET(): Promise<Response> {
  return Response.json(buildHostlyHealthSnapshot(), {
    status: 200,
    headers: HEALTH_HEADERS,
  });
}

export async function HEAD(): Promise<Response> {
  return new Response(null, {
    status: 200,
    headers: HEALTH_HEADERS,
  });
}
