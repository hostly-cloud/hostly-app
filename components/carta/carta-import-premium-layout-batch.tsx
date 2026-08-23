"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OriginalCartaImportPremiumLayout, {
  type CartaImportPremiumLayoutProps,
} from "./carta-import-premium-layout";
import { useI18n } from "@/components/i18n-provider";
import { MAX_MENU_IMPORT_SOURCE_FILES } from "@/lib/carta/menu-import-source-files";
import {
  clearRegisteredMenuImportBatch,
  dedupeMenuImportBatchFiles,
  moveMenuImportBatchFile,
  readRegisteredMenuImportBatch,
  registerMenuImportBatch,
  removeMenuImportBatchFile,
  validateMenuImportBatchSelection,
  type MenuImportBatchSelectionErrorCode,
} from "@/lib/carta/menu-import-client-batch";

export * from "./carta-import-premium-layout";

function batchErrorMessage(code: MenuImportBatchSelectionErrorCode, english: boolean): string {
  if (code === "MENU_IMPORT_BATCH_TOO_LARGE") {
    return english
      ? `You can import up to ${MAX_MENU_IMPORT_SOURCE_FILES} photos in one batch.`
      : `Puedes importar hasta ${MAX_MENU_IMPORT_SOURCE_FILES} fotos en un mismo lote.`;
  }
  if (code === "MENU_IMPORT_BATCH_PDF_MIXED") {
    return english
      ? "PDF files are imported one at a time. For several pages, select images."
      : "Los PDF se importan de uno en uno. Para varias páginas, selecciona imágenes.";
  }
  if (code === "MENU_IMPORT_FILE_TYPE_UNSUPPORTED") {
    return english
      ? "Select images or a PDF file."
      : "Selecciona imágenes o un archivo PDF.";
  }
  return english ? "Select at least one file." : "Selecciona al menos un archivo.";
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

export default function CartaImportPremiumLayoutBatch(
  props: CartaImportPremiumLayoutProps,
) {
  const { locale } = useI18n();
  const english = locale === "en";
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const appendInputRef = useRef<HTMLInputElement>(null);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const batchEnabled = props.variant === "onboarding";

  useEffect(() => {
    if (!batchEnabled) return;
    if (!props.file) {
      setBatchFiles([]);
      setBatchError(null);
      return;
    }
    const registered = readRegisteredMenuImportBatch(props.file);
    if (registered?.length) {
      setBatchFiles([...registered]);
      return;
    }
    setBatchFiles((current) => {
      if (current.includes(props.file!)) return current;
      registerMenuImportBatch(props.file!, [props.file!]);
      return [props.file!];
    });
  }, [batchEnabled, props.file]);

  useEffect(() => {
    if (!batchEnabled) return;
    const created: Record<string, string> = {};
    for (const file of batchFiles) {
      if (!file.type.startsWith("image/")) continue;
      created[fileKey(file)] = URL.createObjectURL(file);
    }
    setPreviewUrls(created);
    return () => {
      for (const url of Object.values(created)) URL.revokeObjectURL(url);
    };
  }, [batchEnabled, batchFiles]);

  const notifyParentPrimary = useCallback(
    (primary: File) => {
      const input = replaceInputRef.current;
      if (!input || typeof DataTransfer === "undefined") return;
      const transfer = new DataTransfer();
      transfer.items.add(primary);
      input.files = transfer.files;
      props.onFileInputChange({
        target: input,
        currentTarget: input,
      } as ChangeEvent<HTMLInputElement>);
    },
    [props.onFileInputChange],
  );

  const applyBatch = useCallback(
    (candidateFiles: readonly File[], options?: { notifyPrimary?: boolean }) => {
      const files = dedupeMenuImportBatchFiles(candidateFiles);
      const validation = validateMenuImportBatchSelection(files);
      if (!validation.ok) {
        setBatchError(batchErrorMessage(validation.code, english));
        return false;
      }

      const previousPrimary = props.file;
      const nextPrimary = files[0];
      setBatchError(null);
      setBatchFiles(files);
      if (previousPrimary && previousPrimary !== nextPrimary) {
        clearRegisteredMenuImportBatch(previousPrimary);
      }
      registerMenuImportBatch(nextPrimary, files);
      if (options?.notifyPrimary && previousPrimary !== nextPrimary) {
        notifyParentPrimary(nextPrimary);
      }
      return true;
    },
    [english, notifyParentPrimary, props.file],
  );

  const handleReplaceInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(event.currentTarget.files ?? []);
      if (!applyBatch(selected)) {
        event.currentTarget.value = "";
        return;
      }
      const primary = selected[0];
      const normalized = dedupeMenuImportBatchFiles(selected);
      if (primary && normalized.length > 0) {
        registerMenuImportBatch(primary, normalized);
      }
      props.onFileInputChange(event);
      event.currentTarget.value = "";
    },
    [applyBatch, props.onFileInputChange],
  );

  const handleAppendInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const incoming = Array.from(event.currentTarget.files ?? []);
      const base = batchFiles.length > 0 ? batchFiles : props.file ? [props.file] : [];
      const merged = dedupeMenuImportBatchFiles([...base, ...incoming]);
      if (applyBatch(merged, { notifyPrimary: base.length === 0 })) {
        const primary = merged[0];
        if (primary && !props.file) notifyParentPrimary(primary);
      }
      event.currentTarget.value = "";
    },
    [applyBatch, batchFiles, notifyParentPrimary, props.file],
  );

  const openReplacePicker = useCallback(() => {
    if (props.busy) return;
    if (replaceInputRef.current) replaceInputRef.current.value = "";
    replaceInputRef.current?.click();
  }, [props.busy]);

  const openAppendPicker = useCallback(() => {
    if (props.busy || batchFiles.length >= MAX_MENU_IMPORT_SOURCE_FILES) return;
    if (appendInputRef.current) appendInputRef.current.value = "";
    appendInputRef.current?.click();
  }, [batchFiles.length, props.busy]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const selected = Array.from(event.dataTransfer.files ?? []);
      if (selected.length === 0) {
        props.onDrop(event);
        return;
      }
      if (!applyBatch(selected)) {
        event.preventDefault();
        props.onDragLeave();
        return;
      }
      const normalized = dedupeMenuImportBatchFiles(selected);
      if (normalized[0]) registerMenuImportBatch(normalized[0], normalized);
      props.onDrop(event);
    },
    [applyBatch, props],
  );

  const commitReorder = useCallback(
    (next: File[]) => {
      if (next.length === 0) return;
      const previousPrimary = props.file;
      const nextPrimary = next[0];
      setBatchFiles(next);
      setBatchError(null);
      if (previousPrimary && previousPrimary !== nextPrimary) {
        clearRegisteredMenuImportBatch(previousPrimary);
      }
      registerMenuImportBatch(nextPrimary, next);
      if (previousPrimary !== nextPrimary) notifyParentPrimary(nextPrimary);
    },
    [notifyParentPrimary, props.file],
  );

  const movePage = useCallback(
    (index: number, direction: -1 | 1) => {
      commitReorder(moveMenuImportBatchFile(batchFiles, index, direction));
    },
    [batchFiles, commitReorder],
  );

  const removePage = useCallback(
    (index: number) => {
      const next = removeMenuImportBatchFile(batchFiles, index);
      if (next.length === 0) {
        if (props.file) clearRegisteredMenuImportBatch(props.file);
        setBatchFiles([]);
        setBatchError(null);
        props.onClearFile?.();
        return;
      }
      commitReorder(next);
    },
    [batchFiles, commitReorder, props],
  );

  const handleClear = useCallback(() => {
    if (props.file) clearRegisteredMenuImportBatch(props.file);
    setBatchFiles([]);
    setBatchError(null);
    props.onClearFile?.();
  }, [props]);

  const filesAreImages = batchFiles.every((file) => file.type.startsWith("image/"));
  const canAppend =
    Boolean(props.file) &&
    filesAreImages &&
    batchFiles.length < MAX_MENU_IMPORT_SOURCE_FILES &&
    !props.busy;

  const controls = useMemo(() => {
    if (!batchEnabled || batchFiles.length === 0) return null;
    return (
      <section
        aria-label={english ? "Menu pages" : "Páginas de la carta"}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "9px 10px",
          marginBottom: 8,
          borderRadius: 12,
          border: "1px solid var(--hostly-table-divider-soft)",
          background: "color-mix(in srgb, var(--hostly-info-soft) 62%, var(--hostly-surface-card-solid))",
          boxShadow: "var(--hostly-shadow-hairline)",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <strong style={{ fontSize: 12, color: "var(--hostly-navy-deep)", fontWeight: 750 }}>
              {batchFiles.length === 1
                ? english ? "1 page selected" : "1 página seleccionada"
                : english ? `${batchFiles.length} pages selected` : `${batchFiles.length} páginas seleccionadas`}
            </strong>
            <div style={{ marginTop: 2, fontSize: 10, lineHeight: 1.35, color: "var(--hostly-ink-muted)", fontWeight: 580 }}>
              {english
                ? "They will be analyzed in this order as one menu."
                : "Se analizarán en este orden como una sola carta."}
            </div>
          </div>
          {canAppend ? (
            <button
              type="button"
              onClick={openAppendPicker}
              className="hostly-button-secondary px-3 py-1.5 text-[11px] font-semibold"
            >
              {english ? "Add pages" : "Añadir páginas"}
            </button>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            gap: 7,
            overflowX: "auto",
            paddingBottom: 2,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {batchFiles.map((file, index) => {
            const preview = previewUrls[fileKey(file)];
            return (
              <div
                key={fileKey(file)}
                style={{
                  flex: "0 0 min(220px, 72vw)",
                  display: "grid",
                  gridTemplateColumns: "46px minmax(0,1fr)",
                  gap: 7,
                  alignItems: "center",
                  padding: 6,
                  borderRadius: 10,
                  border: "1px solid var(--hostly-table-divider-soft)",
                  background: "var(--hostly-surface-card-solid)",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 52,
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--hostly-table-head-surface)",
                    border: "1px solid var(--hostly-table-divider-faint)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 800,
                    color: "var(--hostly-ink-muted)",
                  }}
                >
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    "PDF"
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: "var(--hostly-accent)", fontWeight: 760, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    {english ? `Page ${index + 1}` : `Página ${index + 1}`}
                  </div>
                  <div
                    title={file.name}
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      fontWeight: 650,
                      color: "var(--hostly-ink-strong)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {file.name}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                    <button
                      type="button"
                      disabled={props.busy || index === 0}
                      onClick={() => movePage(index, -1)}
                      aria-label={english ? "Move page earlier" : "Mover página antes"}
                      className="hostly-button-secondary min-h-[28px] px-2 py-1 text-[11px] disabled:opacity-35"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={props.busy || index === batchFiles.length - 1}
                      onClick={() => movePage(index, 1)}
                      aria-label={english ? "Move page later" : "Mover página después"}
                      className="hostly-button-secondary min-h-[28px] px-2 py-1 text-[11px] disabled:opacity-35"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      disabled={props.busy}
                      onClick={() => removePage(index)}
                      aria-label={english ? "Remove page" : "Quitar página"}
                      className="hostly-button-secondary min-h-[28px] px-2 py-1 text-[11px] !text-[#b42318] disabled:opacity-35"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {batchError ? (
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: "#b42318", fontWeight: 650 }}>
            {batchError}
          </p>
        ) : null}
      </section>
    );
  }, [batchEnabled, batchError, batchFiles, canAppend, english, movePage, openAppendPicker, previewUrls, props.busy, removePage]);

  if (!batchEnabled) {
    return <OriginalCartaImportPremiumLayout {...props} />;
  }

  return (
    <>
      <input
        ref={replaceInputRef}
        type="file"
        multiple
        accept={props.accept}
        onChange={handleReplaceInput}
        style={{ display: "none" }}
        aria-hidden
      />
      <input
        ref={appendInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleAppendInput}
        style={{ display: "none" }}
        aria-hidden
      />
      {controls}
      <OriginalCartaImportPremiumLayout
        {...props}
        onOpenFileDialog={openReplacePicker}
        onDrop={handleDrop}
        onClearFile={handleClear}
        onUploadAnother={() => {
          handleClear();
          window.setTimeout(openReplacePicker, 0);
        }}
      />
    </>
  );
}
