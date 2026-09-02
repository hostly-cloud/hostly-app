"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type {
  CatalogImageBulkJob,
  CatalogImageBulkJobItem,
  CatalogImageBulkJobPayload,
  CatalogImageBulkPreflight,
} from "@/lib/productos/catalog-image-bulk-contract";
import {
  CatalogImageBulkApiErrorResponse,
  controlCatalogImageBulkJob,
  createCatalogImageBulkJob,
  fetchCatalogImageBulkJob,
  fetchCatalogImageBulkPreflight,
  fetchLatestCatalogImageBulkJob,
  processNextCatalogImageBulkItem,
} from "@/lib/productos/catalog-image-bulk-api";
import styles from "./product-catalog-image-bulk-panel.module.css";

const STATUS_LABELS: Record<CatalogImageBulkJob["status"], string> = {
  preparing: "Preparando",
  queued: "Pendiente",
  running: "Procesando",
  paused: "Pausado",
  completed: "Completado",
  cancelled: "Cancelado",
  failed: "Fallido",
};

function itemMeta(item: CatalogImageBulkJobItem): string {
  if (item.status === "failed") return "Falló · se puede reintentar";
  if (item.kind === "catalog_search") {
    return item.candidateCount > 0
      ? `${item.candidateCount} coincidencia${item.candidateCount === 1 ? "" : "s"} para revisar`
      : "Sin coincidencia fiable";
  }
  if (item.kind === "ai_generate" && item.imageUrl) {
    return "Imagen IA pendiente de aprobación";
  }
  if (item.kind === "pending_review") return "Ya estaba pendiente de revisión";
  if (item.kind === "manual_review") return "Necesita intervención manual";
  if (item.kind === "already_processing") return "Ya estaba procesándose";
  return STATUS_LABELS[item.status === "cancelled" ? "cancelled" : "completed"];
}

function messageFromError(error: unknown): string {
  if (error instanceof CatalogImageBulkApiErrorResponse) {
    if (error.code === "CATALOG_IMAGE_AI_BULK_PLAN_REQUIRED") {
      return "Esta función está disponible en el plan Ultra. La subida manual y la generación individual de Pro no cambian.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "No se pudo completar la operación";
}

export function ProductCatalogImageBulkPanel() {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preflight, setPreflight] = useState<CatalogImageBulkPreflight | null>(null);
  const [payload, setPayload] = useState<CatalogImageBulkJobPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingRequest, setProcessingRequest] = useState(false);
  const [controlRequest, setControlRequest] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPreflight, latest] = await Promise.all([
        fetchCatalogImageBulkPreflight(),
        fetchLatestCatalogImageBulkJob(),
      ]);
      setPreflight(nextPreflight);
      setPayload(latest);
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  const openPanel = useCallback(() => {
    setOpen(true);
    void load();
  }, [load]);

  const closePanel = useCallback(() => {
    setOpen(false);
    globalThis.queueMicrotask?.(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePanel, open]);

  const refreshJob = useCallback(async (jobId: string) => {
    const next = await fetchCatalogImageBulkJob(jobId);
    setPayload(next);
    return next;
  }, []);

  const start = useCallback(async () => {
    setControlRequest(true);
    setError(null);
    try {
      const job = await createCatalogImageBulkJob();
      await refreshJob(job.jobId);
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setControlRequest(false);
    }
  }, [refreshJob]);

  const prepareNewJob = useCallback(async () => {
    setControlRequest(true);
    setError(null);
    try {
      const nextPreflight = await fetchCatalogImageBulkPreflight();
      setPreflight(nextPreflight);
      setPayload(null);
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setControlRequest(false);
    }
  }, []);

  const runControl = useCallback(
    async (action: "pause" | "resume" | "retry_failed" | "cancel") => {
      if (!payload) return;
      setControlRequest(true);
      setError(null);
      try {
        await controlCatalogImageBulkJob(payload.job.jobId, action);
        await refreshJob(payload.job.jobId);
      } catch (nextError) {
        setError(messageFromError(nextError));
      } finally {
        setControlRequest(false);
      }
    },
    [payload, refreshJob],
  );

  useEffect(() => {
    const job = payload?.job;
    if (
      !open ||
      !job ||
      processingRequest ||
      controlRequest ||
      (job.status !== "queued" && job.status !== "running") ||
      (job.counters.pending <= 0 && job.counters.processing <= 0)
    ) {
      return;
    }
    const delayMs = job.counters.pending > 0 ? 0 : 10_000;
    const timer = window.setTimeout(() => {
      setProcessingRequest(true);
      void processNextCatalogImageBulkItem(job.jobId)
        .then(() => refreshJob(job.jobId))
        .catch((nextError) => {
          setError(messageFromError(nextError));
        })
        .finally(() => {
          setProcessingRequest(false);
        });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [controlRequest, open, payload, processingRequest, refreshJob]);

  const progress = useMemo(() => {
    const counters = payload?.job.counters;
    if (!counters || counters.total <= 0) return 0;
    const finished =
      counters.completed +
      counters.needsReview +
      counters.failed +
      counters.skipped +
      counters.cancelled;
    return Math.min(100, Math.round((finished / counters.total) * 100));
  }, [payload]);

  const visibleItems = useMemo(
    () =>
      payload?.items.filter(
        (item) => item.status !== "pending" && item.status !== "processing",
      ) ?? [],
    [payload],
  );

  return (
    <>
      <button ref={triggerRef} type="button" className={styles.trigger} onClick={openPanel}>
        Completar imágenes
        <span className={styles.planBadge}>Ultra</span>
      </button>

      {open ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePanel();
          }}
        >
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-image-bulk-title"
          >
            <header className={styles.header}>
              <div>
                <h2 id="catalog-image-bulk-title" className={styles.title}>
                  Completar imágenes del catálogo
                </h2>
                <p className={styles.subtitle}>
                  Clasifica, procesa y deja cada resultado pendiente de revisión.
                </p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                aria-label="Cerrar"
                autoFocus
                onClick={closePanel}
              >
                ×
              </button>
            </header>

            <div className={styles.body}>
              {loading ? <p className={styles.hint}>Analizando el catálogo…</p> : null}
              {error ? <p className={styles.error} role="alert">{error}</p> : null}

              {!loading && preflight && !payload ? (
                <>
                  <div className={styles.summaryGrid}>
                    <Metric value={preflight.summary.withoutApprovedImage} label="Sin imagen aprobada" />
                    <Metric value={preflight.summary.aiGenerable} label="Generables con IA" />
                    <Metric value={preflight.summary.catalogSearchable} label="Catálogo real" />
                    <Metric value={preflight.summary.manualReview} label="Intervención manual" />
                  </div>
                  <p className={styles.notice}>
                    {preflight.estimate.note} La confirmación iniciará únicamente los
                    {" "}{preflight.estimate.aiGenerationRequests} platos generables y
                    buscará {preflight.estimate.catalogSearchRequests} productos de marca.
                    Nada se publicará sin aprobación.
                  </p>
                </>
              ) : null}

              {payload ? (
                <>
                  <div className={styles.counterGrid}>
                    <Metric value={payload.job.counters.pending} label="Pendientes" />
                    <Metric value={payload.job.counters.processing} label="Procesando" />
                    <Metric value={payload.job.counters.needsReview} label="Para revisar" />
                    <Metric value={payload.job.counters.failed} label="Fallidas" />
                  </div>
                  <div className={styles.progressTrack} aria-label={`Progreso ${progress}%`}>
                    <div className={styles.progressBar} style={{ width: `${progress}%` }} />
                  </div>
                  <p className={styles.hint}>
                    {STATUS_LABELS[payload.job.status]} · {progress}% · El trabajo queda
                    guardado y puede retomarse al volver a abrir esta pantalla.
                  </p>
                  {visibleItems.length > 0 ? (
                    <div className={styles.results} aria-label="Resultados del catálogo">
                      {visibleItems.map((item) => (
                        <article key={item.productId} className={styles.result}>
                          {item.imageUrl ? (
                            <Image
                              className={styles.resultImage}
                              src={item.imageUrl}
                              alt=""
                              width={44}
                              height={44}
                              unoptimized
                            />
                          ) : (
                            <span className={styles.resultPlaceholder} aria-hidden="true">◌</span>
                          )}
                          <div>
                            <div className={styles.resultName}>{item.productName}</div>
                            <div className={styles.resultMeta}>{itemMeta(item)}</div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <footer className={styles.footer}>
              <p className={styles.hint}>
                Las imágenes aprobadas y manuales se conservan siempre.
              </p>
              <div className={styles.actions}>
                {!payload && preflight ? (
                  <button
                    type="button"
                    className={styles.buttonPrimary}
                    disabled={controlRequest || preflight.summary.withoutApprovedImage === 0}
                    onClick={() => void start()}
                  >
                    {controlRequest ? "Preparando…" : "Confirmar e iniciar"}
                  </button>
                ) : null}
                {payload?.job.status === "running" || payload?.job.status === "queued" ? (
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    disabled={controlRequest}
                    onClick={() => void runControl("pause")}
                  >
                    Pausar
                  </button>
                ) : null}
                {payload?.job.status === "paused" ? (
                  <button
                    type="button"
                    className={styles.buttonPrimary}
                    disabled={controlRequest}
                    onClick={() => void runControl("resume")}
                  >
                    Reanudar
                  </button>
                ) : null}
                {payload && payload.job.counters.failed > 0 ? (
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    disabled={controlRequest}
                    onClick={() => void runControl("retry_failed")}
                  >
                    Reintentar fallos
                  </button>
                ) : null}
                {payload && ["completed", "cancelled"].includes(payload.job.status) ? (
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    disabled={controlRequest}
                    onClick={() => void prepareNewJob()}
                  >
                    Nuevo análisis
                  </button>
                ) : null}
                {payload && !["completed", "cancelled"].includes(payload.job.status) ? (
                  <button
                    type="button"
                    className={styles.buttonDanger}
                    disabled={controlRequest || payload.job.counters.processing > 0}
                    onClick={() => void runControl("cancel")}
                  >
                    Cancelar
                  </button>
                ) : null}
                <button type="button" className={styles.buttonSecondary} onClick={closePanel}>
                  Cerrar
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
}
