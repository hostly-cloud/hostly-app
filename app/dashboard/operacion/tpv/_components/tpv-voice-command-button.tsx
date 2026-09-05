"use client";

import { Mic, Square } from "lucide-react";
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

type SpeechRecognitionAlternativeLike = {
  transcript?: string;
  confidence?: number;
};

type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionAlternativeLike>;

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
  maxAlternatives?: number;
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
const MAX_SPEECH_ALTERNATIVES = 5;

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
  if (error === "not-allowed" || error === "service-not-allowed") return copy.permissionError;
  if (error === "no-speech") return copy.noSpeechError;
  if (error === "audio-capture") return copy.audioError;
  return copy.genericListenError;
}

function feedbackToneClass(tone: TpvVoiceFeedbackTone): string {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "error") return "border-red-200 bg-red-50 text-red-950";
  return "border-[var(--hostly-line-strong)] bg-white text-[var(--hostly-navy-deep)]";
}

function joinTranscriptParts(...parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function dedupeTranscripts(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function mergeTranscriptCandidates(prefixes: string[], suffixes: string[]): string[] {
  if (prefixes.length === 0) return dedupeTranscripts(suffixes);
  if (suffixes.length === 0) return dedupeTranscripts(prefixes);
  const count = Math.max(prefixes.length, suffixes.length);
  const merged: string[] = [];
  for (let index = 0; index < count; index += 1) {
    merged.push(joinTranscriptParts(prefixes[index] ?? prefixes[0] ?? "", suffixes[index] ?? suffixes[0] ?? ""));
  }
  return dedupeTranscripts(merged);
}

function extractSpeechCandidates(results: ArrayLike<SpeechRecognitionResultLike> | undefined): string[] {
  if (!results?.length) return [];
  const candidates: string[] = [];
  for (let rank = 0; rank < MAX_SPEECH_ALTERNATIVES; rank += 1) {
    const parts: string[] = [];
    for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
      const result = results[resultIndex];
      const alternative = result?.[rank] ?? result?.[0];
      const transcript = alternative?.transcript?.trim() ?? "";
      if (transcript) parts.push(transcript);
    }
    const candidate = joinTranscriptParts(...parts);
    if (candidate) candidates.push(candidate);
  }
  return dedupeTranscripts(candidates);
}

export function TpvVoiceCommandButton() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const captureRequestedRef = useRef(false);
  const suppressFinalizeRef = useRef(false);
  const accumulatedTranscriptRef = useRef("");
  const currentCycleTranscriptRef = useRef("");
  const accumulatedCandidatesRef = useRef<string[]>([]);
  const currentCycleCandidatesRef = useRef<string[]>([]);
  const probingAlternativesRef = useRef(false);
  const probeResultsRef = useRef<VoicePreviewDetail[]>([]);
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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    const storageHandler = (event: StorageEvent) => {
      if (event.key === "hostly.locale" || event.key === "hostly:tpv-language") syncWithHostlyLocale();
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

  const showMessage = useCallback((nextMessage: string, tone: TpvVoiceFeedbackTone = "info") => {
    setMessage(nextMessage);
    setMessageTone(tone);
    clearMessageTimer();
    messageTimerRef.current = window.setTimeout(() => {
      messageTimerRef.current = null;
      setMessage(null);
    }, 3200);
  }, [clearMessageTimer]);

  const probeCatalogAlternatives = useCallback((rawCandidates: string[]) => {
    const canonicalCandidates = dedupeTranscripts(
      rawCandidates.map((candidate) => canonicalizeTpvVoiceTranscript(candidate, language)),
    );
    if (canonicalCandidates.length === 0) return null;

    probingAlternativesRef.current = true;
    probeResultsRef.current = [];
    for (const transcript of canonicalCandidates) {
      window.dispatchEvent(new CustomEvent(TPV_VOICE_PREVIEW_REQUEST_EVENT, {
        detail: { transcript, source: "tpv" as const },
      }));
    }
    probingAlternativesRef.current = false;

    return (
      probeResultsRef.current.find((result) => result.canConfirm) ??
      probeResultsRef.current[0] ??
      null
    );
  }, [language]);

  const finalizeCapturedSpeech = useCallback(() => {
    const primaryTranscript = joinTranscriptParts(accumulatedTranscriptRef.current, currentCycleTranscriptRef.current);
    const candidateTranscripts = dedupeTranscripts([
      primaryTranscript,
      ...mergeTranscriptCandidates(accumulatedCandidatesRef.current, currentCycleCandidatesRef.current),
    ]);

    accumulatedTranscriptRef.current = "";
    currentCycleTranscriptRef.current = "";
    accumulatedCandidatesRef.current = [];
    currentCycleCandidatesRef.current = [];

    if (!primaryTranscript) {
      showMessage(copy.noSpeechError, "error");
      return;
    }

    rawTranscriptRef.current = primaryTranscript;
    setMessage(null);
    clearMessageTimer();
    const selectedPreview = probeCatalogAlternatives(candidateTranscripts);
    if (!selectedPreview) {
      showMessage(copy.genericListenError, "error");
      return;
    }

    canonicalTranscriptRef.current = selectedPreview.transcript;
    setPreview({ ...selectedPreview, transcript: primaryTranscript });
  }, [clearMessageTimer, copy, probeCatalogAlternatives, showMessage]);

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
      if (probingAlternativesRef.current) {
        probeResultsRef.current.push(detail);
        return;
      }
      clearMessageTimer();
      setMessage(null);
      canonicalTranscriptRef.current = detail.transcript;
      setPreview({ ...detail, transcript: rawTranscriptRef.current || detail.transcript });
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
    recognition.maxAlternatives = MAX_SPEECH_ALTERNATIVES;

    const startCycle = () => {
      if (!captureRequestedRef.current) return;
      recognition.lang = resolveTpvVoiceSpeechLocale();
      currentCycleTranscriptRef.current = "";
      currentCycleCandidatesRef.current = [];
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
      setMessage(null);
      clearMessageTimer();
    };

    recognition.onresult = (event) => {
      const candidates = extractSpeechCandidates(event.results);
      currentCycleCandidatesRef.current = candidates;
      currentCycleTranscriptRef.current = candidates[0] ?? "";
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" && captureRequestedRef.current) return;
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
      accumulatedCandidatesRef.current = mergeTranscriptCandidates(
        accumulatedCandidatesRef.current,
        currentCycleCandidatesRef.current,
      );
      currentCycleTranscriptRef.current = "";
      currentCycleCandidatesRef.current = [];

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
        accumulatedCandidatesRef.current = [];
        return;
      }
      finalizeCapturedSpeech();
    };

    recognitionRef.current = recognition;
    return () => {
      captureRequestedRef.current = false;
      if (restartTimerRef.current != null) window.clearTimeout(restartTimerRef.current);
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
      setListening(false);
      if (restartTimerRef.current != null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
        finalizeCapturedSpeech();
        return;
      }
      try {
        recognition.stop();
      } catch {
        finalizeCapturedSpeech();
      }
      return;
    }

    accumulatedTranscriptRef.current = "";
    currentCycleTranscriptRef.current = "";
    accumulatedCandidatesRef.current = [];
    currentCycleCandidatesRef.current = [];
    rawTranscriptRef.current = "";
    canonicalTranscriptRef.current = "";
    suppressFinalizeRef.current = false;
    captureRequestedRef.current = true;
    setListening(true);
    setPreview(null);
    setMessage(null);
    clearMessageTimer();

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
    const detail: TpvVoiceCommandDetail = { transcript, source: "tpv" };
    setPreview(null);
    setMessage(copy.sending);
    setMessageTone("info");
    window.dispatchEvent(new CustomEvent<TpvVoiceCommandDetail>(TPV_VOICE_COMMAND_EVENT, { detail }));
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
          className={`fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] left-4 z-[72] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border p-3 shadow-[var(--hostly-shadow-card)] sm:bottom-[7.5rem] sm:left-6 ${feedbackToneClass(preview.tone)}`}
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-65">{copy.hasSaid}</div>
          <div className="mt-1 text-sm font-semibold">“{preview.transcript}”</div>
          <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] opacity-65">{copy.understood}</div>
          <div className="mt-1 text-sm font-bold leading-5">{preview.summary}</div>
          <div className="mt-3 flex gap-2">
            <HostlyButton variant="secondary" size="compact" onClick={cancelPreview} className="flex-1">
              {copy.cancel}
            </HostlyButton>
            {preview.canConfirm ? (
              <HostlyButton variant="primary" size="compact" onClick={confirmPreview} className="flex-1">
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

      {message && !preview && !listening ? (
        <div
          role="status"
          aria-live="polite"
          data-tone={messageTone}
          className={`fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] left-4 z-[71] max-w-[min(22rem,calc(100vw-2rem))] rounded-2xl border px-3 py-2 text-xs font-semibold shadow-[var(--hostly-shadow-card)] sm:bottom-[7.5rem] sm:left-6 ${feedbackToneClass(messageTone)}`}
        >
          {message}
        </div>
      ) : null}

      <div className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-[70] sm:right-6">
        {listening ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-2 rounded-full border-2 border-red-400/70 animate-ping"
          />
        ) : null}
        <HostlyButton
          variant="icon"
          size="touch"
          active={listening}
          aria-pressed={listening}
          iconOnlyLabel={listening ? copy.stop : copy.start}
          title={listening ? copy.stop : copy.title}
          onClick={toggleVoiceCommand}
          data-hostly-tpv-voice-trigger
          data-recording={listening ? "true" : "false"}
          className={`relative inline-flex size-16 min-h-16 min-w-16 items-center justify-center rounded-full border-[3px] p-0 text-white transition-all duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 ${
            listening
              ? "border-white bg-red-600 shadow-[0_0_0_5px_rgba(248,113,113,0.28),0_12px_32px_rgba(127,29,29,0.36)] hover:bg-red-600"
              : "border-white/90 bg-[var(--hostly-navy-deep)] shadow-[0_12px_32px_rgba(11,42,65,0.34)] hover:scale-[1.03] hover:bg-[var(--hostly-navy-mid)] focus-visible:outline-[var(--hostly-accent)]"
          }`}
        >
          {listening ? (
            <Square aria-hidden size={26} strokeWidth={0} fill="currentColor" className="rounded-[3px]" />
          ) : (
            <Mic aria-hidden size={28} strokeWidth={2.4} />
          )}
          <span
            aria-hidden
            className={`absolute bottom-2.5 size-2 rounded-full ${listening ? "bg-white" : "bg-sky-300"}`}
          />
        </HostlyButton>
      </div>
    </>
  );
}
