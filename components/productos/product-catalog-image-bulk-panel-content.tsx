"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { HostlyButton } from "@/components/ui/hostly";
import {
  CATALOG_IMAGE_BULK_QUEUE_RETRY_EXHAUSTED,
  type CatalogImageBulkCatalogSelection,
  type CatalogImageBulkJob,
  type CatalogImageBulkJobItem,
  type CatalogImageBulkJobPayload,
  type CatalogImageBulkPreflight,
} from "@/lib/productos/catalog-image-bulk-contract";
import {
  approveCatalogImageBulkSelection,
  CatalogImageBulkApiErrorResponse,
  controlCatalogImageBulkJob,
  createCatalogImageBulkJob,
  fetchCatalogImageBulkJob,
  fetchCatalogImageBulkPreflight,
  fetchLatestCatalogImageBulkJob,
} from "@/lib/productos/catalog-image-bulk-api";
import { ProductCatalogImageCandidateOptions } from "./product-catalog-image-candidate-options";
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
  if (item.reviewStatus === "approved") return "Aprobada y publicada";
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

function progressMessage(job: CatalogImageBulkJob, progress: number): string {
  if (
    job.status === "paused" &&
    job.failureReason === CATALOG_IMAGE_BULK_QUEUE_RETRY_EXHAUSTED
  ) {
    return `Pausado de forma segura tras varios fallos de conexión · ${progress}% · Reanuda cuando el servicio vuelva a estar disponible.`;
  }
  return `${STATUS_LABELS[job.status]} · ${progress}% · El trabajo queda guardado y continúa en el servidor aunque cierres esta pantalla.`;
}

export function ProductCatalogImageBulkPanel() {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preflight, setPreflight] = useState<CatalogImageBulkPreflight | null>(null);
  const [payload, setPayload] = useState<CatalogImageBulkJobPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [controlRequest, setControlRequest] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState(false);
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedCatalogReferences, setSelectedCatalogReferences] = useState<
    Record<string, string>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
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
    setMessage(null);
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
    setMessage(null);
    setSelectedProductIds([]);
    setSelectedCatalogReferences({});
    setConfirmingApproval(false);
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
      setMessage(null);
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
      controlRequest ||
      approvalRequest ||
      (job.status !== "queued" && job.status !== "running")
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      void refreshJob(job.jobId).catch((nextError) => {
        setError(messageFromError(nextError));
      });
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [approvalRequest, controlRequest, open, payload, refreshJob]);

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

  const approvableProductIds = useMemo(
    () =>
      visibleItems
        .filter(
          (item) =>
            item.status === "needs_review" &&
            item.reviewStatus !== "approved" &&
            Boolean(item.imageUrl) &&
            (item.kind === "ai_generate" ||
              item.kind === "pending_review" ||
              (item.kind === "catalog_search" &&
                item.reviewStatus === "pending")),
        )
        .map((item) => item.productId),
    [visibleItems],
  );
  const approvableProductIdSet = useMemo(
    () => new Set(approvableProductIds),
    [approvableProductIds],
  );
  const validSelectedProductIds = useMemo(
    () =>
      selectedProductIds.filter((productId) =>
        approvableProductIdSet.has(productId),
      ),
    [approvableProductIdSet, selectedProductIds],
  );
  const selectedProductIdSet = useMemo(
    () => new Set(validSelectedProductIds),
    [validSelectedProductIds],
  );
  const validCatalogSelections = useMemo<CatalogImageBulkCatalogSelection[]>(
    () =>
      visibleItems.flatMap((item) => {
        if (
          item.kind !== "catalog_search" ||
          item.status !== "needs_review" ||
          item.reviewStatus === "approved" ||
          item.reviewStatus === "pending"
        ) {
          return [];
        }
        const externalReference = selectedCatalogReferences[item.productId];
        return item.catalogCandidates.some(
          (candidate) =>
            candidate.externalReference === externalReference,
        )
          ? [{ productId: item.productId, externalReference }]
          : [];
      }),
    [selectedCatalogReferences, visibleItems],
  );
  const reviewSelectionCount =
    validSelectedProductIds.length + validCatalogSelections.length;

  const toggleProduct = useCallback((productId: string) => {
    setConfirmingApproval(false);
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }, []);

  const selectCatalogCandidate = useCallback(
    (productId: string, externalReference: string) => {
      setConfirmingApproval(false);
      setSelectedCatalogReferences((current) => ({
        ...current,
        [productId]: externalReference,
      }));
    },
    [],
  );

  const approveSelection = useCallback(async () => {
    if (!payload || reviewSelectionCount === 0) return;
    setApprovalRequest(true);
    setError(null);
    setMessage(null);
    try {
      const result = await approveCatalogImageBulkSelection(
        payload.job.jobId,
        validSelectedProductIds,
        validCatalogSelections,
      );
      await refreshJob(payload.job.jobId);
      setSelectedProductIds([]);
      setSelectedCatalogReferences({});
      setConfirmingApproval(false);
      setMessage(
        result.failed > 0
          ? `${result.approved + result.alreadyApproved} imágenes aprobadas; ${result.failed} necesitan revisión individual.`
          : `${result.approved + result.alreadyApproved} imágenes aprobadas y publicadas.`,
      );
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setApprovalRequest(false);
    }
  }, [
    payload,
    refreshJob,
    reviewSelectionCount,
    validCatalogSelections,
    validSelectedProductIds,
  ]);

  return (
    <>
      <HostlyButton
        ref={triggerRef}
        type="button"
        variant="tool"
        size="compact"
        className={styles.trigger}
        onClick={openPanel}
      >
        Completar imágenes
        <span className={styles.planBadge}>Ultra</span>
      </HostlyButton>

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
              {message ? <p className={styles.success} role="status">{message}</p> : null}

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
                    {progressMessage(payload.job, progress)}
                  </p>
                  {visibleItems.length > 0 ? (
                    <>
                      {approvableProductIds.length > 0 ? (
                        <div className={styles.reviewToolbar}>
                          <span className={styles.hint}>
                            {reviewSelectionCount} seleccionadas · {approvableProductIds.length} ya preparadas
                          </span>
                          <HostlyButton
                            variant="secondary"
                            size="compact"
                            disabled={approvalRequest}
                            onClick={() => {
                              setConfirmingApproval(false);
                              setSelectedProductIds(
                                validSelectedProductIds.length === approvableProductIds.length
                                  ? []
                                  : approvableProductIds,
                              );
                            }}
                          >
                            {validSelectedProductIds.length === approvableProductIds.length
                              ? "Quitar selección"
                              : "Seleccionar aprobables"}
                          </HostlyButton>
                        </div>
                      ) : null}
                      {confirmingApproval ? (
                        <div
                          className={styles.approvalConfirmation}
                          role="alertdialog"
                          aria-label="Confirmar publicación de imágenes"
                        >
                          <span>
                            Hostly adjuntará las coincidencias de catálogo elegidas y publicará {reviewSelectionCount} imágenes. Quedarán protegidas frente a sustituciones automáticas.
                          </span>
                          <div className={styles.confirmationActions}>
                            <HostlyButton
                              variant="secondary"
                              size="compact"
                              disabled={approvalRequest}
                              onClick={() => setConfirmingApproval(false)}
                            >
                              Volver
                            </HostlyButton>
                            <HostlyButton
                              variant="primary"
                              size="compact"
                              disabled={approvalRequest}
                              onClick={() => void approveSelection()}
                            >
                              {approvalRequest ? "Publicando…" : "Confirmar publicación"}
                            </HostlyButton>
                          </div>
                        </div>
                      ) : null}
                      <div className={styles.results} aria-label="Resultados del catálogo">
                        {visibleItems.map((item) => {
                          const selectable = approvableProductIdSet.has(item.productId);
                          const selected = selectedProductIdSet.has(item.productId);
                          return (
                            <article
                              key={item.productId}
                              className={`${styles.result}${
                                item.kind === "catalog_search"
                                  ? ` ${styles.resultCatalog}`
                                  : ""
                              }${selected ? ` ${styles.resultSelected}` : ""}`}
                            >
                              {selectable ? (
                                <label className={styles.resultCheckboxTarget}>
                                  <input
                                    className={styles.resultCheckbox}
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleProduct(item.productId)}
                                    aria-label={`Seleccionar ${item.productName}`}
                                  />
                                </label>
                              ) : null}
                              {item.imageUrl ? (
                                <Image
                                  className={styles.resultImage}
                                  src={item.imageUrl}
                                  alt=""
                                  width={72}
                                  height={72}
                                  unoptimized
                                />
                              ) : (
                                <span className={styles.resultPlaceholder} aria-hidden="true">◌</span>
                              )}
                              <div className={styles.resultContent}>
                                <div className={styles.resultName}>{item.productName}</div>
                                <div className={styles.resultMeta}>{itemMeta(item)}</div>
                                {item.kind === "catalog_search" &&
                                item.reviewStatus == null ? (
                                  <ProductCatalogImageCandidateOptions
                                    productId={item.productId}
                                    productName={item.productName}
                                    candidates={item.catalogCandidates}
                                    selectedReference={
                                      selectedCatalogReferences[item.productId]
                                    }
                                    onSelect={(externalReference) =>
                                      selectCatalogCandidate(
                                        item.productId,
                                        externalReference,
                                      )
                                    }
                                  />
                                ) : null}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>

            <footer className={styles.footer}>
              <p className={styles.hint}>
                Las imágenes aprobadas y manuales se conservan siempre.
              </p>
              <div className={styles.actions}>
                {payload && reviewSelectionCount > 0 && !confirmingApproval ? (
                  <HostlyButton
                    variant="primary"
                    size="compact"
                    disabled={approvalRequest || controlRequest}
                    onClick={() => setConfirmingApproval(true)}
                  >
                    Aprobar selección ({reviewSelectionCount})
                  </HostlyButton>
                ) : null}
                {!payload && preflight ? (
                  <HostlyButton
                    variant="primary"
                    size="compact"
                    disabled={controlRequest || preflight.summary.withoutApprovedImage === 0}
                    onClick={() => void start()}
                  >
                    {controlRequest ? "Preparando…" : "Confirmar e iniciar"}
                  </HostlyButton>
                ) : null}
                {payload?.job.status === "running" || payload?.job.status === "queued" ? (
                  <HostlyButton
                    variant="secondary"
                    size="compact"
                    disabled={controlRequest}
                    onClick={() => void runControl("pause")}
                  >
                    Pausar
                  </HostlyButton>
                ) : null}
                {payload?.job.status === "paused" ? (
                  <HostlyButton
                    variant="primary"
                    size="compact"
                    disabled={controlRequest}
                    onClick={() => void runControl("resume")}
                  >
                    Reanudar
                  </HostlyButton>
                ) : null}
                {payload && payload.job.counters.failed > 0 ? (
                  <HostlyButton
                    variant="tool"
                    size="compact"
                    disabled={controlRequest}
                    onClick={() => void runControl("retry_failed")}
                  >
                    Reintentar fallos
                  </HostlyButton>
                ) : null}
                {payload && ["completed", "cancelled"].includes(payload.job.status) ? (
                  <HostlyButton
                    variant="secondary"
                    size="compact"
                    disabled={controlRequest}
                    onClick={() => void prepareNewJob()}
                  >
                    Nuevo análisis
                  </HostlyButton>
                ) : null}
                {payload && !["completed", "cancelled"].includes(payload.job.status) ? (
                  <HostlyButton
                    variant="destructive"
                    size="compact"
                    disabled={controlRequest || payload.job.counters.processing > 0}
                    onClick={() => void runControl("cancel")}
                  >
                    Cancelar
                  </HostlyButton>
                ) : null}
                <HostlyButton variant="secondary" size="compact" onClick={closePanel}>
                  Cerrar
                </HostlyButton>
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
