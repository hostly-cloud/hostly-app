import { NextResponse } from "next/server";

const QR_ORIGIN = "https://api.qrserver.com/v1/create-qr-code/";

function safeToken(value: string | null) {
  if (!value || value.length > 256) return "";
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : "";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = safeToken(url.searchParams.get("token"));
  if (!token) {
    return NextResponse.json({ ok: false, error: "INVALID_CLOCKING_QR_TOKEN" }, { status: 400 });
  }
  const destination = `${url.origin}/dashboard/fichar?token=${encodeURIComponent(token)}`;
  const qrUrl = new URL(QR_ORIGIN);
  qrUrl.searchParams.set("size", "360x360");
  qrUrl.searchParams.set("margin", "10");
  qrUrl.searchParams.set("format", "svg");
  qrUrl.searchParams.set("data", destination);
  try {
    const response = await fetch(qrUrl, {
      headers: { Accept: "image/svg+xml" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`QR_UPSTREAM_${response.status}`);
    const body = await response.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/svg+xml",
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[employees/clocking/qr]", error);
    return NextResponse.json({ ok: false, error: "CLOCKING_QR_RENDER_FAILED" }, { status: 502 });
  }
}
