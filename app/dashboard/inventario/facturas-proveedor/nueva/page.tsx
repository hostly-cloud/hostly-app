"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import ModulePageShell from "@/components/module-page-shell";
import { HostlySectionHeader } from "@/components/ui/hostly";
import { auth, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  createSupplierInvoice,
  recordSupplierInvoice,
  SupplierInvoiceError,
} from "@/lib/firestore/supplier-invoices";
import { listenProductsForInventory, type ProductDocument } from "@/lib/firestore/products";
import {
  learnSupplierProductAlias,
  learnSupplierProductAliasesFromLines,
  listenSupplierProductAliases,
  mapSupplierProductAliasesToMatchCandidates,
  type SupplierProductAliasDocument,
} from "@/lib/firestore/supplier-product-aliases";
import type {
  ExtractedSupplierInvoiceDraft,
  ExtractedSupplierInvoiceLine,
  SupplierInvoiceExtractionMeta,
} from "@/lib/inventory/extracted-supplier-invoice-types";
import {
  buildSupplierInvoiceInputFromExtractedDraft,
  calculateExtractedInvoiceTotals,
  validateExtractedInvoiceLinesForRecording,
} from "@/lib/inventory/extracted-invoice-to-supplier-invoice";
import {
  enrichExtractedDraftWithProductMatches,
  findSupplierProductAliasMatch,
  type InventoryProductMatchCandidate,
} from "@/lib/inventory/invoice-product-matching";
import {
  requestSupplierInvoiceExtract,
  SupplierInvoiceExtractRequestError,
} from "@/lib/inventory/request-supplier-invoice-extract";
import {
  ApplySimilarLinesBanner,
  BulkActionsToolbar,
  DocumentPreviewPanel,
  ExtractionStatusBar,
  InvoiceHeaderFields,
  MobileViewTabs,
  RegistrationFooter,
  ReviewKpiStrip,
  ReviewLinesTable,
  SessionLearningPanel,
  type DraftLineRow,
} from "@/components/inventario/supplier-invoice-ocr-review-ui";
import {
  appendSessionLearningEntry,
  computeReviewKpiSummary,
  findNextPendingRowKey,
  findSimilarPendingLineKeys,
  getAdjacentIncludedRowKey,
  getExtractionStatusBadge,
  getIncludedRowKeys,
  getLineMatchText,
  getNextFieldInRow,
  type InvoiceOcrFieldId,
  type SessionLearningEntry,
} from "@/lib/inventory/invoice-ocr-review-ux";

import {
  buildSupplierInvoiceDemoDraft,
  buildSupplierInvoiceDemoExtractionMeta,
  createSupplierInvoiceDemoFile,
  createSupplierInvoiceDemoPreviewUrl,
  isSupplierInvoiceDemoEnabled,
} from "@/lib/inventory/supplier-invoice-demo";

type ExtractPhase = "idle" | "uploading" | "ready" | "error";
type ReviewLayoutMode = "mobile" | "tablet" | "desktop";
type SimilarLinesOffer = {
  sourceRowKey: string;
  targetRowKeys: string[];
  productId: string;
  productName: string;
};

function formatEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

const actionButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "var(--hostly-surface-card-solid)",
  color: "var(--hostly-ink-strong)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

const primaryButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  background: "var(--hostly-ink-strong)",
  color: "#fff",
  border: "1px solid var(--hostly-ink-strong)",
};

function useReviewLayoutMode(): ReviewLayoutMode {
  const [mode, setMode] = useState<ReviewLayoutMode>("desktop");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const width = window.innerWidth;
      if (width < 768) setMode("mobile");
      else if (width < 1100) setMode("tablet");
      else setMode("desktop");
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return mode;
}

function mapProductsToMatchCandidates(products: ProductDocument[]): InventoryProductMatchCandidate[] {
  return products.map((product) => ({ id: product.id, name: product.name }));
}

function withRowKeys(lines: ExtractedSupplierInvoiceLine[]): DraftLineRow[] {
  return lines.map((line, index) => ({
    ...line,
    included: true,
    rowKey: `${line.detectedProductName ?? "line"}-${index}`,
  }));
}

function formatShortId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length <= 12) return trimmed;
  return `…${trimmed.slice(-8)}`;
}

function detectLearnedAliasRowKeys(
  rows: DraftLineRow[],
  aliases: ReturnType<typeof mapSupplierProductAliasesToMatchCandidates>,
): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const text = getLineMatchText(row);
    if (!text || !row.matchedInventoryProductId) continue;
    const aliasMatch = findSupplierProductAliasMatch(text, aliases);
    if (aliasMatch && aliasMatch.productId === row.matchedInventoryProductId) {
      keys.add(row.rowKey);
    }
  }
  return keys;
}

function buildFieldRefKey(rowKey: string, field: InvoiceOcrFieldId): string {
  return `${rowKey}:${field}`;
}

export default function NuevaFacturaProveedorPage() {
  const router = useRouter();
  const { restaurantId, ready: authReady } = useAuth();
  const layoutMode = useReviewLayoutMode();
  const isMobileLayout = layoutMode === "mobile";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const fieldInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const [mobileTab, setMobileTab] = useState<"document" | "review">("review");

  const [inventoryProducts, setInventoryProducts] = useState<ProductDocument[]>([]);
  const [supplierAliases, setSupplierAliases] = useState<SupplierProductAliasDocument[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<ExtractPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadMeta, setUploadMeta] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExtractedSupplierInvoiceDraft | null>(null);
  const [lineRows, setLineRows] = useState<DraftLineRow[]>([]);
  const [registerFeedback, setRegisterFeedback] = useState<string | null>(null);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registeredInvoiceId, setRegisteredInvoiceId] = useState<string | null>(null);
  const [isDemoInvoice, setIsDemoInvoice] = useState(false);
  const [extractionMeta, setExtractionMeta] = useState<SupplierInvoiceExtractionMeta | null>(
    null,
  );
  const [similarOffer, setSimilarOffer] = useState<SimilarLinesOffer | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [flashingRowKeys, setFlashingRowKeys] = useState<Set<string>>(() => new Set());
  const [cascadeRowKeys, setCascadeRowKeys] = useState<Set<string>>(() => new Set());
  const [manualProductRows, setManualProductRows] = useState<Set<string>>(() => new Set());
  const [learnedAliasRows, setLearnedAliasRows] = useState<Set<string>>(() => new Set());
  const [sessionLearnings, setSessionLearnings] = useState<SessionLearningEntry[]>([]);
  const [bulkProductId, setBulkProductId] = useState("");
  const [bulkUnit, setBulkUnit] = useState("");
  const [showRegisterSuccess, setShowRegisterSuccess] = useState(false);

  const showDemoControls = isSupplierInvoiceDemoEnabled();

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setInventoryProducts([]);
      return;
    }
    return listenProductsForInventory(restaurantId, setInventoryProducts);
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setSupplierAliases([]);
      return;
    }
    return listenSupplierProductAliases(restaurantId, setSupplierAliases);
  }, [authReady, restaurantId]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const matchCandidates = useMemo(
    () => mapProductsToMatchCandidates(inventoryProducts),
    [inventoryProducts],
  );

  const aliasMatchCandidates = useMemo(
    () => mapSupplierProductAliasesToMatchCandidates(supplierAliases),
    [supplierAliases],
  );

  const resetPreviewUrl = useCallback((nextUrl: string | null) => {
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return nextUrl;
    });
  }, []);

  const focusRowProductSelect = useCallback((rowKey: string) => {
    const row = document.querySelector(`[data-row-key="${rowKey}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      productInputRefs.current.get(rowKey)?.focus({ preventScroll: true });
    }, 180);
  }, []);

  const focusFirstPendingLine = useCallback(
    (rows: DraftLineRow[]) => {
      const validation = validateExtractedInvoiceLinesForRecording(rows);
      const next = findNextPendingRowKey(rows, validation);
      if (next) {
        setActiveRowKey(next);
        requestAnimationFrame(() => focusRowProductSelect(next));
      }
    },
    [focusRowProductSelect],
  );

  const focusRowField = useCallback((rowKey: string, field: InvoiceOcrFieldId) => {
    setActiveRowKey(rowKey);
    const row = document.querySelector(`[data-row-key="${rowKey}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      if (field === "product") {
        productInputRefs.current.get(rowKey)?.focus({ preventScroll: true });
        return;
      }
      fieldInputRefs.current.get(buildFieldRefKey(rowKey, field))?.focus({ preventScroll: true });
    }, 120);
  }, []);

  const triggerRowFlash = useCallback((rowKey: string) => {
    setFlashingRowKeys((prev) => new Set(prev).add(rowKey));
    window.setTimeout(() => {
      setFlashingRowKeys((prev) => {
        const next = new Set(prev);
        next.delete(rowKey);
        return next;
      });
    }, 520);
  }, []);

  const triggerCascadeFlash = useCallback((rowKeys: string[]) => {
    if (rowKeys.length === 0) return;
    setCascadeRowKeys(new Set(rowKeys));
    window.setTimeout(() => setCascadeRowKeys(new Set()), 520);
  }, []);

  const resetReviewInteractionState = useCallback(() => {
    setSelectedRowKeys(new Set());
    setActiveRowKey(null);
    setFlashingRowKeys(new Set());
    setCascadeRowKeys(new Set());
    setManualProductRows(new Set());
    setLearnedAliasRows(new Set());
    setSessionLearnings([]);
    setBulkProductId("");
    setBulkUnit("");
    setShowRegisterSuccess(false);
  }, []);

  const handleFileChange = useCallback(
    (file: File | null) => {
      setSelectedFile(file);
      setDraft(null);
      setLineRows([]);
      setUploadMeta(null);
      setRegisterFeedback(null);
      setRegisterModalOpen(false);
      setRegisteredInvoiceId(null);
      setIsDemoInvoice(false);
      setExtractionMeta(null);
      setSimilarOffer(null);
      setMobileTab("review");
      setErrorMessage(null);
      setPhase("idle");
      resetReviewInteractionState();
      if (!file) {
        resetPreviewUrl(null);
        return;
      }
      resetPreviewUrl(URL.createObjectURL(file));
    },
    [resetPreviewUrl, resetReviewInteractionState],
  );

  const runExtraction = useCallback(async () => {
    if (!selectedFile || phase === "uploading" || isDemoInvoice) return;
    const user = auth.currentUser;
    if (!user) {
      setErrorMessage("Inicia sesión para subir la factura.");
      setPhase("error");
      return;
    }

    setPhase("uploading");
    setErrorMessage(null);
    setRegisterFeedback(null);
    setRegisteredInvoiceId(null);

    try {
      const idToken = await user.getIdToken();
      const result = await requestSupplierInvoiceExtract({
        file: selectedFile,
        idToken,
      });
      const enriched = enrichExtractedDraftWithProductMatches(
        result.draft,
        matchCandidates,
        aliasMatchCandidates,
      );
      const rows = withRowKeys(enriched.lines);
      setDraft(enriched);
      setLineRows(rows);
      setLearnedAliasRows(detectLearnedAliasRowKeys(rows, aliasMatchCandidates));
      setUploadMeta(
        `${result.upload.filename} · ${result.upload.storagePath.split("/").slice(-1)[0]}`,
      );
      setExtractionMeta(result.extractionMeta ?? null);
      setIsDemoInvoice(false);
      setSimilarOffer(null);
      setMobileTab("review");
      setPhase("ready");
      focusFirstPendingLine(rows);
    } catch (error) {
      setPhase("error");
      if (error instanceof SupplierInvoiceExtractRequestError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("No se pudo extraer la factura. Inténtalo de nuevo.");
      }
    }
  }, [aliasMatchCandidates, focusFirstPendingLine, isDemoInvoice, matchCandidates, phase, selectedFile]);

  const handleUseDemoInvoice = useCallback(() => {
    if (!showDemoControls) return;

    setErrorMessage(null);
    setRegisterFeedback(null);
    setRegisterModalOpen(false);
    setRegisteredInvoiceId(null);
    setIsDemoInvoice(true);
    setExtractionMeta(buildSupplierInvoiceDemoExtractionMeta());

    const demoDraft = buildSupplierInvoiceDemoDraft();
    const demoFile = createSupplierInvoiceDemoFile(demoDraft);
    setSelectedFile(demoFile);
    resetPreviewUrl(createSupplierInvoiceDemoPreviewUrl(demoDraft));

    const enriched = enrichExtractedDraftWithProductMatches(
      demoDraft,
      matchCandidates,
      aliasMatchCandidates,
    );
    setDraft(enriched);
    const rows = withRowKeys(enriched.lines);
    setLineRows(rows);
    setLearnedAliasRows(detectLearnedAliasRowKeys(rows, aliasMatchCandidates));
    setUploadMeta("Factura de demostración · archivo no subido");
    setSimilarOffer(null);
    setMobileTab("review");
    setPhase("ready");
    focusFirstPendingLine(rows);
  }, [aliasMatchCandidates, focusFirstPendingLine, matchCandidates, resetPreviewUrl, showDemoControls]);

  const updateDraftField = useCallback(
    (field: keyof Pick<ExtractedSupplierInvoiceDraft, "supplierName" | "invoiceNumber" | "invoiceDate">, value: string) => {
      setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
    },
    [],
  );

  const updateLine = useCallback(
    (rowKey: string, patch: Partial<ExtractedSupplierInvoiceLine>) => {
      setLineRows((prev) =>
        prev.map((row) => {
          if (row.rowKey !== rowKey) return row;
          const next = { ...row, ...patch };
          if (patch.quantity != null || patch.unitPrice != null) {
            const qty = patch.quantity ?? row.quantity ?? 0;
            const unitPrice = patch.unitPrice ?? row.unitPrice ?? 0;
            if (qty > 0 && unitPrice > 0) {
              next.totalPrice = Math.round(qty * unitPrice * 100) / 100;
            }
          }
          return next;
        }),
      );
    },
    [],
  );

  const handleProductLinkChange = useCallback(
    (rowKey: string, productId: string) => {
      const product = inventoryProducts.find((item) => item.id === productId);
      const currentLine = lineRows.find((row) => row.rowKey === rowKey);

      const nextRows = lineRows.map((row) => {
        if (row.rowKey !== rowKey) return row;
        return {
          ...row,
          matchedInventoryProductId: productId || undefined,
          matchedInventoryProductName: product?.name,
          confidence: productId ? 1 : 0,
          status: productId ? ("matched" as const) : ("unmatched" as const),
        };
      });
      setLineRows(nextRows);
      setActiveRowKey(rowKey);

      if (productId) {
        setManualProductRows((prev) => new Set(prev).add(rowKey));
        setLearnedAliasRows((prev) => {
          const next = new Set(prev);
          next.delete(rowKey);
          return next;
        });
      } else {
        setManualProductRows((prev) => {
          const next = new Set(prev);
          next.delete(rowKey);
          return next;
        });
      }

      const validation = validateExtractedInvoiceLinesForRecording(nextRows);
      const lineResult = validation.lineResults[lineRows.findIndex((row) => row.rowKey === rowKey)];

      if (restaurantId && productId && product && currentLine) {
        const rawText = getLineMatchText(currentLine);
        if (rawText) {
          setSessionLearnings((prev) =>
            appendSessionLearningEntry(prev, rawText, product.name),
          );
          void learnSupplierProductAlias({
            restaurantId,
            rawText,
            inventoryProductId: productId,
            inventoryProductName: product.name,
            supplierName: draft?.supplierName,
          }).catch(() => undefined);
        }

        const similar = findSimilarPendingLineKeys(rowKey, nextRows, validation);
        setSimilarOffer(
          similar.length > 0
            ? {
                sourceRowKey: rowKey,
                targetRowKeys: similar,
                productId,
                productName: product.name,
              }
            : null,
        );

        if (lineResult?.isValid) {
          triggerRowFlash(rowKey);
        }

        const nextPending = findNextPendingRowKey(nextRows, validation, rowKey);
        if (nextPending) {
          setActiveRowKey(nextPending);
          requestAnimationFrame(() => focusRowProductSelect(nextPending));
        }
      } else {
        setSimilarOffer(null);
      }
    },
    [
      draft?.supplierName,
      focusRowProductSelect,
      inventoryProducts,
      lineRows,
      restaurantId,
      triggerRowFlash,
    ],
  );

  const handleApplySimilarLines = useCallback(() => {
    if (!similarOffer) return;

    const targetKeys = similarOffer.targetRowKeys;
    setLineRows((prev) => {
      const nextRows = prev.map((row) => {
        if (!targetKeys.includes(row.rowKey)) return row;
        return {
          ...row,
          matchedInventoryProductId: similarOffer.productId,
          matchedInventoryProductName: similarOffer.productName,
          confidence: 1,
          status: "matched" as const,
        };
      });
      const validation = validateExtractedInvoiceLinesForRecording(nextRows);
      const nextPending = findNextPendingRowKey(nextRows, validation);
      if (nextPending) {
        setActiveRowKey(nextPending);
        requestAnimationFrame(() => focusRowProductSelect(nextPending));
      }
      return nextRows;
    });
    triggerCascadeFlash(targetKeys);
    setSimilarOffer(null);
  }, [focusRowProductSelect, similarOffer, triggerCascadeFlash]);

  const toggleLineIncluded = useCallback((rowKey: string, included: boolean) => {
    setLineRows((prev) =>
      prev.map((row) => (row.rowKey === rowKey ? { ...row, included } : row)),
    );
  }, []);

  const toggleRowSelected = useCallback((rowKey: string, selected: boolean) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (selected) next.add(rowKey);
      else next.delete(rowKey);
      return next;
    });
  }, []);

  const toggleAllRowsSelected = useCallback(
    (selected: boolean) => {
      setSelectedRowKeys(selected ? new Set(lineRows.map((row) => row.rowKey)) : new Set());
    },
    [lineRows],
  );

  const handleBulkExclude = useCallback(() => {
    if (selectedRowKeys.size === 0) return;
    setLineRows((prev) =>
      prev.map((row) =>
        selectedRowKeys.has(row.rowKey) ? { ...row, included: false } : row,
      ),
    );
  }, [selectedRowKeys]);

  const handleBulkInclude = useCallback(() => {
    if (selectedRowKeys.size === 0) return;
    setLineRows((prev) =>
      prev.map((row) =>
        selectedRowKeys.has(row.rowKey) ? { ...row, included: true } : row,
      ),
    );
  }, [selectedRowKeys]);

  const handleBulkApplyProduct = useCallback(() => {
    if (!bulkProductId || selectedRowKeys.size === 0) return;
    const product = inventoryProducts.find((item) => item.id === bulkProductId);
    if (!product) return;

    setLineRows((prev) =>
      prev.map((row) => {
        if (!selectedRowKeys.has(row.rowKey)) return row;
        return {
          ...row,
          matchedInventoryProductId: product.id,
          matchedInventoryProductName: product.name,
          confidence: 1,
          status: "matched" as const,
        };
      }),
    );
    setManualProductRows((prev) => {
      const next = new Set(prev);
      for (const key of selectedRowKeys) next.add(key);
      return next;
    });
    setLearnedAliasRows((prev) => {
      const next = new Set(prev);
      for (const key of selectedRowKeys) next.delete(key);
      return next;
    });
    triggerCascadeFlash([...selectedRowKeys]);
  }, [bulkProductId, inventoryProducts, selectedRowKeys, triggerCascadeFlash]);

  const handleBulkApplyUnit = useCallback(() => {
    const unit = bulkUnit.trim();
    if (!unit || selectedRowKeys.size === 0) return;
    setLineRows((prev) =>
      prev.map((row) => (selectedRowKeys.has(row.rowKey) ? { ...row, unit } : row)),
    );
  }, [bulkUnit, selectedRowKeys]);

  const confirmCurrentRow = useCallback(
    (rowKey: string) => {
      const validation = validateExtractedInvoiceLinesForRecording(lineRows);
      const index = lineRows.findIndex((row) => row.rowKey === rowKey);
      if (index < 0) return;
      const result = validation.lineResults[index];
      if (result?.isValid) {
        triggerRowFlash(rowKey);
      }
      const nextPending = findNextPendingRowKey(lineRows, validation, rowKey);
      if (nextPending) {
        focusRowField(nextPending, "product");
      }
    },
    [focusRowField, lineRows, triggerRowFlash],
  );

  const navigateIncludedRow = useCallback(
    (direction: "up" | "down") => {
      const current = activeRowKey ?? getIncludedRowKeys(lineRows)[0] ?? null;
      if (!current) return;
      const next = getAdjacentIncludedRowKey(lineRows, current, direction);
      if (next) focusRowField(next, "product");
    },
    [activeRowKey, focusRowField, lineRows],
  );

  const handleFieldTab = useCallback(
    (rowKey: string, field: InvoiceOcrFieldId, event: KeyboardEvent<HTMLInputElement>) => {
      const nextField = getNextFieldInRow(field);
      if (!nextField) return;
      event.preventDefault();
      focusRowField(rowKey, nextField);
    },
    [focusRowField],
  );

  const handleRowFieldKeyDown = useCallback(
    (rowKey: string, field: InvoiceOcrFieldId, event: KeyboardEvent<HTMLInputElement>) => {
      if (event.defaultPrevented) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (field === "product" && event.currentTarget.dataset.dropdownOpen === "true") {
          return;
        }
        event.preventDefault();
        navigateIncludedRow(event.key === "ArrowDown" ? "down" : "up");
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (field === "unitPrice") {
          confirmCurrentRow(rowKey);
          return;
        }
        const nextField = getNextFieldInRow(field);
        if (nextField) focusRowField(rowKey, nextField);
      }
    },
    [confirmCurrentRow, focusRowField, navigateIncludedRow],
  );

  const lineValidation = useMemo(
    () => validateExtractedInvoiceLinesForRecording(lineRows),
    [lineRows],
  );

  const registrationTotals = useMemo(
    () => calculateExtractedInvoiceTotals(lineRows),
    [lineRows],
  );

  const reviewKpis = useMemo(
    () => computeReviewKpiSummary(lineRows, lineValidation, registrationTotals.total),
    [lineRows, lineValidation, registrationTotals.total],
  );

  const extractionStatusBadge = useMemo(
    () => getExtractionStatusBadge(isDemoInvoice, extractionMeta),
    [extractionMeta, isDemoInvoice],
  );

  const handleOpenRegisterModal = useCallback(() => {
    if (!draft || isRegistering) return;
    if (!lineValidation.canRegister) {
      setRegisterFeedback(lineValidation.blockingReason);
      return;
    }
    setRegisterFeedback(null);
    setRegisterModalOpen(true);
  }, [draft, isRegistering, lineValidation.blockingReason, lineValidation.canRegister]);

  const handleCloseRegisterModal = useCallback(() => {
    if (isRegistering) return;
    setRegisterModalOpen(false);
  }, [isRegistering]);

  useEffect(() => {
    if (!draft) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;

      if (event.key === "Escape" && registerModalOpen) {
        event.preventDefault();
        if (!isRegistering) handleCloseRegisterModal();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        if (registerModalOpen || isRegistering || registeredInvoiceId) return;
        event.preventDefault();
        handleOpenRegisterModal();
        return;
      }

      if (isEditable && tag !== "body") return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        navigateIncludedRow("down");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        navigateIncludedRow("up");
      } else if (event.key === "Enter" && activeRowKey) {
        event.preventDefault();
        confirmCurrentRow(activeRowKey);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeRowKey,
    confirmCurrentRow,
    draft,
    handleCloseRegisterModal,
    handleOpenRegisterModal,
    isRegistering,
    navigateIncludedRow,
    registerModalOpen,
    registeredInvoiceId,
  ]);

  const handleConfirmRegister = useCallback(async () => {
    if (!restaurantId || !draft || isRegistering || !lineValidation.canRegister) return;

    setIsRegistering(true);
    setRegisterFeedback(null);

    try {
      const input = buildSupplierInvoiceInputFromExtractedDraft({
        restaurantId,
        draft,
        lines: lineRows,
      });

      const { invoiceId } = await createSupplierInvoice(input);
      await recordSupplierInvoice({ restaurantId, invoiceId });

      await learnSupplierProductAliasesFromLines({
        restaurantId,
        supplierName: draft.supplierName,
        learnedFromInvoiceId: invoiceId,
        lines: lineRows,
      }).catch(() => undefined);

      setRegisteredInvoiceId(invoiceId);
      setShowRegisterSuccess(true);
      window.setTimeout(() => setShowRegisterSuccess(false), 700);
      setRegisterFeedback(
        `Factura registrada · ${formatShortId(invoiceId)}. Costes de inventario actualizados.`,
      );
    } catch (error) {
      if (error instanceof SupplierInvoiceError) {
        if (error.code === "cost_apply_failed") {
          setRegisterFeedback("No se pudo actualizar el coste de uno o más productos.");
        } else if (error.code === "already_recorded") {
          setRegisterFeedback("Esta factura ya estaba registrada.");
        } else {
          setRegisterFeedback("No se pudo registrar la factura.");
        }
      } else if (error instanceof Error && error.message) {
        setRegisterFeedback(error.message);
      } else {
        setRegisterFeedback("No se pudo registrar la factura.");
      }
    } finally {
      setIsRegistering(false);
    }
  }, [draft, isRegistering, lineRows, lineValidation.canRegister, restaurantId]);

  const handleGoToInvoiceList = useCallback(() => {
    setRegisterModalOpen(false);
    router.push("/dashboard/inventario/facturas-proveedor");
  }, [router]);

  const isPdfPreview = selectedFile?.type === "application/pdf";

  return (
    <ModulePageShell
      title="Nueva factura (OCR)"
      subtitle="Lectura automática con revisión antes de guardar"
      {...inventoryHubShellLayout}
      headerBelow={<InventarioRouteTabs />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <Link href="/dashboard/inventario/facturas-proveedor" style={actionButtonStyle} prefetch>
          ← Volver a facturas
        </Link>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <HostlySectionHeader
            title="Subir y revisar factura"
            description="Comprueba los datos detectados y confirma cada producto antes de registrar la factura"
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start", justifyContent: "flex-end" }}>
            <SessionLearningPanel entries={sessionLearnings} />
            <ExtractionStatusBar badge={extractionStatusBadge} />
          </div>
        </div>

        {isMobileLayout ? (
          <MobileViewTabs active={mobileTab} onChange={setMobileTab} />
        ) : null}

        {isDemoInvoice ? (
          <div
            className="hostly-panel p-3"
            style={{
              fontSize: 13,
              border: "1px solid rgba(245, 158, 11, 0.35)",
              background: "rgba(245, 158, 11, 0.08)",
              color: "#b45309",
            }}
          >
            <strong>Modo de demostración.</strong> Datos ficticios para probar la vinculación, la
            edición y el registro.
          </div>
        ) : null}

        {errorMessage ? (
          <div className="hostly-panel p-3" style={{ fontSize: 13, color: "#b91c1c" }}>
            {errorMessage}
            {selectedFile ? (
              <div style={{ marginTop: 8 }}>
                <button type="button" style={actionButtonStyle} onClick={() => void runExtraction()}>
                  Reintentar extracción
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {registerFeedback ? (
          <div
            className="hostly-panel p-3"
            style={{
              fontSize: 13,
              color: registeredInvoiceId ? "var(--hostly-ink-muted)" : "#b91c1c",
            }}
          >
            {registerFeedback}
            {registeredInvoiceId ? (
              <div style={{ marginTop: 8 }}>
                <button type="button" style={primaryButtonStyle} onClick={handleGoToInvoiceList}>
                  Ver listado de facturas
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {extractionStatusBadge && extractionStatusBadge.warnings.length > 0 ? (
          <div className="hostly-panel p-3" style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>
            {extractionStatusBadge.warnings.slice(0, 3).map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobileLayout
              ? "1fr"
              : layoutMode === "tablet"
                ? "minmax(0, 40fr) minmax(0, 60fr)"
                : "minmax(0, 42fr) minmax(0, 58fr)",
            gap: 12,
            alignItems: "start",
          }}
        >
          {(!isMobileLayout || mobileTab === "document") && (
            <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Documento</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                style={{ fontSize: 13 }}
              />
              <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>
                JPG, PNG, WebP o PDF · máx. 12 MB
              </div>

              {showDemoControls ? (
                <button
                  type="button"
                  style={{
                    ...actionButtonStyle,
                    alignSelf: "flex-start",
                    fontSize: 12,
                    padding: "6px 10px",
                    borderStyle: "dashed",
                    color: "var(--hostly-ink-muted)",
                  }}
                  onClick={handleUseDemoInvoice}
                >
                  Usar factura demo
                </button>
              ) : null}

              <DocumentPreviewPanel
                previewUrl={previewUrl}
                isPdfPreview={isPdfPreview}
                isDemoInvoice={isDemoInvoice}
                isLoading={phase === "uploading"}
                sticky={!isMobileLayout}
              />

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  style={primaryButtonStyle}
                  disabled={!selectedFile || phase === "uploading" || isDemoInvoice}
                  onClick={() => void runExtraction()}
                >
                  {phase === "uploading" ? "Extrayendo…" : "Extraer datos"}
                </button>
                <span style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>
                  {isDemoInvoice
                    ? "Demo cargada"
                    : phase === "ready"
                      ? "Listo para revisar"
                      : phase === "uploading"
                        ? "Subiendo y extrayendo…"
                        : "Pendiente"}
                </span>
              </div>
              {uploadMeta ? (
                <div style={{ fontSize: 11, color: "var(--hostly-ink-muted)" }}>{uploadMeta}</div>
              ) : null}
            </div>
          )}

          {(!isMobileLayout || mobileTab === "review") && (
            <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Revisión</div>

              {!draft ? (
                <div style={{ fontSize: 13, color: "var(--hostly-ink-muted)" }}>
                  Extrae una factura o usa la demo para empezar la revisión.
                </div>
              ) : (
                <>
                  <InvoiceHeaderFields draft={draft} onUpdate={updateDraftField} />

                  <ReviewKpiStrip kpis={reviewKpis} formatEur={(value) => formatEur(value)} />

                  {lineValidation.invalidIncludedCount > 0 ? (
                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid rgba(245, 158, 11, 0.35)",
                        background: "rgba(245, 158, 11, 0.08)",
                        fontSize: 12,
                        color: "#b45309",
                      }}
                    >
                      {lineValidation.blockingReason}
                    </div>
                  ) : null}

                  {similarOffer ? (
                    <ApplySimilarLinesBanner
                      count={similarOffer.targetRowKeys.length}
                      productName={similarOffer.productName}
                      onApply={handleApplySimilarLines}
                      onDismiss={() => setSimilarOffer(null)}
                    />
                  ) : null}

                  <BulkActionsToolbar
                    selectedCount={selectedRowKeys.size}
                    inventoryProducts={inventoryProducts}
                    bulkProductId={bulkProductId}
                    bulkUnit={bulkUnit}
                    onBulkProductChange={setBulkProductId}
                    onBulkUnitChange={setBulkUnit}
                    onExcludeSelected={handleBulkExclude}
                    onIncludeSelected={handleBulkInclude}
                    onApplyProduct={handleBulkApplyProduct}
                    onApplyUnit={handleBulkApplyUnit}
                    onClearSelection={() => setSelectedRowKeys(new Set())}
                  />

                  <ReviewLinesTable
                    lineRows={lineRows}
                    lineValidation={lineValidation}
                    inventoryProducts={inventoryProducts}
                    productInputRefs={productInputRefs}
                    fieldInputRefs={fieldInputRefs}
                    onToggleIncluded={toggleLineIncluded}
                    onUpdateLine={updateLine}
                    onProductChange={handleProductLinkChange}
                    formatEur={formatEur}
                    compact={isMobileLayout || layoutMode === "tablet"}
                    selectedRowKeys={selectedRowKeys}
                    onToggleSelected={toggleRowSelected}
                    onToggleAllSelected={toggleAllRowsSelected}
                    activeRowKey={activeRowKey}
                    flashingRowKeys={flashingRowKeys}
                    cascadeRowKeys={cascadeRowKeys}
                    manualProductRows={manualProductRows}
                    learnedAliasRows={learnedAliasRows}
                    onFieldTab={handleFieldTab}
                    onRowFieldKeyDown={handleRowFieldKeyDown}
                  />

                  <RegistrationFooter
                    canRegister={lineValidation.canRegister}
                    isRegistering={isRegistering}
                    registered={!!registeredInvoiceId}
                    showSuccess={showRegisterSuccess}
                    onRegister={handleOpenRegisterModal}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {registerModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar registro de factura"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(2, 6, 23, 0.62)",
            backdropFilter: "blur(6px)",
          }}
          onMouseDown={(e) => {
            if (e.currentTarget === e.target && !isRegistering) {
              handleCloseRegisterModal();
            }
          }}
        >
          <div
            className="hostly-panel"
            style={{
              width: "min(520px, 100%)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: 16,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {registeredInvoiceId ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
                  Factura registrada
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--hostly-ink-muted)" }}>
                  Se ha creado la factura {formatShortId(registeredInvoiceId)} con estado{" "}
                  <strong>recorded</strong>. Los costes futuros de inventario se han actualizado.
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" style={primaryButtonStyle} onClick={handleGoToInvoiceList}>
                    Ver listado
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
                  Confirmar registro
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--hostly-ink-muted)" }}>
                  Proveedor: <strong>{draft?.supplierName?.trim() || "—"}</strong>
                  <br />
                  Total: <strong>{formatEur(registrationTotals.total)}</strong>
                  <br />
                  Líneas válidas: <strong>{registrationTotals.validIncludedCount}</strong>
                </p>
                {isDemoInvoice ? (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px dashed rgba(245, 158, 11, 0.45)",
                      fontSize: 12,
                      color: "#b45309",
                    }}
                  >
                    Estás registrando una factura demo. Se creará un supplierInvoice real con
                    número DEMO-F-*.
                  </div>
                ) : null}
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    background: "rgba(245, 158, 11, 0.08)",
                    fontSize: 12,
                    color: "#b45309",
                    fontWeight: 600,
                  }}
                >
                  Se actualizarán los costes futuros de inventario. Las ventas históricas no
                  cambian.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="button"
                    style={actionButtonStyle}
                    onClick={handleCloseRegisterModal}
                    disabled={isRegistering}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    style={primaryButtonStyle}
                    disabled={isRegistering}
                    onClick={() => void handleConfirmRegister()}
                  >
                    {isRegistering ? "Registrando…" : "Confirmar registro"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </ModulePageShell>
  );
}
