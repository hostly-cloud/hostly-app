import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import {
  mergeReservationDraft,
  parsePhoneAiTurn,
  reservationDraftComplete,
} from "@/lib/phone-ai/intent";
import {
  canonicalTwilioUrl,
  normalizePhoneNumber,
  twimlSayAndGather,
  twimlSayAndHangup,
  validateTwilioSignature,
  xmlEscape,
} from "@/lib/phone-ai/twilio";
import { createOperationalReservation } from "@/lib/server/reservas/reservation-operations";
import {
  readPhoneAiSession,
  resolveRestaurantForIncomingNumber,
  upsertPhoneAiSession,
} from "@/lib/server/phone-ai/phone-ai-center";

function xml(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function madridDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function handoff(message: string, fallbackPhone: string, language: string): string {
  if (!fallbackPhone) return twimlSayAndHangup(message, language);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="${xmlEscape(language)}">${xmlEscape(message)}</Say><Dial>${xmlEscape(fallbackPhone)}</Dial></Response>`;
}

function confirmationMessage(draft: NonNullable<ReturnType<typeof mergeReservationDraft>>): string {
  return `Te repito la solicitud: ${draft.customerName}, ${draft.partySize} personas, el ${draft.date} a las ${draft.time}. Si está correcto, di sí, confirmo. Si quieres cambiar algo, dímelo ahora.`;
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
  const callSid = (params.get("CallSid") ?? "").trim().slice(0, 100);
  const transcript = (params.get("SpeechResult") ?? "").trim().slice(0, 1000);
  if (!to || !callSid) return xml(twimlSayAndHangup("No se ha podido identificar la llamada."), 400);

  const resolved = await resolveRestaurantForIncomingNumber(db, to);
  if (!resolved) return xml(twimlSayAndHangup("Este número no tiene el asistente activado."), 404);
  const session = await readPhoneAiSession(db, resolved.restaurantId, callSid);
  if (!session) return xml(twimlSayAndHangup("La sesión de llamada ha caducado. Vuelve a llamar, por favor."), 409);
  if (session.reservationId) {
    return xml(twimlSayAndHangup("Tu solicitud de reserva ya está registrada. El restaurante la confirmará lo antes posible.", resolved.settings.language));
  }
  if (session.turns >= 6) {
    return xml(handoff("Para no hacerte perder tiempo, te paso con el restaurante.", resolved.settings.fallbackPhone, resolved.settings.language));
  }
  if (!transcript) {
    const turnUrl = new URL("/api/webhooks/twilio/phone-ai/turn", canonicalTwilioUrl(req)).toString();
    return xml(twimlSayAndGather({ message: "No te he oído bien. Repítelo, por favor.", actionUrl: turnUrl, language: resolved.settings.language }));
  }

  const previousWasComplete = reservationDraftComplete(session.reservation);
  const parsed = await parsePhoneAiTurn({
    transcript,
    currentDate: madridDate(),
    previousReservation: session.reservation,
  });
  const draft = mergeReservationDraft(session.reservation, parsed.reservation);
  const nextSession = { ...session, turns: session.turns + 1, reservation: draft };

  if (parsed.needsHuman || parsed.intent === "handoff" || parsed.intent === "info") {
    await upsertPhoneAiSession(db, nextSession);
    return xml(handoff("Te paso con el restaurante para darte una respuesta segura.", resolved.settings.fallbackPhone, resolved.settings.language));
  }

  if (parsed.intent !== "reservation") {
    await upsertPhoneAiSession(db, nextSession);
    const turnUrl = new URL("/api/webhooks/twilio/phone-ai/turn", canonicalTwilioUrl(req)).toString();
    return xml(twimlSayAndGather({ message: "Ahora mismo puedo ayudarte con una solicitud de reserva. Dime día, hora y número de personas.", actionUrl: turnUrl, language: resolved.settings.language }));
  }

  if (previousWasComplete && parsed.reservation?.confirmed === true) {
    const stableDraft = session.reservation;
    if (!reservationDraftComplete(stableDraft)) {
      return xml(twimlSayAndHangup("No he podido confirmar todos los datos. Te paso con el restaurante.", resolved.settings.language));
    }
    try {
      const created = await createOperationalReservation({
        db,
        restaurantId: resolved.restaurantId,
        userId: `phone-ai:${callSid}`,
        input: {
          customerName: stableDraft.customerName,
          customerPhone: session.callerPhone,
          date: stableDraft.date,
          time: stableDraft.time,
          partySize: stableDraft.partySize,
          status: "pending",
          notes: ["Solicitud recibida por Teléfono IA", stableDraft.notes].filter(Boolean).join(" · "),
        },
      });
      await upsertPhoneAiSession(db, { ...nextSession, reservation: stableDraft, reservationId: created.id });
      return xml(twimlSayAndHangup("Perfecto. He registrado tu solicitud de reserva. El restaurante la confirmará; todavía no te estoy prometiendo disponibilidad. Gracias.", resolved.settings.language));
    } catch {
      await upsertPhoneAiSession(db, nextSession);
      return xml(handoff("No he podido registrar la solicitud con seguridad. Te paso con el restaurante.", resolved.settings.fallbackPhone, resolved.settings.language));
    }
  }

  await upsertPhoneAiSession(db, nextSession);
  const turnUrl = new URL("/api/webhooks/twilio/phone-ai/turn", canonicalTwilioUrl(req)).toString();
  const message = reservationDraftComplete(draft) ? confirmationMessage(draft) : parsed.reply;
  return xml(twimlSayAndGather({ message, actionUrl: turnUrl, language: resolved.settings.language }));
}
