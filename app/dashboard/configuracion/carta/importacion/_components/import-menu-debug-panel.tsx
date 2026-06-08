"use client";

import { useMemo, useState, type ReactNode } from "react";
import { HostlySurface } from "@/components/ui/hostly";
import {
  isMenuImportDebugPanelEnabled,
  PARSE_LINE_OUTCOME_LABELS,
  type MenuImportDebugReport,
} from "@/lib/carta/menu-import-debug-report-types";

type ImportMenuDebugPanelProps = {
  report: MenuImportDebugReport | null;
  sourceImageUrl?: string | null;
  manualProductCount?: number | null;
};

function DebugSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details open={open} className="rounded-lg border border-slate-200/90 bg-white/80">
      <summary
        className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-800"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        {title}
        {typeof count === "number" ? ` (${count})` : ""}
      </summary>
      <div className="border-t border-slate-100 px-3 py-2">{children}</div>
    </details>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ImportMenuDebugPanel({
  report,
  sourceImageUrl,
  manualProductCount,
}: ImportMenuDebugPanelProps) {
  const [copied, setCopied] = useState(false);

  const gapSummary = useMemo(() => {
    if (!report || manualProductCount == null || manualProductCount <= 0) return null;
    const { counts } = report;
    return {
      manual: manualProductCount,
      ocrLines: counts.ocrLines,
      parsed: counts.parserProducts,
      accepted: counts.ocrValidationAccepted,
      rejected: counts.ocrValidationRejected,
      unparsedLikely: report.likelyUnparsedOcrLines.length,
      pendingNames: report.unparsedPendingNames.length,
    };
  }, [manualProductCount, report]);

  if (!isMenuImportDebugPanelEnabled() || !report) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <HostlySurface
      variant="flat"
      className="border-dashed border-orange-300/90 bg-orange-50/40 p-4 font-mono text-[11px] text-slate-800"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-orange-900">
            Debug importación (solo dev)
          </p>
          <p className="mt-0.5 text-[10px] text-orange-900/80">
            Trazabilidad OCR → parser → IA → validación. No visible en producción.
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-orange-300 bg-white px-2 py-1 text-[10px] font-semibold text-orange-950"
          onClick={() => void handleCopy()}
        >
          {copied ? "Copiado" : "Copiar JSON"}
        </button>
      </div>

      {sourceImageUrl ? (
        <DebugSection title="Imagen / archivo procesado" defaultOpen>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sourceImageUrl}
            alt="Carta subida"
            className="max-h-64 max-w-full rounded border border-slate-200 object-contain"
          />
        </DebugSection>
      ) : null}

      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["Líneas OCR", report.counts.ocrLines],
            ["Parser", report.counts.parserProducts],
            ["Tras IA", report.counts.afterEnrichment],
            ["Aceptados OCR", report.counts.ocrValidationAccepted],
            ["Rechazados OCR", report.counts.ocrValidationRejected],
            ["En revisión", report.counts.needsReviewFinal],
            ["Seleccionados", report.counts.selectedForPublishFinal],
            ["Líneas sin producto", report.likelyUnparsedOcrLines.length],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded border border-slate-200/80 bg-white px-2 py-1.5">
            <p className="text-[9px] uppercase text-slate-500">{label}</p>
            <p className="text-sm font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <HostlySurface variant="flat" className="mt-2 border-orange-300/80 bg-orange-100/60 p-2">
        <p className="text-[10px] font-semibold text-orange-950">Gate parser visual</p>
        <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
          <p className="text-[10px] text-orange-900">
            textItemsCount:{" "}
            <span className="font-bold">{report.textItemsCount ?? "—"}</span>
          </p>
          <p className="text-[10px] text-orange-900">
            visualItemsCount:{" "}
            <span className="font-bold">{report.visualItemsCount ?? report.visualBlocksCount ?? "—"}</span>
          </p>
          <p className="text-[10px] text-orange-900">
            layoutLinesCount:{" "}
            <span className="font-bold">{report.layoutLinesCount ?? "—"}</span>
          </p>
          <p className="text-[10px] text-orange-900">
            visualBlocksCount:{" "}
            <span className="font-bold">{report.visualBlocksCount ?? "—"}</span>
          </p>
          <p className="text-[10px] text-orange-900">
            recoveredVisualBlocksCount:{" "}
            <span className="font-bold">{report.recoveredVisualBlocksCount ?? "—"}</span>
          </p>
          <p className="text-[10px] text-orange-900">
            selectedParserMode:{" "}
            <span className="font-bold">{report.selectedParserMode ?? report.parserMode ?? "—"}</span>
          </p>
          <p className="text-[10px] text-orange-900">
            ocrPageWidth: <span className="font-bold">{report.ocrPageWidth ?? "—"}</span>
          </p>
        </div>
        {report.visualCandidateRejectedReason ? (
          <p className="mt-1 text-[10px] text-orange-800">
            Visual rechazado:{" "}
            <span className="font-semibold">{report.visualCandidateRejectedReason}</span>
          </p>
        ) : null}
        {report.visualParserGateReason ? (
          <p className="mt-1 text-[10px] text-orange-800">
            Fallback: <span className="font-semibold">{report.visualParserGateReason}</span>
          </p>
        ) : null}
      </HostlySurface>

      {report.ocrLayoutExtraction ? (
        <HostlySurface variant="flat" className="mt-2 border-sky-300/80 bg-sky-50/60 p-2">
          <p className="text-[10px] font-semibold text-sky-950">Extracción layout Vision</p>
          <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
            <p className="text-[10px] text-sky-900">
              method: <span className="font-bold">{report.ocrLayoutExtraction.method}</span>
            </p>
            <p className="text-[10px] text-sky-900">
              visionBlockCount:{" "}
              <span className="font-bold">{report.ocrLayoutExtraction.visionBlockCount}</span>
            </p>
            <p className="text-[10px] text-sky-900">
              visionParagraphCount:{" "}
              <span className="font-bold">{report.ocrLayoutExtraction.visionParagraphCount}</span>
            </p>
            <p className="text-[10px] text-sky-900">
              linesPerBlock:{" "}
              <span className="font-bold">
                {report.ocrLayoutExtraction.layoutLinesPerBlock.join(", ") || "—"}
              </span>
            </p>
          </div>
          {report.ocrLayoutExtraction.sampleLinesBefore.length > 0 ? (
            <div className="mt-2">
              <p className="text-[9px] font-semibold uppercase text-sky-800">Antes (global Y)</p>
              <ul className="mt-0.5 max-h-24 space-y-0.5 overflow-auto">
                {report.ocrLayoutExtraction.sampleLinesBefore.map((line, index) => (
                  <li key={`layout-before-${index}`} className="text-[10px] text-sky-900">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.ocrLayoutExtraction.sampleLinesAfter.length > 0 ? (
            <div className="mt-2">
              <p className="text-[9px] font-semibold uppercase text-sky-800">Después (por bloque)</p>
              <ul className="mt-0.5 max-h-24 space-y-0.5 overflow-auto">
                {report.ocrLayoutExtraction.sampleLinesAfter.map((line, index) => (
                  <li key={`layout-after-${index}`} className="text-[10px] text-sky-900">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </HostlySurface>
      ) : null}

      {report.inputMetadata ? (
        <p className="mt-2 text-[10px] text-slate-600">
          Entrada: {formatBytes(report.inputMetadata.bytes)} · {report.inputMetadata.contentType} ·{" "}
          {report.inputMetadata.ocrMethod}
          {report.inputMetadata.storagePath ? ` · ${report.inputMetadata.storagePath}` : ""}
          {report.parserMode ? ` · parser=${report.parserMode}` : ""}
        </p>
      ) : null}

      {gapSummary ? (
        <HostlySurface variant="flat" className="mt-2 border-amber-200/80 bg-amber-50/80 p-2">
          <p className="text-[10px] font-semibold text-amber-950">Comparación manual</p>
          <p className="mt-1 text-[10px] text-amber-900">
            Visibles en carta: {gapSummary.manual} · OCR líneas: {gapSummary.ocrLines} · Parser:{" "}
            {gapSummary.parsed} · Aceptados: {gapSummary.accepted} · Rechazados:{" "}
            {gapSummary.rejected} · Probables sin parsear: {gapSummary.unparsedLikely} · Nombres
            pendientes: {gapSummary.pendingNames}
          </p>
        </HostlySurface>
      ) : null}

      <div className="mt-3 space-y-2">
        <DebugSection title="Texto OCR bruto (preview)" count={report.ocrRawLength}>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px]">
            {report.ocrRawPreview}
            {report.ocrRawLength > report.ocrRawPreview.length
              ? `\n… (${report.ocrRawLength - report.ocrRawPreview.length} chars más)`
              : ""}
          </pre>
        </DebugSection>

        <DebugSection title="Líneas OCR detectadas" count={report.ocrLines.length}>
          <ul className="max-h-48 space-y-0.5 overflow-auto">
            {report.ocrLines.map((line, index) => (
              <li key={`ocr-line-${index}-${line.index}`} className="text-[10px]">
                <span className="text-slate-400">#{line.index}</span> {line.text}
              </li>
            ))}
          </ul>
        </DebugSection>

        <DebugSection title="Auditoría parser (línea a línea)" count={report.parseLineEvents.length}>
          <ul className="max-h-56 space-y-1 overflow-auto">
            {report.parseLineEvents.map((event, index) => (
              <li key={`parse-event-${index}-${event.lineIndex}-${event.outcome}`} className="text-[10px]">
                <span className="text-slate-400">#{event.lineIndex}</span>{" "}
                <span className="font-semibold text-violet-900">
                  {PARSE_LINE_OUTCOME_LABELS[event.outcome] ?? event.outcome}
                </span>
                {event.productName ? ` · ${event.productName}` : ""}
                {event.price != null ? ` · ${event.price}€` : ""}
                {event.detail ? ` · ${event.detail}` : ""}
                <div className="text-slate-600">{event.text}</div>
              </li>
            ))}
          </ul>
        </DebugSection>

        <DebugSection title="Productos parser" count={report.parserProducts.length}>
          <ul className="max-h-40 space-y-0.5 overflow-auto">
            {report.parserProducts.map((p) => (
              <li key={p.id} className="text-[10px]">
                {p.name}
                {p.price != null ? ` · ${p.price}€` : " · sin precio"} · {p.section}
              </li>
            ))}
          </ul>
        </DebugSection>

        <DebugSection title="Descartados (validación OCR)" count={report.rejected.length} defaultOpen>
          {report.rejected.length === 0 ? (
            <p className="text-[10px] text-slate-500">Ninguno</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-auto">
              {report.rejected.map((row, index) => (
                <li key={`rejected-${index}-${row.name}`} className="text-[10px]">
                  <span className="font-semibold text-rose-900">{row.name}</span>
                  <div className="text-rose-800">{row.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </DebugSection>

        <DebugSection title="En revisión / no seleccionados" count={report.reviewItems.length}>
          <ul className="max-h-40 space-y-1 overflow-auto">
            {report.reviewItems.map((item) => (
              <li key={item.id} className="text-[10px]">
                {item.name} · {item.reasons.join(", ")}
              </li>
            ))}
          </ul>
        </DebugSection>

        <DebugSection
          title="Líneas OCR probables sin producto"
          count={report.likelyUnparsedOcrLines.length}
          defaultOpen
        >
          <ul className="max-h-48 space-y-1 overflow-auto">
            {report.likelyUnparsedOcrLines.map((line, index) => (
              <li key={`likely-unparsed-${index}-${line.index}`} className="text-[10px]">
                <span className="text-slate-400">#{line.index}</span>{" "}
                <span className="font-semibold text-amber-900">{line.hint}</span> · {line.text}
              </li>
            ))}
          </ul>
        </DebugSection>

        {report.unparsedPendingNames.length > 0 ? (
          <DebugSection title="Nombres pendientes sin precio" count={report.unparsedPendingNames.length}>
            <ul className="max-h-32 space-y-0.5 overflow-auto">
              {report.unparsedPendingNames.map((row, index) => (
                <li key={`pending-${row.section}-${row.name}-${index}`} className="text-[10px]">
                  {row.name} · {row.section}
                </li>
              ))}
            </ul>
          </DebugSection>
        ) : null}

        {(report.columnBlockPairings?.length ?? 0) > 0 ? (
          <DebugSection title="Emparejamientos bloque columnar" count={report.columnBlockPairings?.length}>
            <ul className="max-h-40 space-y-0.5 overflow-auto">
              {report.columnBlockPairings?.map((row, index) => (
                <li
                  key={`column-pair-${index}-${row.nameLineIndex}-${row.priceLineIndex}`}
                  className="text-[10px]"
                >
                  #{row.nameLineIndex} {row.name} → {row.price}€ (precio #{row.priceLineIndex},{" "}
                  {row.priceStrength})
                </li>
              ))}
            </ul>
          </DebugSection>
        ) : null}

        {(report.skippedAmbiguousPrices?.length ?? 0) > 0 ? (
          <DebugSection title="Precios ambiguos omitidos" count={report.skippedAmbiguousPrices?.length}>
            <ul className="max-h-32 space-y-0.5 overflow-auto">
              {report.skippedAmbiguousPrices?.map((row, index) => (
                <li key={`ambiguous-price-${index}-${row.lineIndex}-${row.text}`} className="text-[10px]">
                  #{row.lineIndex} {row.text} · {row.reason}
                </li>
              ))}
            </ul>
          </DebugSection>
        ) : null}

        {report.visualLayout ? (
          <>
            <DebugSection title="Layout visual OCR" defaultOpen>
              <p className="text-[10px] text-slate-700">
                Página {report.visualLayout.pageWidth}×{report.visualLayout.pageHeight}px · split X=
                {Math.round(report.visualLayout.columnSplitX)} · altura línea ≈
                {Math.round(report.visualLayout.medianLineHeight)}px
              </p>
            </DebugSection>

            <DebugSection
              title="Líneas OCR con coordenadas"
              count={report.visualLayout.ocrLinesWithCoords.length}
            >
              <ul className="max-h-52 space-y-0.5 overflow-auto">
                {report.visualLayout.ocrLinesWithCoords.map((line, index) => (
                  <li key={`ocr-coord-${index}-${line.lineIndex}`} className="text-[10px]">
                    #{line.lineIndex} ({line.centerX},{line.centerY}) x[{line.minX}-{line.maxX}] ·{" "}
                    {line.text}
                  </li>
                ))}
              </ul>
            </DebugSection>

            <DebugSection
              title="Bloques visuales detectados"
              count={report.visualLayout.visualBlocks.length}
              defaultOpen
            >
              <ul className="max-h-52 space-y-1 overflow-auto">
                {report.visualLayout.visualBlocks.map((block, index) => (
                  <li
                    key={`visual-block-${index}-${block.anchorY}-${block.nameLine}`}
                    className="text-[10px]"
                  >
                    <span className="font-semibold text-emerald-900">
                      {block.canonicalName ?? block.nameLine}
                    </span>
                    {block.rawName && block.rawName !== (block.canonicalName ?? block.nameLine) ? (
                      <span className="text-slate-500"> · raw: {block.rawName}</span>
                    ) : null}
                    {block.descriptionFromName ? (
                      <span className="text-slate-600"> · desc: {block.descriptionFromName}</span>
                    ) : null}
                    {block.nameNormalizationReason ? (
                      <span className="text-slate-400"> · {block.nameNormalizationReason}</span>
                    ) : null}
                    {block.matchSource ? (
                      <span
                        className={
                          block.matchSource === "fallback_match"
                            ? " text-amber-700"
                            : " text-emerald-700"
                        }
                      >
                        {" "}
                        · {block.matchSource}
                      </span>
                    ) : null}
                    {block.price != null ? ` → ${block.price}€` : " · sin precio"}
                    {block.translationLines.length > 0
                      ? ` · ${block.translationLines.length} traducción(es) omitida(s)`
                      : ""}
                  </li>
                ))}
              </ul>
            </DebugSection>

            {(report.visualLayout.discardedTranslationLines?.length ?? 0) > 0 ? (
              <DebugSection
                title="Traducciones descartadas (layout)"
                count={report.visualLayout.discardedTranslationLines.length}
              >
                <ul className="max-h-40 space-y-0.5 overflow-auto">
                  {report.visualLayout.discardedTranslationLines.map((row, index) => (
                    <li key={`discarded-tr-${index}-${row.lineIndex}-${row.text}`} className="text-[10px]">
                      #{row.lineIndex} {row.text}
                    </li>
                  ))}
                </ul>
              </DebugSection>
            ) : null}
          </>
        ) : null}
      </div>
    </HostlySurface>
  );
}
