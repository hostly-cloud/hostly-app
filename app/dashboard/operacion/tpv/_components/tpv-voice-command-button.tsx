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
  getTpvVoiceUi,
  persistTpvVoiceLanguage,
  resolveTpvVoiceLanguage,
  speechLocaleForTpvVoiceLanguage,
  TPV_VOICE_LANGUAGE_OPTIONS,
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

export function TpvVoiceCommandButton() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const [language, setLanguage] = useState<TpvVoiceLanguage>("es");
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<TpvVoiceFeedbackTone>("info");
  const [preview, setPreview] = useState<VoicePreviewDetail | null>(null);
  const copy = getTpvVoiceUi(language);

  useEffect(() => {
    setLanguage(resolveTpvVoiceLanguage());
  }, []);

  const showMessage = useCallback(
    (nextMessage: string, tone: TpvVoiceFeedbackTone = "info") => {
      setMessage(nextMessage);
      setMessageTone(tone);
      if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = window.setTimeout(() => {
        messageTimerRef.current = null;
        setMessage(null);
      }, 3200);
    },
    [],
  );

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
      if (messageTimerRef.current != null) {
        window.clearTimeout(messageTimerRef.current);
        messageTimerRef.current = null;
      }
      setMessage(null);
      setPreview(detail);
    };

    window.addEventListener(TPV_VOICE_PREVIEW_EVENT, previewHandler);
    return () => window.removeEventListener(TPV_VOICE_PREVIEW_EVENT, previewHandler);
  }, []);

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = speechLocaleForTpvVoiceLanguage(language);

    recognition.onstart = () => {
      setListening(true);
      setPreview(null);
      setMessage(copy.listening);
      setMessageTone("info");
      if (messageTimerRef.current != null) {
        window.clearTimeout(messageTimerRef.current);
        messageTimerRef.current = null;
      }
    };

    recognition.onresult = (event) => {
      const results = event.results;
      const lastResult = results?.length ? results[results.length - 1] : undefined;
      const transcript = lastResult?.[0]?.transcript?.trim() ?? "";
      if (!transcript) return;

      setMessage(copy.interpreting(transcript));
      setMessageTone("info");
      const detail = { transcript, source: "tpv" as const, language };
      window.dispatchEvent(
        new CustomEvent(TPV_VOICE_PREVIEW_REQUEST_EVENT, { detail }),
      );
    };

    recognition.onerror = (event) => {
      setListening(false);
      setPreview(null);
      showMessage(getVoiceErrorMessage(event.error, copy), "error");
    };

    recognition.onend = () => {
      setListening(false);
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
  }, [copy, language, showMessage]);

  const toggleVoiceCommand = () => {
    if (!recognitionRef.current) {
      showMessage(copy.unavailable, "error");
      return;
    }

    try {
      if (listening) recognitionRef.current.stop();
      else recognitionRef.current.start();
    } catch {
      setListening(false);
      showMessage(copy.activationError, "error");
    }
  };

  const confirmPreview = () => {
    if (!preview?.canConfirm) return;
    const detail: TpvVoiceCommandDetail = {
      transcript: preview.transcript,
      source: "tpv",
      language,
    };
    setPreview(null);
    setMessage(copy.sending);
    setMessageTone("info");
    window.dispatchEvent(
      new CustomEvent<TpvVoiceCommandDetail>(TPV_VOICE_COMMAND_EVENT, { detail }),
    );
  };

  const cancelPreview = () => {
    setPreview(null);
    setMessage(null);
  };

  const changeLanguage = (nextLanguage: TpvVoiceLanguage) => {
    if (listening) recognitionRef.current?.stop();
    persistTpvVoiceLanguage(nextLanguage);
    setPreview(null);
    setMessage(null);
    setLanguage(nextLanguage);
  };

  return (
    <>
      {preview ? (
        <div
          role="dialog"
          aria-label={copy.dialogLabel}
          className={`fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-[72] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border p-3 shadow-[var(--hostly-shadow-card)] sm:bottom-[5.5rem] sm:right-6 ${feedbackToneClass(preview.tone)}`}
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
          className={`fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-[71] max-w-[min(22rem,calc(100vw-2rem))] rounded-2xl border px-3 py-2 text-xs font-semibold shadow-[var(--hostly-shadow-card)] sm:bottom-[5.5rem] sm:right-6 ${feedbackToneClass(messageTone)}`}
        >
          {message}
        </div>
      ) : null}

      <label
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[4.5rem] z-[70] flex h-12 items-center rounded-full border border-[var(--hostly-line-strong)] bg-white px-2 shadow-[var(--hostly-shadow-card)] sm:bottom-6 sm:right-[5rem]"
        title={copy.languageLabel}
      >
        <span className="sr-only">{copy.languageLabel}</span>
        <select
          aria-label={copy.languageLabel}
          value={language}
          disabled={listening}
          onChange={(event) => changeLanguage(event.target.value as TpvVoiceLanguage)}
          className="h-10 min-w-[3.5rem] cursor-pointer appearance-none bg-transparent px-2 text-center text-xs font-bold text-[var(--hostly-navy-deep)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {TPV_VOICE_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.shortLabel}
            </option>
          ))}
        </select>
      </label>

      <HostlyButton
        variant="icon"
        size="touch"
        active={listening}
        iconOnlyLabel={listening ? copy.stop : copy.start}
        title={listening ? copy.stop : copy.title}
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
