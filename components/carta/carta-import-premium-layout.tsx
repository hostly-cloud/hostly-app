"use client";

import type { ChangeEvent, CSSProperties, DragEvent, ReactNode, RefObject } from "react";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { TipoProductoVenta } from "@/lib/platos-local";

const TIPO_KEYS: Record<TipoProductoVenta, string> = {
  plato: "carta.tipoPlato",
  bebida: "carta.tipoBebida",
};

const CARTA_MOCK_PREVIEW: { nameKey: string; priceKey: string; tipo: TipoProductoVenta }[] = [
  { nameKey: "onboarding.cartaMock1", priceKey: "onboarding.cartaMock1Price", tipo: "plato" },
  { nameKey: "onboarding.cartaMock2", priceKey: "onboarding.cartaMock2Price", tipo: "plato" },
  { nameKey: "onboarding.cartaMock3", priceKey: "onboarding.cartaMock3Price", tipo: "bebida" },
  { nameKey: "onboarding.cartaMock4", priceKey: "onboarding.cartaMock4Price", tipo: "plato" },
];

const K = {
  onboarding: {
    badge: "onboarding.cartaBadgeAi",
    heroTitle: "onboarding.cartaHeroTitle",
    heroSub: "onboarding.cartaHeroSub",
    benefitsIntro: "onboarding.cartaBenefitsIntro",
    b1: "onboarding.cartaBenefitPlates",
    b2: "onboarding.cartaBenefitPrices",
    b3: "onboarding.cartaBenefitCategories",
    b4: "onboarding.cartaBenefitDuplicates",
    controlTitle: "onboarding.cartaControlTitle",
    controlBody: "onboarding.cartaControlBody",
    mockTitle: "onboarding.cartaMockTitle",
    mockDemo: "onboarding.cartaMockDemo",
    mockCaption: "onboarding.cartaMockCaption",
    flowTitle: "onboarding.cartaFlowTitle",
    flow1: "onboarding.cartaFlow1",
    flow2: "onboarding.cartaFlow2",
    flow3: "onboarding.cartaFlow3",
    uploadKicker: "onboarding.cartaUploadKicker",
    dropLead: "onboarding.cartaDropLead",
    dropSecondary: "onboarding.cartaDropSecondary",
    formatsShort: "onboarding.cartaFormatsShort",
    formatsHint: "onboarding.cartaFormatsHint",
    wizardNav: "onboarding.cartaWizardNav",
    wizard1: "onboarding.cartaWizard1",
    wizard2: "onboarding.cartaWizard2",
    wizard3: "onboarding.cartaWizard3",
    wizard4: "onboarding.cartaWizard4",
    trustStrip: "onboarding.cartaTrustStrip",
    ctaPrimaryPick: "onboarding.cartaCtaPrimaryPick",
    ctaPrimaryHint: "onboarding.cartaCtaPrimaryHint",
    ctaSelect: "onboarding.cartaCtaSelect",
    ctaExample: "onboarding.cartaCtaExample",
    ctaAnalyze: "onboarding.cartaAnalyze",
    analyzing: "onboarding.cartaAnalyzing",
    ia0: "onboarding.cartaIaPhase0",
    ia1: "onboarding.cartaIaPhase1",
    ia2: "onboarding.cartaIaPhase2",
    ia3: "onboarding.cartaIaPhase3",
    loadingSub: "onboarding.cartaLoading",
    fileStrip: "onboarding.cartaFileStrip",
    changeFile: "onboarding.cartaChangeFile",
    clearFile: "onboarding.cartaClearFile",
  },
  dashboard: {
    badge: "cartaImport.premiumBadgeAi",
    heroTitle: "cartaImport.premiumHeroTitle",
    heroSub: "cartaImport.premiumHeroSub",
    benefitsIntro: "cartaImport.premiumBenefitsIntro",
    b1: "cartaImport.premiumBenefit1",
    b2: "cartaImport.premiumBenefit2",
    b3: "cartaImport.premiumBenefit3",
    b4: "cartaImport.premiumBenefit4",
    controlTitle: "cartaImport.premiumControlTitle",
    controlBody: "cartaImport.premiumControlBody",
    mockTitle: "cartaImport.premiumMockTitle",
    mockDemo: "cartaImport.premiumMockDemo",
    mockCaption: "cartaImport.premiumMockCaption",
    flowTitle: "cartaImport.premiumFlowTitle",
    flow1: "cartaImport.premiumFlow1",
    flow2: "cartaImport.premiumFlow2",
    flow3: "cartaImport.premiumFlow3",
    uploadKicker: "cartaImport.premiumUploadKicker",
    dropLead: "cartaImport.premiumDropLead",
    dropSecondary: "cartaImport.premiumDropSecondary",
    formatsShort: "cartaImport.premiumFormatsShort",
    formatsHint: "cartaImport.premiumFormatsHint",
    wizardNav: "cartaImport.premiumWizardNav",
    wizard1: "cartaImport.premiumWizard1",
    wizard2: "cartaImport.premiumWizard2",
    wizard3: "cartaImport.premiumWizard3",
    wizard4: "cartaImport.premiumWizard4",
    trustStrip: "cartaImport.premiumTrustStrip",
    ctaPrimaryPick: "cartaImport.premiumCtaPrimaryPick",
    ctaPrimaryHint: "cartaImport.premiumCtaPrimaryHint",
    ctaSelect: "cartaImport.premiumCtaSelect",
    ctaExample: "cartaImport.premiumCtaExample",
    ctaAnalyze: "cartaImport.premiumCtaAnalyze",
    analyzing: "cartaImport.premiumAnalyzing",
    ia0: "cartaImport.premiumIaPhase0",
    ia1: "cartaImport.premiumIaPhase1",
    ia2: "cartaImport.premiumIaPhase2",
    ia3: "cartaImport.premiumIaPhase3",
    loadingSub: "cartaImport.premiumLoadingSub",
    fileStrip: "cartaImport.premiumFileStrip",
    changeFile: "cartaImport.premiumChangeFile",
    clearFile: "cartaImport.premiumClearFile",
  },
} as const;

function CartaUploadHeroIconLarge({ compact }: { compact?: boolean }) {
  const s = compact ? 72 : 88;
  return (
    <svg width={s} height={s} viewBox="0 0 88 88" fill="none" aria-hidden>
      <defs>
        <linearGradient id="cihl" x1="12" y1="8" x2="76" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(251,191,36,0.35)" />
          <stop offset="1" stopColor="rgba(56,189,248,0.2)" />
        </linearGradient>
      </defs>
      <rect x="10" y="14" width="56" height="60" rx="8" stroke="url(#cihl)" strokeWidth="2" fill="rgba(15,23,42,0.5)" />
      <circle cx="38" cy="38" r="10" stroke="rgba(148,163,184,0.55)" strokeWidth="1.8" />
      <path d="M52 32l14 10v24H22V36l12-8 8 10 10-6z" fill="rgba(30,41,59,0.9)" stroke="rgba(251,191,36,0.45)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M22 58h44" stroke="rgba(148,163,184,0.35)" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="62" y="22" width="18" height="14" rx="3" fill="rgba(56,189,248,0.15)" stroke="rgba(56,189,248,0.55)" strokeWidth="1.2" />
      <circle cx="71" cy="29" r="3" fill="#fbbf24" opacity={0.95} />
    </svg>
  );
}

function CartaIaSpinner() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(251,191,36,0.18)" strokeWidth="3" />
      <circle cx="18" cy="18" r="14" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeDasharray="66 88">
        <animateTransform attributeName="transform" type="rotate" from="0 18 18" to="360 18 18" dur="0.72s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

const WIZARD_STEP_INDEXES = [1, 2, 3, 4] as const;

export type CartaImportWizardRailProps = {
  variant: "onboarding" | "dashboard";
  activeStep: 1 | 2 | 3 | 4;
  completedThrough: 0 | 1 | 2 | 3 | 4;
  step2Analyzing?: boolean;
  /** Menos altura (portátil horizontal / importar carta). */
  compact?: boolean;
};

/** Stepper compacto: subir → analizar → revisar → publicar (reutilizable en upload / review / done). */
export function CartaImportWizardRail({ variant, activeStep, completedThrough, step2Analyzing, compact }: CartaImportWizardRailProps) {
  const { t } = useI18n();
  const keys = K[variant];
  const labels = [keys.wizard1, keys.wizard2, keys.wizard3, keys.wizard4].map((k) => t(k));
  const c = Boolean(compact);

  return (
    <nav
      aria-label={t(keys.wizardNav)}
      style={{
        padding: c ? "6px 10px" : "11px 14px",
        borderRadius: c ? 11 : 14,
        border: "1px solid rgba(71, 85, 105, 0.55)",
        background: "linear-gradient(180deg, rgba(30, 41, 59, 0.72) 0%, rgba(15, 23, 42, 0.94) 100%)",
        boxShadow: c ? "0 6px 20px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.03)" : "0 12px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", width: "100%", gap: c ? "2px 0" : "6px 0" }}>
        {WIZARD_STEP_INDEXES.map((step, idx) => {
          const isDone = step <= completedThrough;
          const isCurrent = step === activeStep && !isDone;
          const showPulse = Boolean(step2Analyzing && step === 2 && isCurrent);
          const dot = c ? 22 : 28;
          const fs = c ? 10 : 12;

          const chip = (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: c ? 5 : 8,
                minWidth: 0,
                flexShrink: 0,
                maxWidth: "100%",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: dot,
                  height: dot,
                  borderRadius: c ? 7 : 9,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: fs,
                  fontWeight: 800,
                  border: isDone
                    ? "1px solid rgba(52, 211, 153, 0.45)"
                    : isCurrent
                      ? c
                        ? "1.5px solid rgba(251, 191, 36, 0.8)"
                        : "2px solid rgba(251, 191, 36, 0.75)"
                      : "1px solid rgba(71, 85, 105, 0.65)",
                  background: isDone
                    ? "rgba(6, 78, 59, 0.35)"
                    : isCurrent
                      ? "rgba(69, 26, 3, 0.45)"
                      : "rgba(15, 23, 42, 0.75)",
                  color: isDone ? "#6ee7b7" : isCurrent ? "#fde68a" : "#64748b",
                  boxShadow: showPulse ? "0 0 0 2px rgba(251,191,36,0.2)" : isCurrent ? "0 0 10px rgba(251,191,36,0.12)" : "none",
                }}
              >
                {isDone ? "✓" : step}
              </div>
              <span
                style={{
                  fontSize: c ? 10 : 11,
                  fontWeight: isCurrent ? 800 : 700,
                  color: isDone ? "#94a3b8" : isCurrent ? "#f1f5f9" : "#64748b",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {labels[idx]}
              </span>
            </div>
          );

          const connectorLeftDone = idx + 1 <= completedThrough;
          const connector = (
            <div
              style={{
                flex: "1 1 16px",
                height: 2,
                minWidth: c ? 6 : 10,
                margin: c ? "0 4px" : "0 6px",
                borderRadius: 1,
                background: connectorLeftDone
                  ? "linear-gradient(90deg, rgba(52,211,153,0.55), rgba(251,191,36,0.25))"
                  : "rgba(51, 65, 85, 0.55)",
              }}
              aria-hidden
            />
          );

          return (
            <div
              key={step}
              style={{ display: "flex", alignItems: "center", flex: idx < 3 ? (c ? "1 1 108px" : "1 1 140px") : "0 1 auto", minWidth: 0 }}
            >
              {chip}
              {idx < 3 ? connector : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

const cardShell: CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(71, 85, 105, 0.55)",
  background: "linear-gradient(165deg, rgba(30, 41, 59, 0.55) 0%, rgba(15, 23, 42, 0.92) 100%)",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.2), 0 20px 50px rgba(0,0,0,0.35)",
};

export type CartaImportPremiumLayoutProps = {
  variant: "onboarding" | "dashboard";
  accept: string;
  showPdfHint?: boolean;
  file: File | null;
  previewUrl: string | null;
  dragOver: boolean;
  busy: boolean;
  /** 0..1 progreso para el overlay de análisis (demo visual). */
  busyProgress?: number;
  iaPhaseIndex: number;
  wizardActiveStep: 1 | 2 | 3 | 4;
  wizardCompletedThrough: 0 | 1 | 2 | 3 | 4;
  fileRef: RefObject<HTMLInputElement | null>;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onOpenFileDialog: () => void;
  onAnalyze: () => void;
  onExample?: () => void;
  onClearFile?: () => void;
  showHero?: boolean;
  headerActions?: ReactNode;
  /** Menos altura vertical + sin minHeights agresivos (importar carta en portátil). */
  compactViewport?: boolean;
};

export default function CartaImportPremiumLayout({
  variant,
  accept,
  showPdfHint,
  file,
  previewUrl,
  dragOver,
  busy,
  busyProgress,
  iaPhaseIndex,
  fileRef,
  onFileInputChange,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenFileDialog,
  onAnalyze,
  onExample,
  onClearFile,
  showHero,
  headerActions,
  wizardActiveStep,
  wizardCompletedThrough,
  compactViewport,
}: CartaImportPremiumLayoutProps) {
  const { t } = useI18n();
  const keys = K[variant];
  const showHeroBlock = showHero ?? variant === "onboarding";
  const cv = Boolean(compactViewport);

  const iaKeys = useMemo(() => [keys.ia0, keys.ia1, keys.ia2, keys.ia3] as const, [keys]);
  const iaLabel = t(iaKeys[iaPhaseIndex % 4]);

  const benefits = useMemo(() => [keys.b1, keys.b2, keys.b3, keys.b4], [keys]);
  const p = Math.max(0, Math.min(1, busyProgress ?? 0));

  const fmtSize = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: cv ? 8 : 22,
        minHeight: cv ? 0 : undefined,
        flex: cv ? 1 : undefined,
        overflow: cv ? "hidden" : undefined,
      }}
    >
      {showHeroBlock ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            paddingBottom: 4,
            borderBottom: "1px solid rgba(51, 65, 85, 0.45)",
          }}
        >
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flex: "1 1 320px", minWidth: 0 }}>
            <div
              style={{
                flexShrink: 0,
                padding: "10px 14px",
                borderRadius: 12,
                background: "linear-gradient(145deg, rgba(251,191,36,0.2) 0%, rgba(56,189,248,0.12) 100%)",
                border: "1px solid rgba(251,191,36,0.42)",
                boxShadow: "0 0 24px rgba(251,191,36,0.12)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#fef3c7",
                lineHeight: 1.35,
                maxWidth: 200,
              }}
            >
              {t(keys.badge)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ margin: "0 0 10px 0", fontSize: 26, fontWeight: 800, color: "#f8fafc", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
                {t(keys.heroTitle)}
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: "#94a3b8", lineHeight: 1.5, maxWidth: 560 }}>{t(keys.heroSub)}</p>
            </div>
          </div>
          {headerActions ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{headerActions}</div> : null}
        </div>
      ) : null}

      <CartaImportWizardRail
        variant={variant}
        activeStep={wizardActiveStep}
        completedThrough={wizardCompletedThrough}
        step2Analyzing={busy && Boolean(file)}
        compact={cv}
      />

      <div
        style={{
          padding: cv ? "5px 10px" : "9px 14px",
          borderRadius: cv ? 10 : 12,
          border: "1px solid rgba(51, 65, 85, 0.5)",
          background: "rgba(15, 23, 42, 0.55)",
          fontSize: cv ? 10 : 11,
          fontWeight: 600,
          color: "#94a3b8",
          textAlign: "center",
          lineHeight: cv ? 1.4 : 1.5,
          letterSpacing: "0.01em",
          flexShrink: 0,
        }}
      >
        {t(keys.trustStrip)}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: cv ? 12 : 22,
          alignItems: cv ? "flex-start" : "stretch",
          minHeight: cv ? 0 : undefined,
          flex: cv ? 1 : undefined,
          overflow: cv ? "hidden" : undefined,
        }}
      >
        {/* Columna principal: subida */}
        <div style={{ flex: "1.5 1 340px", minWidth: 260, display: "flex", flexDirection: "column", gap: cv ? 8 : 12, minHeight: cv ? 0 : undefined }}>
          <div
            style={{
              ...cardShell,
              padding: 0,
              overflow: "hidden",
              border: "1px solid rgba(100, 116, 139, 0.38)",
              boxShadow: cv
                ? "0 0 0 1px rgba(0,0,0,0.12), 0 14px 36px rgba(0,0,0,0.32), 0 0 28px rgba(251,191,36,0.03)"
                : "0 0 0 1px rgba(0,0,0,0.15), 0 24px 56px rgba(0,0,0,0.4), 0 0 40px rgba(251,191,36,0.04)",
              minHeight: cv ? 0 : 460,
              flex: cv ? 1 : undefined,
              display: cv ? "flex" : undefined,
              flexDirection: cv ? "column" : undefined,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: cv ? 8 : 12,
                padding: cv ? "7px 12px" : "12px 18px",
                borderBottom: "1px solid rgba(51, 65, 85, 0.55)",
                background: "linear-gradient(90deg, rgba(251,191,36,0.08) 0%, transparent 55%)",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: cv ? 10 : 11,
                  fontWeight: 800,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: "#cbd5e1",
                }}
              >
                {t(keys.uploadKicker)}
              </span>
              {showPdfHint ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em" }}>PDF</span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em" }}>IMG</span>
              )}
            </div>

            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={(e) => {
                // Solo abrir picker si se hace click en el contenedor, no en botones/inputs internos.
                if (busy) return;
                if (e.target !== e.currentTarget) return;
                console.log("[UI] OPEN FILE PICKER");
                onOpenFileDialog();
              }}
              style={{
                position: "relative",
                margin: cv ? 10 : 16,
                flex: cv ? 1 : undefined,
                borderRadius: cv ? 12 : 14,
                border: dragOver ? "2px dashed rgba(251, 191, 36, 0.65)" : "2px dashed rgba(82, 96, 120, 0.55)",
                background: dragOver ? "rgba(251,191,36,0.06)" : "rgba(15, 23, 42, 0.55)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: cv ? "flex-start" : "center",
                gap: cv ? 10 : 16,
                padding: cv ? "14px 14px 12px" : "26px 20px 22px",
                boxSizing: "border-box",
                overflow: cv ? "auto" : undefined,
                minHeight: cv ? 200 : 368,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              <input ref={fileRef} type="file" accept={accept} style={{ display: "none" }} onChange={onFileInputChange} />

              <div
                style={{
                  width: cv ? 88 : 104,
                  height: cv ? 88 : 104,
                  borderRadius: cv ? 18 : 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(160deg, rgba(251,191,36,0.14) 0%, rgba(15,23,42,0.9) 55%, rgba(56,189,248,0.08) 100%)",
                  border: "1px solid rgba(251,191,36,0.32)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 32px rgba(0,0,0,0.25)",
                  flexShrink: 0,
                }}
              >
                <CartaUploadHeroIconLarge compact={cv} />
              </div>

              <div style={{ textAlign: "center", maxWidth: 360 }}>
                <p
                  style={{
                    margin: cv ? "0 0 4px 0" : "0 0 8px 0",
                    fontSize: cv ? 16 : 18,
                    fontWeight: 800,
                    color: "#f1f5f9",
                    lineHeight: 1.25,
                  }}
                >
                  {t(keys.dropLead)}
                </p>
                <p style={{ margin: 0, fontSize: cv ? 12 : 13, color: "#94a3b8", lineHeight: 1.4 }}>{t(keys.dropSecondary)}</p>
              </div>

              <div style={{ textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: cv ? 12 : 13, fontWeight: 800, color: "#fde68a", letterSpacing: "0.1em" }}>{t(keys.formatsShort)}</p>
                <p style={{ margin: cv ? "3px 0 0 0" : "6px 0 0 0", fontSize: cv ? 10 : 11, color: "#64748b", fontWeight: 600 }}>{t(keys.formatsHint)}</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: cv ? 5 : 8, width: "100%", maxWidth: 380 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("[UI] YELLOW BUTTON CLICK");
                    if (!file) {
                      console.log("[UI] OPEN FILE PICKER");
                      onOpenFileDialog();
                      return;
                    }
                    console.log("[UI] START AI ANALYSIS");
                    console.log("[UI] selected file:", file?.name || null);
                    onAnalyze();
                  }}
                  disabled={busy}
                  style={{
                    border: "none",
                    background: busy ? "rgba(71,85,105,0.45)" : "linear-gradient(180deg, rgba(251,191,36,1) 0%, rgba(217,119,6,0.95) 100%)",
                    color: busy ? "#64748b" : "#1c1917",
                    padding: cv ? "11px 22px" : "16px 32px",
                    borderRadius: cv ? 12 : 14,
                    fontWeight: 800,
                    fontSize: cv ? 14 : 15,
                    cursor: busy ? "not-allowed" : "pointer",
                    boxShadow: busy ? "none" : "0 14px 36px rgba(217,119,6,0.32)",
                    width: "100%",
                    maxWidth: 340,
                  }}
                >
                  {t(keys.ctaPrimaryPick)}
                </button>
                {!file && !busy ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: cv ? 10 : 11,
                      color: "#64748b",
                      fontWeight: 600,
                      textAlign: "center",
                      lineHeight: 1.4,
                      maxWidth: 320,
                    }}
                  >
                    {t(keys.ctaPrimaryHint)}
                  </p>
                ) : null}
              </div>

              {onExample ? (
                <button
                  type="button"
                  onClick={onExample}
                  disabled={busy}
                  style={{
                    border: "1px solid rgba(56,189,248,0.35)",
                    background: busy ? "transparent" : "rgba(8,47,73,0.35)",
                    color: busy ? "#64748b" : "#7dd3fc",
                    padding: cv ? "7px 14px" : "10px 20px",
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: cv ? 12 : 13,
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  {t(keys.ctaExample)}
                </button>
              ) : null}

              {file ? (
                <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: cv ? 8 : 12, marginTop: cv ? 2 : 4 }}>
                  <div
                    style={{
                      alignSelf: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(52, 211, 153, 0.25)",
                      background: "rgba(6, 78, 59, 0.16)",
                      color: "#a7f3d0",
                    }}
                  >
                    {t("cartaImport.fileReadyBadge")}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: cv ? 8 : 10,
                      padding: cv ? "8px 10px" : "12px 14px",
                      borderRadius: cv ? 10 : 12,
                      border: "1px solid rgba(251,191,36,0.35)",
                      background: "linear-gradient(90deg, rgba(69,26,3,0.45) 0%, rgba(15,23,42,0.75) 100%)",
                    }}
                  >
                    <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {t(keys.fileStrip)}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{fmtSize(file.size)}</div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          console.log("[UI] OPEN FILE PICKER");
                          onOpenFileDialog();
                        }}
                        disabled={busy}
                        style={{
                          border: "1px solid rgba(71,85,105,0.6)",
                          background: "rgba(15,23,42,0.6)",
                          color: "#e2e8f0",
                          padding: "8px 14px",
                          borderRadius: 9,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: busy ? "not-allowed" : "pointer",
                        }}
                      >
                        {t(keys.changeFile)}
                      </button>
                      {onClearFile ? (
                        <button
                          type="button"
                          onClick={onClearFile}
                          disabled={busy}
                          style={{
                            border: "1px solid rgba(248,113,113,0.35)",
                            background: "rgba(127,29,29,0.2)",
                            color: "#fecaca",
                            padding: "8px 14px",
                            borderRadius: 9,
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: busy ? "not-allowed" : "pointer",
                          }}
                        >
                          {t(keys.clearFile)}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt=""
                      style={{
                        maxHeight: cv ? 72 : 120,
                        borderRadius: 10,
                        border: "1px solid rgba(51,65,85,0.6)",
                        alignSelf: "center",
                      }}
                    />
                  ) : file.type === "application/pdf" ? (
                    <div
                      style={{
                        alignSelf: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#94a3b8",
                        padding: "10px 16px",
                        borderRadius: 10,
                        background: "rgba(15,23,42,0.65)",
                        border: "1px solid rgba(51,65,85,0.55)",
                      }}
                    >
                      PDF · {file.name}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // DEBUG temporal: asegurar que este es el botón real pulsado.
                      console.log("[UI] START AI ANALYSIS");
                      console.log("[UI] selected file before analysis:", file?.name || null);
                      onAnalyze();
                    }}
                    style={{
                      border: "none",
                      width: "100%",
                      background: busy ? "rgba(71,85,105,0.5)" : "linear-gradient(180deg, rgba(56,189,248,0.28) 0%, rgba(8,47,73,0.6) 100%)",
                      color: "#e0f2fe",
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "rgba(56,189,248,0.45)",
                      padding: cv ? "10px 16px" : "14px 20px",
                      borderRadius: cv ? 10 : 12,
                      fontWeight: 800,
                      fontSize: cv ? 14 : 15,
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    {busy ? t(keys.analyzing) : t(keys.ctaAnalyze)}
                  </button>
                  <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", lineHeight: 1.45 }}>
                    {t("cartaImport.fileReadyHint")}
                  </div>
                </div>
              ) : null}

              {busy ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 12,
                    background: "rgba(15, 23, 42, 0.9)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: cv ? 10 : 14,
                    padding: cv ? 16 : 24,
                    zIndex: 4,
                  }}
                >
                  <CartaIaSpinner />
                  <div style={{ width: "100%", maxWidth: 440 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: cv ? 13 : 15,
                        fontWeight: 900,
                        color: "#f1f5f9",
                        textAlign: "center",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {iaLabel}
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: cv ? 11 : 12, color: "#64748b", textAlign: "center" }}>{t(keys.loadingSub)}</p>
                    <div
                      style={{
                        marginTop: cv ? 10 : 12,
                        height: 10,
                        borderRadius: 999,
                        background: "rgba(51, 65, 85, 0.55)",
                        border: "1px solid rgba(71, 85, 105, 0.55)",
                        overflow: "hidden",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                      }}
                      aria-hidden
                    >
                      <div
                        style={{
                          width: `${Math.round(Math.max(0.02, p) * 100)}%`,
                          height: "100%",
                          background:
                            "linear-gradient(90deg, rgba(251,191,36,0.95) 0%, rgba(56,189,248,0.65) 55%, rgba(52,211,153,0.55) 100%)",
                          boxShadow: "0 0 24px rgba(251,191,36,0.15)",
                          transition: "width 220ms ease",
                        }}
                      />
                    </div>
                    <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {t(keys.wizard2)}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(Math.max(0.02, p) * 100)}%
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: cv ? 4 : 6 }}>
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 999,
                          background: i === iaPhaseIndex % 4 ? "#fbbf24" : "rgba(71,85,105,0.75)",
                          boxShadow: i === iaPhaseIndex % 4 ? "0 0 12px rgba(251,191,36,0.5)" : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Columna valor / confianza */}
        <div
          style={{
            flex: "0.95 1 300px",
            minWidth: 260,
            maxWidth: cv ? 400 : 440,
            display: "flex",
            flexDirection: "column",
            gap: cv ? 9 : 14,
            minHeight: cv ? 0 : undefined,
            maxHeight: cv ? "min(100%, calc(100dvh - 200px))" : undefined,
            overflow: cv ? "auto" : undefined,
          }}
        >
          <div style={{ ...cardShell, padding: cv ? "10px 12px 9px" : "16px 16px 14px", flexShrink: 0 }}>
            <p
              style={{
                margin: cv ? "0 0 7px 0" : "0 0 12px 0",
                fontSize: cv ? 11 : 12,
                fontWeight: 800,
                color: "#fde68a",
                letterSpacing: "0.04em",
              }}
            >
              {t(keys.benefitsIntro)}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: cv ? 5 : 8 }}>
              {benefits.map((bk) => (
                <div
                  key={bk}
                  style={{
                    display: "flex",
                    gap: cv ? 8 : 12,
                    alignItems: "flex-start",
                    padding: cv ? "6px 9px" : "11px 12px",
                    borderRadius: cv ? 10 : 12,
                    background: "rgba(15, 23, 42, 0.65)",
                    border: "1px solid rgba(51, 65, 85, 0.55)",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: cv ? 24 : 28,
                      height: cv ? 24 : 28,
                      borderRadius: cv ? 7 : 9,
                      background: "rgba(251,191,36,0.12)",
                      border: "1px solid rgba(251,191,36,0.35)",
                      color: "#fde68a",
                      fontSize: cv ? 11 : 13,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span style={{ fontSize: cv ? 12 : 13, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.35, paddingTop: 1 }}>{t(bk)}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              borderRadius: cv ? 11 : 14,
              padding: cv ? "9px 11px" : "14px 16px",
              border: "1px solid rgba(56, 189, 248, 0.28)",
              background: "linear-gradient(125deg, rgba(8, 47, 73, 0.4) 0%, rgba(15, 23, 42, 0.85) 100%)",
              boxShadow: "0 0 0 1px rgba(56,189,248,0.06)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", gap: cv ? 8 : 12, alignItems: "flex-start" }}>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: cv ? 17 : 20,
                  lineHeight: 1,
                  filter: "grayscale(0.2)",
                }}
                aria-hidden
              >
                🛡️
              </span>
              <div>
                <p style={{ margin: cv ? "0 0 3px 0" : "0 0 6px 0", fontSize: cv ? 13 : 14, fontWeight: 800, color: "#f0f9ff" }}>{t(keys.controlTitle)}</p>
                <p style={{ margin: 0, fontSize: cv ? 11 : 12, color: "#bae6fd", lineHeight: 1.4, fontWeight: 600 }}>{t(keys.controlBody)}</p>
              </div>
            </div>
          </div>

          <div style={{ ...cardShell, padding: cv ? "10px 12px 11px" : "14px 16px 16px", flex: cv ? undefined : 1, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: cv ? 8 : 12 }}>
              <span style={{ fontSize: cv ? 12 : 13, fontWeight: 800, color: "#f1f5f9" }}>{t(keys.mockTitle)}</span>
              <span style={{ fontSize: cv ? 8 : 9, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t(keys.mockDemo)}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: cv ? 5 : 8 }}>
              {CARTA_MOCK_PREVIEW.map((row) => (
                <div
                  key={row.nameKey}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "4px 8px",
                    padding: cv ? "6px 9px" : "10px 12px",
                    borderRadius: cv ? 9 : 11,
                    background: "rgba(15, 23, 42, 0.72)",
                    border: "1px solid rgba(51, 65, 85, 0.5)",
                  }}
                >
                  <span
                    style={{
                      fontSize: cv ? 12 : 14,
                      fontWeight: 700,
                      color: "#f8fafc",
                      flex: "1 1 120px",
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t(row.nameKey)}
                  </span>
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>—</span>
                  <span style={{ fontSize: cv ? 12 : 14, fontWeight: 800, color: "#fde68a", fontVariantNumeric: "tabular-nums" }}>{t(row.priceKey)}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: cv ? 8 : 9,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: cv ? "2px 6px" : "3px 8px",
                      borderRadius: 999,
                      background: "rgba(251,191,36,0.14)",
                      border: "1px solid rgba(251,191,36,0.32)",
                      color: "#fde68a",
                    }}
                  >
                    {t(TIPO_KEYS[row.tipo])}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ margin: cv ? "8px 0 0 0" : "12px 0 0 0", fontSize: cv ? 10 : 11, color: "#64748b", lineHeight: 1.35 }}>{t(keys.mockCaption)}</p>
          </div>

          <div
            style={{
              borderRadius: cv ? 11 : 14,
              padding: cv ? "9px 11px" : "14px 16px",
              border: "1px solid rgba(71, 85, 105, 0.5)",
              background: "rgba(15, 23, 42, 0.5)",
              flexShrink: 0,
            }}
          >
            <p
              style={{
                margin: cv ? "0 0 6px 0" : "0 0 10px 0",
                fontSize: cv ? 10 : 11,
                fontWeight: 800,
                color: "#94a3b8",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {t(keys.flowTitle)}
            </p>
            <ol style={{ margin: 0, paddingLeft: 16, color: "#cbd5e1", fontSize: cv ? 11 : 12, fontWeight: 600, lineHeight: 1.45 }}>
              <li style={{ marginBottom: cv ? 3 : 6 }}>{t(keys.flow1)}</li>
              <li style={{ marginBottom: cv ? 3 : 6 }}>{t(keys.flow2)}</li>
              <li>{t(keys.flow3)}</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
