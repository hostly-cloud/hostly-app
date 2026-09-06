import { generateText } from "ai";

export type PhoneAiIntent = "reservation" | "info" | "handoff" | "unknown";

export type PhoneAiTurn = {
  intent: PhoneAiIntent;
  reply: string;
  reservation?: {
    customerName?: string;
    date?: string;
    time?: string;
    partySize?: number;
    notes?: string;
    confirmed?: boolean;
  };
  needsHuman?: boolean;
};

type RawTurn = Record<string, unknown>;

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function parseJson(text: string): RawTurn | null {
  const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = JSON.parse(candidate);
    return value && typeof value === "object" ? value as RawTurn : null;
  } catch {
    return null;
  }
}

export async function parsePhoneAiTurn(args: {
  transcript: string;
  currentDate: string;
  previousReservation?: PhoneAiTurn["reservation"];
}): Promise<PhoneAiTurn> {
  const fallback: PhoneAiTurn = {
    intent: "handoff",
    reply: "No he entendido bien la petición. Te paso con el restaurante para ayudarte.",
    needsHuman: true,
  };
  const transcript = clean(args.transcript, 1000);
  if (!transcript) return fallback;

  try {
    const result = await generateText({
      model: process.env.HOSTLY_PHONE_AI_MODEL?.trim() || "openai/gpt-5-mini",
      maxRetries: 1,
      prompt: [
        "Eres el recepcionista telefónico de un restaurante que usa Hostly.",
        "Clasifica SOLO entre reservation, info, handoff, unknown.",
        "No inventes disponibilidad, horarios, dirección, precios ni políticas.",
        "Para reservation extrae únicamente: customerName, date YYYY-MM-DD, time HH:mm, partySize entero 1-100, notes y confirmed.",
        "confirmed solo puede ser true si el cliente confirma explícitamente una propuesta completa en este turno.",
        "Si faltan datos, pide SOLO el siguiente dato necesario en reply.",
        "Si piden pagos, datos bancarios, reclamaciones delicadas, modificaciones complejas o algo que no puedas asegurar, usa handoff.",
        "Devuelve JSON estricto: {intent,reply,reservation?,needsHuman?}.",
        `Fecha local del restaurante: ${args.currentDate}`,
        `Datos de reserva ya recogidos: ${JSON.stringify(args.previousReservation ?? {})}`,
        `Cliente: ${transcript}`,
      ].join("\n"),
      providerOptions: {
        gateway: {
          tags: ["hostly", "phone-ai"],
          disallowPromptTraining: true,
        },
      },
    });
    const raw = parseJson(result.text);
    if (!raw) return fallback;
    const rawIntent = clean(raw.intent, 20);
    const intent: PhoneAiIntent = rawIntent === "reservation" || rawIntent === "info" || rawIntent === "handoff" || rawIntent === "unknown" ? rawIntent : "unknown";
    const rawReservation = raw.reservation && typeof raw.reservation === "object" ? raw.reservation as Record<string, unknown> : undefined;
    const partySize = rawReservation ? Math.round(Number(rawReservation.partySize)) : NaN;
    const reservation = rawReservation ? {
      ...(clean(rawReservation.customerName, 160) ? { customerName: clean(rawReservation.customerName, 160) } : {}),
      ...(clean(rawReservation.date, 10) ? { date: clean(rawReservation.date, 10) } : {}),
      ...(clean(rawReservation.time, 5) ? { time: clean(rawReservation.time, 5) } : {}),
      ...(Number.isFinite(partySize) && partySize >= 1 && partySize <= 100 ? { partySize } : {}),
      ...(clean(rawReservation.notes, 500) ? { notes: clean(rawReservation.notes, 500) } : {}),
      ...(rawReservation.confirmed === true ? { confirmed: true } : {}),
    } : undefined;
    return {
      intent,
      reply: clean(raw.reply, 500) || fallback.reply,
      ...(reservation ? { reservation } : {}),
      needsHuman: raw.needsHuman === true || intent === "handoff",
    };
  } catch {
    return fallback;
  }
}

export function mergeReservationDraft(
  previous: PhoneAiTurn["reservation"] | undefined,
  next: PhoneAiTurn["reservation"] | undefined,
): NonNullable<PhoneAiTurn["reservation"]> {
  return { ...(previous ?? {}), ...(next ?? {}) };
}

export function reservationDraftComplete(value: PhoneAiTurn["reservation"]): value is Required<Pick<NonNullable<PhoneAiTurn["reservation"]>, "customerName" | "date" | "time" | "partySize">> & NonNullable<PhoneAiTurn["reservation"]> {
  return Boolean(value?.customerName && /^\d{4}-\d{2}-\d{2}$/.test(value.date ?? "") && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time ?? "") && Number.isFinite(value.partySize));
}
