"use client";

import { Mic, MicOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HostlyButton } from "@/components/ui/hostly";
import {
  TPV_VOICE_COMMAND_EVENT,
  TPV_VOICE_FEEDBACK_EVENT,
  type TpvVoiceCommandDetail,
  type TpvVoiceFeedbackDetail,
  type TpvVoiceFeedbackTone,
} from "@/lib/tpv/voice-command";
import {
  canonicalizeTpvVoiceTranscript,
  getTpvVoiceUi,
  resolveTpvVoiceLanguage,
  resolveTpvVoiceSpeechLocale,
  type TpvVoiceLanguage,
} from "@/lib/tpv/voice-language";

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

type VoicePreviewDetail = {
  transcript: string;
  summary: string;
  canConfirm: boolean;
  tone: TpvVoiceFeedbackTone;
};

const TPV_VOICE_PREVIEW_REQUEST_EVENT = "hostly:tpv-voice-preview-request";
const TPV_VOICE_PREVIEW_EVENT = "hostly:tpv-voice-preview";

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getVoiceErrorMessage(
  error: string | undefined,
  copy: ReturnType<typeof getTpvVoiceUi>,
): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return copy.permissionError;
  }
  if (error === "no-speech") return copy.noSpeechError;
  if (error === "audio-capture") return copy.audioError;
  return copy.genericListenError;
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

function joinTranscriptParts(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function TpvVoiceCommandButton() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const captureRequestedRef = useRef(false);
  const suppressFinalizeRef = useRef(false);
  const accumulatedTranscriptRef = useRef("");
  const currentCycleTranscriptRef = useRef("");
  const rawTranscriptRef = useRef("");
  const canonicalTranscriptRef = useRef("");
  const [language, setLanguage] = useState<TpvVoiceLanguage>("es");
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<TpvVoiceFeedbackTone>("info");
  const [preview, setPreview] = useState<VoicePreviewDetail | null>(null);
  const copy = getTpvVoiceUi(language);

  useEffect(() => {
    const syncWithHostlyLocale = () => setLanguage(resolveTpvVoiceLanguage());
    syncWithHostlyLocale();

    const observer = new MutationObserver(syncWithHostlyLocale);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });

    const storageHandler = (event: StorageEvent) => {
      if (event.key === "hostly.locale" || event.key === "hostly:tpv-language") {
        syncWithHostlyLocale();
      }
    };
    window.addEventListener("storage", storageHandler);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  const clearMessageTimer = useCallback(() => {
    if (messageTimerRef.current != null) {
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
  }, []);

  const showMessage = useCallback(
    (nextMessage: string, tone: TpvVoiceFeedbackTone = "info") => {
      setMessage(nextMessage);
      setMessageTone(tone);
      clearMessageTimer();
      messageTimerRef.current = window.setTimeout(() => {
        messageTimerRef.current = null;
        setMessage(null);
      }, 3200);
    },
    [clearMessageTimer],
  );

  const finalizeCapturedSpeech = useCallback(() => {
    const transcript = joinTranscriptParts(
      accumulatedTranscriptRef.current,
      currentCycleTranscriptRef.current,
    );
    accumulatedTranscriptRef.current = "";
    currentCycleTranscriptRef.current = "";

    if (!transcript) {
      showMessage(copy.noSpeechError, "error");
      return;
    }

    const canonicalTranscript = canonicalizeTpvVoiceTranscript(transcript, language);
    rawTranscriptRef.current = transcript;
    canonicalTranscriptRef.current = canonicalTranscript;
    setMessage(copy.interpreting(transcript));
    setMessageTone("info");

    const detail = { transcript: canonicalTranscript, source: "tpv" as const };
    window.dispatchEvent(
      new CustomEvent(TPV_VOICE_PREVIEW_REQUEST_EVENT, { detail }),
    );
  }, [copy, language, showMessage]);

  useEffect(() => {
    const feedbackHandler = (event: Event) => {
      const detail = (event as CustomEvent<TpvVoiceFeedbackDetail>).detail;
      const nextMessage = detail?.message?.trim() ?? "";
      if (!nextMessage) return;
      setPreview(null);
      showMessage(nextMessage, detail.tone ?? "info");
    };
    window.addEventListener(TPV_VOICE_FEEDBACK_EVENT, feedbackHandler);
    return () => window.removeEventListener(TPV_VOICE_FEEDBACK_EVENT, feedbackHandler);
  }, [showMessage]);

  useEffect(() => {
    const previewHandler = (event: Event) => {
      const detail = (event as CustomEvent<VoicePreviewDetail>).detail;
      if (!detail?.transcript?.trim() || !detail?.summary?.trim()) return;
      clearMessageTimer();
      setMessage(null);
      setPreview({
        ...detail,
        transcript: rawTranscriptRef.current || detail.transcript,
      });
    };

    window.addEventListener(TPV_VOICE_PREVIEW_EVENT, previewHandler);
    return () => window.removeEventListener(TPV_VOICE_PREVIEW_EVENT, previewHandler);
  }, [clearMessageTimer]);

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = resolveTpvVoiceSpeechLocale();

    const startCycle = () => {
      if (!captureRequestedRef.current) return;
      recognition.lang = resolveTpvVoiceSpeechLocale();
      currentCycleTranscriptRef.current = "";
      try {
        recognition.start();
      } catch {
        captureRequestedRef.current = false;
        setListening(false);
        showMessage(copy.activationError, "error");
      }
    };

    recognition.onstart = () => {
      setListening(true);
      setPreview(null);
      setMessage(copy.listening);
      setMessageTone("info");
      clearMessageTimer();
    };

    recognition.onresult = (event) => {
      const results = event.results;
      if (!results?.length) return;
      const parts: string[] = [];
      for (let index = 0; index < results.length; index += 1) {
        const transcript = results[index]?.[0]?.transcript?.trim() ?? "";
        if (transcript) parts.push(transcript);
      }
      currentCycleTranscriptRef.current = joinTranscriptParts(...parts);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" && captureRequestedRef.current) {
        return;
      }
      suppressFinalizeRef.current = true;
      captureRequestedRef.current = false;
      setListening(false);
      setPreview(null);
      showMessage(getVoiceErrorMessage(event.error, copy), "error");
    };

    recognition.onend = () => {
      accumulatedTranscriptRef.current = joinTranscriptParts(
        accumulatedTranscriptRef.current,
        currentCycleTranscriptRef.current,
      );
      currentCycleTranscriptRef.current = "";

      if (captureRequestedRef.current) {
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          startCycle();
        }, 120);
        return;
      }

      setListening(false);
      if (suppressFinalizeRef.current) {
        suppressFinalizeRef.current = false;
        accumulatedTranscriptRef.current = "";
        return;
      }
      finalizeCapturedSpeech();
    };

    recognitionRef.current = recognition;

    return () => {
      captureRequestedRef.current = false;
      if (restartTimerRef.current != null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      clearMessageTimer();
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [clearMessageTimer, copy, finalizeCapturedSpeech, showMessage]);

  const toggleVoiceCommand = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      showMessage(copy.unavailable, "error");
      return;
    }

    if (captureRequestedRef.current) {
      captureRequestedRef.current = false;
      if (restartTimerRef.current != null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
        setListening(false);
        finalizeCapturedSpeech();
        return;
      }
      setListening(false);
      try {
        recognition.stop();
      } catch {
        finalizeCapturedSpeech();
      }
      return;
    }

    accumulatedTranscriptRef.current = "";
    currentCycleTranscriptRef.current = "";
    rawTranscriptRef.current = "";
    canonicalTranscriptRef.current = "";
    suppressFinalizeRef.current = false;
    captureRequestedRef.current = true;
    setPreview(null);
    clearMessageTimer();
    setMessage(copy.listening);
    setMessageTone("info");

    try {
      recognition.lang = resolveTpvVoiceSpeechLocale();
      recognition.start();
    } catch {
      captureRequestedRef.current = false;
      setListening(false);
      showMessage(copy.activationError, "error");
    }
  };

  const confirmPreview = () => {
    if (!preview?.canConfirm) return;
    const transcript = canonicalTranscriptRef.current.trim();
    if (!transcript) return;
    const detail: TpvVoiceCommandDetail = {
      transcript,
      source: "tpv",
    };
    setPreview(null);
    setMessage(copy.sending);
    setMessageTone("info");
    window.dispatchEvent(
      new CustomEvent<TpvVoiceCommandDetail>(TPV_VOICE_COMMAND_EVENT, { detail }),
    );
  };

  const cancelPreview = () => {
    rawTranscriptRef.current = "";
    canonicalTranscriptRef.current = "";
    setPreview(null);
    setMessage(null);
  };

  return (
    <>
      {preview ? (
        <div
          role="dialog"
          aria-label={copy.dialogLabel}
          className={`fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-4 z-[72] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border p-3 shadow-[var(--hostly-shadow-card)] sm:bottom-[7rem] sm:left-6 ${feedbackToneClass(preview.tone)}`}
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-65">
            {copy.hasSaid}
          </div>
          <div className="mt-1 text-sm font-semibold">“{preview.transcript}”</div>

          <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] opacity-65">
            {copy.understood}
          </div>
          <div className="mt-1 text-sm font-bold leading-5">{preview.summary}</div>

          <div className="mt-3 flex gap-2">
            <HostlyButton
              variant="secondary"
              size="compact"
              onClick={cancelPreview}
              className="flex-1"
            >
              {copy.cancel}
            </HostlyButton>
            {preview.canConfirm ? (
              <HostlyButton
                variant="primary"
                size="compact"
                onClick={confirmPreview}
                className="flex-1"
              >
                {copy.confirm}
              </HostlyButton>
            ) : (
              <HostlyButton
                variant="primary"
                size="compact"
                onClick={() => {
                  cancelPreview();
                  window.setTimeout(() => toggleVoiceCommand(), 80);
                }}
                className="flex-1"
              >
                {copy.repeat}
              </HostlyButton>
            )}
          </div>
        </div>
      ) : null}

      {message && !preview ? (
        <div
          role="status"
          aria-live="polite"
          data-tone={messageTone}
          className={`fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-4 z-[71] max-w-[min(22rem,calc(100vw-2rem))] rounded-2xl border px-3 py-2 text-xs font-semibold shadow-[var(--hostly-shadow-card)] sm:bottom-[7rem] sm:left-6 ${feedbackToneClass(messageTone)}`}
        >
          {message}
        </div>
      ) : null}

      <HostlyButton
        variant="icon"
        size="touch"
        active={listening}
        iconOnlyLabel={listening ? copy.stop : copy.start}
        title={listening ? copy.stop : copy.title}
        onClick={toggleVoiceCommand}
        data-hostly-tpv-voice-trigger
        data-recording={listening ? "true" : "false"}
        className={`fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-4 z-[70] inline-flex size-16 min-h-16 min-w-16 items-center justify-center rounded-full border-2 border-white/80 bg-[var(--hostly-navy-deep)] p-0 text-white shadow-[0_10px_30px_rgba(11,42,65,0.28)] transition-transform duration-150 hover:scale-[1.03] hover:bg-[var(--hostly-navy-mid)] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hostly-accent)] sm:left-6 ${listening ? "ring-4 ring-sky-200 shadow-[0_12px_34px_rgba(11,42,65,0.38)]" : ""}`}
      >
        {listening ? (
          <MicOff aria-hidden size={27} strokeWidth={2.35} />
        ) : (
          <Mic aria-hidden size={27} strokeWidth={2.35} />
        )}
      </HostlyButton>
    </>
  );
}
