"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HostlyButton } from "@/components/ui/hostly";

export const TPV_VOICE_COMMAND_EVENT = "hostly:tpv-voice-command";

type TpvVoiceCommandDetail = {
  transcript: string;
  source: "tpv";
};

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

export function TpvVoiceCommandButton() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

    const clearMessageLater = () => {
      if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = window.setTimeout(() => setMessage(null), 2800);
    };

    recognition.onstart = () => {
      setListening(true);
      setMessage("Escuchando…");
      if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
    };

    recognition.onresult = (event) => {
      const results = event.results;
      const lastResult = results?.length ? results[results.length - 1] : undefined;
      const transcript = lastResult?.[0]?.transcript?.trim() ?? "";
      if (!transcript) return;

      const detail: TpvVoiceCommandDetail = { transcript, source: "tpv" };
      window.dispatchEvent(new CustomEvent<TpvVoiceCommandDetail>(TPV_VOICE_COMMAND_EVENT, { detail }));
      setMessage(`He oído: “${transcript}”`);
      clearMessageLater();
    };

    recognition.onerror = (event) => {
      setListening(false);
      setMessage(getVoiceErrorMessage(event.error));
      clearMessageLater();
    };

    recognition.onend = () => {
      setListening(false);
      clearMessageLater();
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
      setMessage("Los comandos por voz no están disponibles en este navegador.");
      if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = window.setTimeout(() => setMessage(null), 2800);
      return;
    }

    try {
      if (listening) recognitionRef.current.stop();
      else recognitionRef.current.start();
    } catch {
      setListening(false);
      setMessage("No he podido activar el micrófono.");
    }
  };

  return (
    <>
      {message ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-[71] max-w-[min(20rem,calc(100vw-2rem))] rounded-full border border-[var(--hostly-line-strong)] bg-white px-3 py-2 text-xs font-semibold text-[var(--hostly-navy-deep)] shadow-[var(--hostly-shadow-card)] sm:bottom-[5.5rem] sm:right-6"
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
        {listening ? <MicOff aria-hidden size={20} strokeWidth={2.2} /> : <Mic aria-hidden size={20} strokeWidth={2.2} />}
      </HostlyButton>
    </>
  );
}
