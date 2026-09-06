import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import {
  canonicalTwilioUrl,
  normalizePhoneNumber,
  twimlSayAndGather,
  twimlSayAndHangup,
  validateTwilioSignature,
} from "@/lib/phone-ai/twilio";
import {
  resolveRestaurantForIncomingNumber,
  upsertPhoneAiSession,
} from "@/lib/server/phone-ai/phone-ai-center";

function xml(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!validateTwilioSignature({ authToken, url: canonicalTwilioUrl(req), params, signature })) {
    return xml(twimlSayAndHangup("No se ha podido validar la llamada."), 403);
  }

  const db = getHostlyFirestore();
  if (!db) return xml(twimlSayAndHangup("El servicio telefónico no está disponible ahora mismo."), 503);
  const to = normalizePhoneNumber(params.get("To"));
  const from = normalizePhoneNumber(params.get("From"));
  const callSid = (params.get("CallSid") ?? "").trim().slice(0, 100);
  if (!to || !callSid) return xml(twimlSayAndHangup("No se ha podido identificar la llamada."), 400);

  const resolved = await resolveRestaurantForIncomingNumber(db, to);
  if (!resolved) return xml(twimlSayAndHangup("Este número todavía no tiene el asistente Hostly activado."), 404);

  await upsertPhoneAiSession(db, {
    restaurantId: resolved.restaurantId,
    callSid,
    callerPhone: from,
    turns: 0,
  });

  const turnUrl = new URL("/api/webhooks/twilio/phone-ai/turn", canonicalTwilioUrl(req)).toString();
  return xml(twimlSayAndGather({
    message: "Hola. Soy el asistente telefónico de Hostly. Puedo ayudarte a solicitar una reserva. Dime para qué día, a qué hora y para cuántas personas.",
    actionUrl: turnUrl,
    language: resolved.settings.language,
  }));
}
