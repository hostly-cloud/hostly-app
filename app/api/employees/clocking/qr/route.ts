import qrcode from "qrcode-generator";
import { NextResponse } from "next/server";

function safeToken(value: string | null) {
  if (!value || value.length > 256) return "";
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : "";
}

function renderClockingQr(destination: string) {
  const qr = qrcode(0, "M");
  qr.addData(destination, "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 32, scalable: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = safeToken(url.searchParams.get("token"));
  if (!token) {
    return NextResponse.json({ ok: false, error: "INVALID_CLOCKING_QR_TOKEN" }, { status: 400 });
  }

  const destination = `${url.origin}/dashboard/fichar?token=${encodeURIComponent(token)}`;

  try {
    const svg = renderClockingQr(destination);
    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[employees/clocking/qr]", error);
    return NextResponse.json({ ok: false, error: "CLOCKING_QR_RENDER_FAILED" }, { status: 500 });
  }
}
