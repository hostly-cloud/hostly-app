"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HostlyButton } from "@/components/ui/hostly";
import { normalizeValidGtin } from "@/lib/productos/gtin";

type DetectedBarcode = {
  rawValue: string;
  format?: string;
};

type BarcodeDetectorInstance = {
  detect(source: unknown): Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

const PREFERRED_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
  "code_128",
] as const;

function readBarcodeDetector(): BarcodeDetectorConstructor | null {
  const candidate = (globalThis as unknown as {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }).BarcodeDetector;
  return candidate ?? null;
}

function hasCameraApi(): boolean {
  const runtimeNavigator = navigator as unknown as {
    mediaDevices?: { getUserMedia?: unknown };
  };
  return typeof runtimeNavigator.mediaDevices?.getUserMedia === "function";
}

export function ProductBarcodeScanner({
  disabled = false,
  onDetected,
}: {
  disabled?: boolean;
  onDetected: (gtin: string) => void;
}) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  const stop = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    busyRef.current = false;
  }, []);

  useEffect(() => {
    setAvailable(
      Boolean(readBarcodeDetector() && hasCameraApi() && window.isSecureContext),
    );
    return stop;
  }, [stop]);

  const close = useCallback(() => {
    stop();
    setOpen(false);
    setStarting(false);
  }, [stop]);

  const start = useCallback(async () => {
    const Detector = readBarcodeDetector();
    if (!Detector || !hasCameraApi()) return;

    setOpen(true);
    setStarting(true);
    setError(null);
    try {
      const supported = Detector.getSupportedFormats
        ? await Detector.getSupportedFormats()
        : [...PREFERRED_FORMATS];
      const formats = PREFERRED_FORMATS.filter((format) =>
        supported.includes(format),
      );
      if (formats.length === 0) {
        throw new Error("Este navegador no admite formatos EAN/UPC compatibles.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("No se pudo iniciar la vista de cámara.");
      }
      video.srcObject = stream;
      await video.play();

      const detector = new Detector({ formats });
      timerRef.current = window.setInterval(() => {
        if (busyRef.current || !videoRef.current || videoRef.current.readyState < 2) {
          return;
        }
        busyRef.current = true;
        void detector
          .detect(videoRef.current)
          .then((results) => {
            for (const result of results) {
              const gtin = normalizeValidGtin(result.rawValue);
              if (!gtin) continue;
              onDetected(gtin);
              close();
              break;
            }
          })
          .catch(() => {
            // Frames without a readable code are normal; keep scanning.
          })
          .finally(() => {
            busyRef.current = false;
          });
      }, 350);
    } catch (cause) {
      stop();
      setError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Permite el acceso a la cámara para escanear el código."
          : cause instanceof Error
            ? cause.message
            : "No se pudo iniciar el escáner.",
      );
    } finally {
      setStarting(false);
    }
  }, [close, onDetected, stop]);

  if (!available) return null;

  return (
    <>
      <HostlyButton
        variant="tool"
        size="compact"
        disabled={disabled}
        onClick={() => void start()}
      >
        Escanear
      </HostlyButton>

      {open ? (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(15, 23, 42, .48)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Escanear EAN o GTIN"
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              borderRadius: 18,
              padding: 16,
              background: "white",
              boxShadow: "0 24px 80px rgba(15,23,42,.28)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <strong>Escanear EAN / GTIN</strong>
                <p
                  className="hostly-product-commercial-modal__hint"
                  style={{ margin: "4px 0 0" }}
                >
                  Centra el código de barras dentro de la cámara.
                </p>
              </div>
              <HostlyButton variant="secondary" size="compact" onClick={close}>
                Cerrar
              </HostlyButton>
            </div>

            <div
              style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 14,
                background: "#0f172a",
                aspectRatio: "4 / 3",
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                aria-label="Vista de cámara para escanear el código"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: "28% 9%",
                  border: "2px solid rgba(255,255,255,.9)",
                  borderRadius: 12,
                  boxShadow: "0 0 0 999px rgba(15,23,42,.24)",
                }}
              />
            </div>

            {starting ? (
              <p className="hostly-product-commercial-modal__hint">
                Iniciando cámara…
              </p>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="hostly-carta-config-alert hostly-carta-config-alert--error"
              >
                {error}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
