"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HostlyButton } from "@/components/ui/hostly";
import {
  TPV_VOICE_COMMAND_EVENT,
  TPV_VOICE_FEEDBACK_EVENT,
  type TpvVoiceCommandDetail,
  type TpvVoiceFeedbackDetail,
  type TpvVoiceFeedbackTone,
} from "@/lib/tpv/voice-command";

type SpeechRecognitionResultLike = {
  0?: { transcript?: string };
};

type SpeechRecognitionEventLike = {
  results?: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getVoiceErrorMessage(error?: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Necesito permiso para usar el micrófono.";
  }
  if (error === "no-speech") return "No he oído ningún comando.";
  if (error === "audio-capture") return "No encuentro un micrófono disponible.";
  return "No he podido escuchar el comando.";
}

function feedbackToneClass(tone: TpvVoiceFeedbackTone): string {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }
  if (tone === "error") {
    return "border-red-200 bg-red-50 text-red-950";
  }
  return "border-[var(--hostly-line-strong)] bg-white text-[var(--hostly-navy-deep)]";
}

export function TpvVoiceCommandButton() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<TpvVoiceFeedbackTone>("info");

  const showMessage = (nextMessage: string, tone: TpvVoiceFeedbackTone = "info") => {
    setMessage(nextMessage);
    setMessageTone(tone);
    if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current = window.setTimeout(() => setMessage(null), 3200);
  };

  useEffect(() => {
    const feedbackHandler = (event: Event) => {
      const detail = (event as CustomEvent<TpvVoiceFeedbackDetail>).detail;
      const nextMessage = detail?.message?.trim() ?? "";
      if (!nextMessage) return;
      showMessage(nextMessage, detail.tone ?? "info");
    };
    window.addEventListener(TPV_VOICE_FEEDBACK_EVENT, feedbackHandler);
    return () => window.removeEventListener(TPV_VOICE_FEEDBACK_EVENT, feedbackHandler);
  }, []);

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setSupported(false);
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "es-ES";

    recognition.onstart = () => {
      setListening(true);
      setMessage("Escuchando…");
      setMessageTone("info");
      if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
    };

    recognition.onresult = (event) => {
      const results = event.results;
      const lastResult = results?.length ? results[results.length - 1] : undefined;
      const transcript = lastResult?.[0]?.transcript?.trim() ?? "";
      if (!transcript) return;

      setMessage(`Procesando: “${transcript}”`);
      setMessageTone("info");
      const detail: TpvVoiceCommandDetail = { transcript, source: "tpv" };
      window.dispatchEvent(
        new CustomEvent<TpvVoiceCommandDetail>(TPV_VOICE_COMMAND_EVENT, { detail }),
      );
    };

    recognition.onerror = (event) => {
      setListening(false);
      showMessage(getVoiceErrorMessage(event.error), "error");
    };

    recognition.onend = () => {
      setListening(false);
      if (messageTimerRef.current == null && message === "Escuchando…") {
        showMessage("No he recibido ningún comando.", "error");
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  const toggleVoiceCommand = () => {
    if (!supported || !recognitionRef.current) {
      showMessage("Los comandos por voz no están disponibles en este navegador.", "error");
      return;
    }

    try {
      if (listening) recognitionRef.current.stop();
      else recognitionRef.current.start();
    } catch {
      setListening(false);
      showMessage("No he podido activar el micrófono.", "error");
    }
  };

  return (
    <>
      {message ? (
        <div
          role="status"
          aria-live="polite"
          data-tone={messageTone}
          className={`fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-[71] max-w-[min(22rem,calc(100vw-2rem))] rounded-2xl border px-3 py-2 text-xs font-semibold shadow-[var(--hostly-shadow-card)] sm:bottom-[5.5rem] sm:right-6 ${feedbackToneClass(messageTone)}`}
        >
          {message}
        </div>
      ) : null}

      <HostlyButton
        variant="icon"
        size="touch"
        active={listening}
        iconOnlyLabel={listening ? "Detener comando por voz" : "Iniciar comando por voz"}
        title={listening ? "Detener comando por voz" : "Comando por voz"}
        onClick={toggleVoiceCommand}
        data-hostly-tpv-voice-trigger
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[70] inline-flex size-12 min-h-12 min-w-12 items-center justify-center rounded-full border border-[var(--hostly-navy-deep)] bg-[var(--hostly-navy-deep)] p-0 text-white shadow-[var(--hostly-shadow-card)] transition hover:bg-[var(--hostly-navy-mid)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hostly-accent)] data-[active=true]:border-[var(--hostly-accent)] data-[active=true]:bg-[var(--hostly-accent)] sm:bottom-6 sm:right-6"
      >
        {listening ? (
          <MicOff aria-hidden size={20} strokeWidth={2.2} />
        ) : (
          <Mic aria-hidden size={20} strokeWidth={2.2} />
        )}
      </HostlyButton>
    </>
  );
}
