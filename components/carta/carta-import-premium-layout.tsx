"use client";

import type { ChangeEvent, CSSProperties, DragEvent, ReactNode, RefObject } from "react";
import { useLayoutEffect, useMemo, useState } from "react";
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

function CartaUploadHeroIconLarge({ compact, ice }: { compact?: boolean; ice?: boolean }) {
  const s = compact ? 72 : 88;
  if (ice) {
    return (
      <svg width={s} height={s} viewBox="0 0 88 88" fill="none" aria-hidden>
        <rect
          x="10"
          y="14"
          width="56"
          height="60"
          rx="8"
          stroke="var(--hostly-table-divider-soft)"
          strokeWidth="1.75"
          fill="color-mix(in srgb, var(--hostly-info-soft) 88%, white)"
        />
        <circle cx="38" cy="38" r="10" stroke="color-mix(in srgb, var(--hostly-accent) 35%, var(--hostly-table-divider-soft))" strokeWidth="1.65" />
        <path
          d="M52 32l14 10v24H22V36l12-8 8 10 10-6z"
          fill="var(--hostly-table-head-surface)"
          stroke="color-mix(in srgb, var(--hostly-accent) 55%, transparent)"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
        <path d="M22 58h44" stroke="var(--hostly-table-divider-faint)" strokeWidth="1.15" strokeLinecap="round" />
        <rect
          x="62"
          y="22"
          width="18"
          height="14"
          rx="3"
          fill="color-mix(in srgb, var(--hostly-accent-soft) 92%, transparent)"
          stroke="color-mix(in srgb, var(--hostly-accent) 28%, var(--hostly-table-divider-soft))"
          strokeWidth="1.1"
        />
        <circle cx="71" cy="29" r="3" fill="var(--hostly-accent)" opacity={0.88} />
      </svg>
    );
  }
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

function CartaIaSpinner({ ice }: { ice?: boolean }) {
  const track = ice ? "color-mix(in srgb, var(--hostly-table-divider-soft) 35%, transparent)" : "rgba(251,191,36,0.18)";
  const arc = ice ? "var(--hostly-accent)" : "#fbbf24";
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r="14" fill="none" stroke={track} strokeWidth="3" />
      <circle cx="18" cy="18" r="14" fill="none" stroke={arc} strokeWidth="3" strokeLinecap="round" strokeDasharray="66 88">
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
  const ice = variant === "onboarding";

  return (
    <nav
      aria-label={t(keys.wizardNav)}
      style={{
        padding: ice ? (c ? "4px 5px" : "5px 7px") : c ? "6px 10px" : "11px 14px",
        borderRadius: ice ? (c ? 10 : 12) : c ? 11 : 14,
        border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(71, 85, 105, 0.55)",
        background: ice
          ? "color-mix(in srgb, var(--hostly-table-head-surface) 92%, transparent)"
          : "linear-gradient(180deg, rgba(30, 41, 59, 0.72) 0%, rgba(15, 23, 42, 0.94) 100%)",
        boxShadow: ice ? "var(--hostly-shadow-hairline)" : c ? "0 6px 20px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.03)" : "0 12px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "stretch",
          width: "100%",
          gap: ice ? "0px" : c ? "2px 0" : "6px 0",
          borderRadius: ice ? (c ? 8 : 9) : undefined,
          overflow: ice ? "hidden" : undefined,
          background: ice ? "var(--hostly-surface-card-solid)" : undefined,
          border: ice ? "1px solid var(--hostly-table-divider-faint)" : undefined,
        }}
      >
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
                  borderRadius: ice ? (c ? 7 : 8) : c ? 7 : 9,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: fs,
                  fontWeight: ice ? 750 : 800,
                  border: ice
                    ? isDone
                      ? "1px solid color-mix(in srgb, var(--hostly-accent) 22%, transparent)"
                      : isCurrent
                        ? "1px solid color-mix(in srgb, var(--hostly-accent) 42%, var(--hostly-table-divider-soft))"
                        : "1px solid var(--hostly-table-divider-soft)"
                    : isDone
                      ? "1px solid rgba(52, 211, 153, 0.45)"
                      : isCurrent
                        ? c
                          ? "1.5px solid rgba(251, 191, 36, 0.8)"
                          : "2px solid rgba(251, 191, 36, 0.75)"
                        : "1px solid rgba(71, 85, 105, 0.65)",
                  background: ice
                    ? isDone
                      ? "var(--hostly-success-soft)"
                      : isCurrent
                        ? "var(--hostly-info-soft)"
                        : "var(--hostly-table-head-surface)"
                    : isDone
                      ? "rgba(6, 78, 59, 0.35)"
                      : isCurrent
                        ? "rgba(69, 26, 3, 0.45)"
                        : "rgba(15, 23, 42, 0.75)",
                  color: ice
                    ? isDone
                      ? "color-mix(in srgb, var(--hostly-accent) 88%, var(--hostly-navy-deep))"
                      : isCurrent
                        ? "var(--hostly-navy-deep)"
                        : "var(--hostly-ink-muted)"
                    : isDone
                      ? "#6ee7b7"
                      : isCurrent
                        ? "#fde68a"
                        : "#64748b",
                  boxShadow: ice
                    ? showPulse
                      ? "0 0 0 2px color-mix(in srgb, var(--hostly-accent-soft) 90%, transparent)"
                      : "none"
                    : showPulse
                      ? "0 0 0 2px rgba(251,191,36,0.2)"
                      : isCurrent
                        ? "0 0 10px rgba(251,191,36,0.12)"
                        : "none",
                }}
              >
                {isDone ? "✓" : step}
              </div>
              <span
                style={{
                  fontSize: c ? 10 : 11,
                  fontWeight: ice ? (isCurrent ? 700 : 620) : isCurrent ? 800 : 700,
                  color: ice
                    ? isDone
                      ? "var(--hostly-ink-muted)"
                      : isCurrent
                        ? "var(--hostly-ink-strong)"
                        : "var(--hostly-ink-soft)"
                    : isDone
                      ? "#94a3b8"
                      : isCurrent
                        ? "#f1f5f9"
                        : "#64748b",
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
                height: ice ? 1 : 2,
                minWidth: ice ? 4 : c ? 6 : 10,
                margin: ice ? "0 2px" : c ? "0 4px" : "0 6px",
                borderRadius: 1,
                background: connectorLeftDone
                  ? ice
                    ? "linear-gradient(90deg, color-mix(in srgb, var(--hostly-accent) 38%, transparent), color-mix(in srgb, var(--hostly-accent) 12%, transparent))"
                    : "linear-gradient(90deg, rgba(52,211,153,0.55), rgba(251,191,36,0.25))"
                  : ice
                    ? "var(--hostly-table-divider-faint)"
                    : "rgba(51, 65, 85, 0.55)",
              }}
              aria-hidden
            />
          );

          return (
            <div
              key={step}
              style={{
                display: "flex",
                alignItems: "center",
                flex: idx < 3 ? (ice ? "1 1 0%" : c ? "1 1 108px" : "1 1 140px") : "0 1 auto",
                minWidth: 0,
                padding: ice ? (c ? "5px 3px 5px 5px" : "7px 4px 7px 8px") : undefined,
                borderRight: ice && idx < 3 ? "1px solid var(--hostly-table-divider-faint)" : undefined,
              }}
            >
              {chip}
              {!ice && idx < 3 ? connector : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/** Superficie tipo “ice” alineada Hostly (solo layout visual). */
const cardShellLight: CSSProperties = {
  borderRadius: 14,
  border: "1px solid var(--hostly-table-divider-soft)",
  background: "var(--hostly-surface-card-solid)",
  boxShadow: "var(--hostly-shadow-hairline)",
};

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
  /** Tras análisis OK: productos detectados (onboarding). */
  analyzeResultCount?: number;
  /** Ir a pantalla de revisión del catálogo. */
  onGoReviewCatalog?: () => void;
  /** Error de análisis visible + reintento. */
  analyzeError?: string | null;
  onRetryAnalyze?: () => void;
  /** Sin productos tras validación OCR/IA. */
  noProductsDetected?: boolean;
  onUploadAnother?: () => void;
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
  analyzeResultCount,
  onGoReviewCatalog,
  analyzeError,
  onRetryAnalyze,
  noProductsDetected,
  onUploadAnother,
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
  const ice = variant === "onboarding";
  const shell = ice ? cardShellLight : cardShell;
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobileLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  /** Onboarding en móvil: apilado + scroll de página. En desktop onboarding: sin overflow interno que recorte. */
  const mIce = ice && isMobileLayout;
  const iceScroll = ice;

  const iaKeys = useMemo(() => [keys.ia0, keys.ia1, keys.ia2, keys.ia3] as const, [keys]);
  const iaLabel = t(iaKeys[iaPhaseIndex % 4]);
  const hasAnalyzeResult = Boolean(analyzeResultCount != null && analyzeResultCount > 0);
  const showAnalyzeCta = Boolean(file && !busy && !hasAnalyzeResult);

  const benefits = useMemo(() => [keys.b1, keys.b2, keys.b3, keys.b4], [keys]);
  const p = Math.max(0, Math.min(1, busyProgress ?? 0));

  const fmtSize = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={iceScroll ? "onboarding-scroll-content max-w-full pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: cv ? 8 : ice ? 13 : 22,
        minHeight: cv ? 0 : iceScroll ? undefined : undefined,
        flex: cv ? 1 : iceScroll ? undefined : undefined,
        overflow: cv ? "hidden" : iceScroll ? "visible" : undefined,
      }}
    >
      {showHeroBlock ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: ice ? 12 : 16,
            paddingBottom: ice ? 6 : 4,
            borderBottom: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(51, 65, 85, 0.45)",
          }}
        >
          <div style={{ display: "flex", gap: ice ? 14 : 16, alignItems: "flex-start", flex: ice ? "1 1 360px" : "1 1 320px", minWidth: 0 }}>
            <div
              style={
                ice
                  ? {
                      flexShrink: 0,
                      padding: "8px 12px",
                      borderRadius: 10,
                      background: "var(--hostly-info-soft)",
                      border: "1px solid color-mix(in srgb, var(--hostly-accent) 18%, var(--hostly-table-divider-soft))",
                      boxShadow: "var(--hostly-shadow-hairline)",
                      fontSize: 10,
                      fontWeight: 750,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--hostly-navy-deep)",
                      lineHeight: 1.35,
                      maxWidth: 220,
                    }
                  : {
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
                    }
              }
            >
              {t(keys.badge)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                style={{
                  margin: ice ? "0 0 6px 0" : "0 0 10px 0",
                  fontSize: ice ? 21 : 26,
                  fontWeight: ice ? 750 : 800,
                  color: ice ? "var(--hostly-ink-strong)" : "#f8fafc",
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                }}
              >
                {t(keys.heroTitle)}
              </h2>
              <p style={{ margin: 0, fontSize: ice ? 13 : 14, color: ice ? "var(--hostly-ink-muted)" : "#94a3b8", lineHeight: 1.5, maxWidth: ice ? 720 : 560 }}>
                {t(keys.heroSub)}
              </p>
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

      {ice && !busy ? (
        <p
          style={{
            margin: 0,
            fontSize: 10,
            lineHeight: 1.42,
            color: "var(--hostly-ink-muted)",
            fontWeight: 605,
            textAlign: "center",
            letterSpacing: "0.02em",
          }}
        >
          {t("onboarding.cartaAssistIdleMicro")}
        </p>
      ) : null}

      <div
        style={{
          padding: cv ? "5px 10px" : ice ? "7px 12px" : "9px 14px",
          borderRadius: cv ? 10 : ice ? 11 : 12,
          border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(51, 65, 85, 0.5)",
          background: ice ? "color-mix(in srgb, var(--hostly-success-soft) 28%, transparent)" : "rgba(15, 23, 42, 0.55)",
          fontSize: cv ? 10 : 11,
          fontWeight: 600,
          color: ice ? "var(--hostly-ink-muted)" : "#94a3b8",
          textAlign: "center",
          lineHeight: cv ? 1.4 : 1.45,
          letterSpacing: "0.01em",
          flexShrink: 0,
          boxShadow: ice ? "var(--hostly-shadow-hairline)" : undefined,
        }}
      >
        {t(keys.trustStrip)}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: mIce ? "column" : undefined,
          flexWrap: "wrap",
          gap: cv ? 12 : ice ? 14 : 22,
          alignItems: cv ? "flex-start" : mIce ? "stretch" : "stretch",
          minHeight: cv ? 0 : iceScroll ? undefined : undefined,
          flex: cv ? 1 : iceScroll ? undefined : undefined,
          overflow: cv ? "hidden" : iceScroll ? "visible" : undefined,
          width: mIce ? "100%" : undefined,
          maxWidth: mIce ? "100%" : undefined,
        }}
      >
        {/* Columna principal: subida */}
        <div
          style={{
            flex: mIce ? "1 1 auto" : ice ? "2.1 1 400px" : "1.5 1 340px",
            minWidth: mIce ? 0 : ice ? 240 : 260,
            width: mIce ? "100%" : undefined,
            maxWidth: mIce ? "100%" : undefined,
            display: "flex",
            flexDirection: "column",
            gap: cv ? 8 : ice ? 10 : 12,
            minHeight: cv ? 0 : mIce ? undefined : undefined,
          }}
        >
          <div
            style={{
              ...shell,
              padding: 0,
              overflow: iceScroll ? "visible" : "hidden",
              border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(100, 116, 139, 0.38)",
              boxShadow: ice
                ? "var(--hostly-shadow-hairline)"
                : cv
                  ? "0 0 0 1px rgba(0,0,0,0.12), 0 14px 36px rgba(0,0,0,0.32), 0 0 28px rgba(251,191,36,0.03)"
                  : "0 0 0 1px rgba(0,0,0,0.15), 0 24px 56px rgba(0,0,0,0.4), 0 0 40px rgba(251,191,36,0.04)",
              minHeight: iceScroll ? undefined : cv ? 0 : 460,
              flex: cv ? 1 : iceScroll ? undefined : undefined,
              display: cv ? "flex" : iceScroll ? undefined : undefined,
              flexDirection: cv ? "column" : iceScroll ? undefined : undefined,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: cv ? 8 : 12,
                padding: cv ? "7px 12px" : ice ? "9px 14px" : "12px 18px",
                borderBottom: ice ? "1px solid var(--hostly-table-divider-faint)" : "1px solid rgba(51, 65, 85, 0.55)",
                background: ice ? "color-mix(in srgb, var(--hostly-table-head-surface) 86%, transparent)" : "linear-gradient(90deg, rgba(251,191,36,0.08) 0%, transparent 55%)",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: cv ? 10 : 11,
                  fontWeight: ice ? 750 : 800,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: ice ? "var(--hostly-ink-muted)" : "#cbd5e1",
                }}
              >
                {t(keys.uploadKicker)}
              </span>
              {showPdfHint ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: ice ? "var(--hostly-ink-faint)" : "#64748b", letterSpacing: "0.04em" }}>PDF</span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, color: ice ? "var(--hostly-ink-faint)" : "#64748b", letterSpacing: "0.04em" }}>IMG</span>
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
                margin: cv ? 10 : ice ? 12 : 16,
                flex: cv ? 1 : undefined,
                borderRadius: cv ? 12 : 13,
                border: dragOver
                  ? ice
                    ? "2px dashed color-mix(in srgb, var(--hostly-accent) 52%, transparent)"
                    : "2px dashed rgba(251, 191, 36, 0.65)"
                  : ice
                    ? "1px dashed var(--hostly-table-divider-soft)"
                    : "2px dashed rgba(82, 96, 120, 0.55)",
                background: dragOver
                  ? ice
                    ? "color-mix(in srgb, var(--hostly-accent-soft) 72%, transparent)"
                    : "rgba(251,191,36,0.06)"
                  : ice
                    ? "color-mix(in srgb, var(--hostly-info-soft) 55%, transparent)"
                    : "rgba(15, 23, 42, 0.55)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: cv ? "flex-start" : ice ? "flex-start" : "center",
                gap: cv ? 10 : ice ? 12 : 16,
                padding: cv ? "14px 14px 12px" : ice ? "22px 18px 18px" : "26px 20px 22px",
                boxSizing: "border-box",
                overflow: cv ? "auto" : iceScroll ? "visible" : undefined,
                minHeight: iceScroll ? undefined : cv ? 200 : 368,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              <input ref={fileRef} type="file" accept={accept} style={{ display: "none" }} onChange={onFileInputChange} />

              <div
                style={{
                  width: cv ? 88 : 104,
                  height: cv ? 88 : 104,
                  borderRadius: cv ? 18 : 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: ice
                    ? "var(--hostly-info-soft)"
                    : "linear-gradient(160deg, rgba(251,191,36,0.14) 0%, rgba(15,23,42,0.9) 55%, rgba(56,189,248,0.08) 100%)",
                  border: ice ? "1px solid color-mix(in srgb, var(--hostly-accent) 16%, var(--hostly-table-divider-soft))" : "1px solid rgba(251,191,36,0.32)",
                  boxShadow: ice ? "var(--hostly-shadow-hairline)" : "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 32px rgba(0,0,0,0.25)",
                  flexShrink: 0,
                }}
              >
                <CartaUploadHeroIconLarge compact={cv} ice={ice} />
              </div>

              <div style={{ textAlign: "center", maxWidth: ice ? 560 : 360 }}>
                <p
                  style={{
                    margin: cv ? "0 0 4px 0" : ice ? "0 0 5px 0" : "0 0 8px 0",
                    fontSize: cv ? 16 : ice ? 17 : 18,
                    fontWeight: ice ? 750 : 800,
                    color: ice ? "var(--hostly-ink-strong)" : "#f1f5f9",
                    lineHeight: 1.25,
                  }}
                >
                  {t(keys.dropLead)}
                </p>
                <p style={{ margin: 0, fontSize: cv ? 12 : 13, color: ice ? "var(--hostly-ink-muted)" : "#94a3b8", lineHeight: 1.4 }}>
                  {t(keys.dropSecondary)}
                </p>
              </div>

              <div style={{ textAlign: "center" }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: cv ? 12 : 13,
                    fontWeight: 750,
                    color: ice ? "var(--hostly-accent)" : "#fde68a",
                    letterSpacing: "0.08em",
                  }}
                >
                  {t(keys.formatsShort)}
                </p>
                <p style={{ margin: cv ? "3px 0 0 0" : "6px 0 0 0", fontSize: cv ? 10 : 11, color: ice ? "var(--hostly-ink-faint)" : "#64748b", fontWeight: 600 }}>
                  {t(keys.formatsHint)}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: cv ? 5 : 8, width: "100%", maxWidth: ice ? 480 : 380 }}>
                {hasAnalyzeResult && onGoReviewCatalog ? (
                  <div
                    style={{
                      width: "100%",
                      maxWidth: ice ? "min(520px, 100%)" : 440,
                      display: "flex",
                      flexDirection: "column",
                      gap: cv ? 8 : 10,
                      padding: cv ? "10px 12px" : "12px 14px",
                      borderRadius: ice ? 12 : 13,
                      border: ice ? "1px solid color-mix(in srgb, var(--hostly-accent) 22%, var(--hostly-table-divider-soft))" : "1px solid rgba(52, 211, 153, 0.35)",
                      background: ice ? "var(--hostly-success-soft)" : "rgba(6, 78, 59, 0.22)",
                      boxShadow: ice ? "var(--hostly-shadow-hairline)" : undefined,
                    }}
                  >
                    <p style={{ margin: 0, fontSize: cv ? 14 : 15, fontWeight: ice ? 760 : 800, color: ice ? "var(--hostly-navy-deep)" : "#ecfdf5", lineHeight: 1.35 }}>
                      {t("onboarding.catalogCount", { n: String(analyzeResultCount) })}
                    </p>
                    <p style={{ margin: 0, fontSize: cv ? 11 : 12, color: ice ? "var(--hostly-ink-muted)" : "#94a3b8", lineHeight: 1.45 }}>
                      {t(keys.mockCaption)}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onGoReviewCatalog();
                      }}
                      style={{
                        border: ice ? "1px solid color-mix(in srgb, var(--hostly-accent) 22%, transparent)" : "none",
                        background: ice ? "var(--hostly-accent)" : "linear-gradient(180deg, rgba(251,191,36,1) 0%, rgba(217,119,6,0.95) 100%)",
                        color: ice ? "var(--hostly-navy-deep)" : "#1c1917",
                        padding: cv ? "11px 18px" : "13px 22px",
                        borderRadius: ice ? 12 : 14,
                        fontWeight: ice ? 750 : 800,
                        fontSize: cv ? 14 : 15,
                        cursor: "pointer",
                        width: "100%",
                        boxShadow: ice ? "var(--hostly-shadow-hairline)" : "0 14px 36px rgba(217,119,6,0.32)",
                      }}
                    >
                      {t("onboarding.catalogTitle")}
                    </button>
                  </div>
                ) : (
                  <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!file) {
                      onOpenFileDialog();
                      return;
                    }
                    onAnalyze();
                  }}
                  disabled={busy || (Boolean(file) && !showAnalyzeCta)}
                  style={{
                    border: busy ? undefined : ice ? "1px solid color-mix(in srgb, var(--hostly-accent) 22%, transparent)" : "none",
                    background: busy
                      ? ice
                        ? "var(--hostly-table-head-surface)"
                        : "rgba(71,85,105,0.45)"
                      : ice
                        ? "var(--hostly-accent)"
                        : "linear-gradient(180deg, rgba(251,191,36,1) 0%, rgba(217,119,6,0.95) 100%)",
                    color: busy ? (ice ? "var(--hostly-ink-muted)" : "#64748b") : ice ? "var(--hostly-navy-deep)" : "#1c1917",
                    padding: cv ? "11px 22px" : ice ? "13px 26px" : "16px 32px",
                    borderRadius: cv ? 11 : ice ? 12 : 14,
                    fontWeight: ice ? 750 : 800,
                    fontSize: cv ? 14 : 15,
                    cursor: busy ? "not-allowed" : "pointer",
                    boxShadow: busy ? "none" : ice ? "var(--hostly-shadow-hairline)" : "0 14px 36px rgba(217,119,6,0.32)",
                    width: "100%",
                    maxWidth: ice ? "min(440px, 100%)" : 340,
                  }}
                >
                  {busy ? t(keys.analyzing) : file ? t(keys.ctaAnalyze) : t(keys.ctaPrimaryPick)}
                </button>
                {!file && !busy ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: cv ? 10 : 11,
                      color: ice ? "var(--hostly-ink-muted)" : "#64748b",
                      fontWeight: 600,
                      textAlign: "center",
                      lineHeight: 1.4,
                      maxWidth: ice ? 400 : 320,
                    }}
                  >
                    {t(keys.ctaPrimaryHint)}
                  </p>
                ) : null}
                  </>
                )}
              </div>

              {onExample ? (
                <button
                  type="button"
                  onClick={onExample}
                  disabled={busy}
                  style={{
                    border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(56,189,248,0.35)",
                    background: busy ? "transparent" : ice ? "var(--hostly-table-head-surface)" : "rgba(8,47,73,0.35)",
                    color: busy ? (ice ? "var(--hostly-ink-muted)" : "#64748b") : ice ? "var(--hostly-accent)" : "#7dd3fc",
                    padding: cv ? "7px 14px" : "10px 20px",
                    borderRadius: ice ? 10 : 10,
                    fontWeight: 700,
                    fontSize: cv ? 12 : 13,
                    cursor: busy ? "not-allowed" : "pointer",
                    boxShadow: ice ? "var(--hostly-shadow-hairline)" : undefined,
                  }}
                >
                  {t(keys.ctaExample)}
                </button>
              ) : null}

              {file ? (
                <div style={{ width: "100%", maxWidth: ice ? "min(100%,520px)" : 400, display: "flex", flexDirection: "column", gap: cv ? 8 : 12, marginTop: cv ? 2 : 4 }}>
                  <div
                    style={{
                      alignSelf: "center",
                      fontSize: 11,
                      fontWeight: ice ? 750 : 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: ice ? "1px solid color-mix(in srgb, var(--hostly-accent) 18%, transparent)" : "1px solid rgba(52, 211, 153, 0.25)",
                      background: ice ? "var(--hostly-success-soft)" : "rgba(6, 78, 59, 0.16)",
                      color: ice ? "color-mix(in srgb, var(--hostly-accent) 75%, var(--hostly-navy-deep))" : "#a7f3d0",
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
                      borderRadius: cv ? 10 : ice ? 11 : 12,
                      border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(251,191,36,0.35)",
                      background: ice ? "var(--hostly-info-soft)" : "linear-gradient(90deg, rgba(69,26,3,0.45) 0%, rgba(15,23,42,0.75) 100%)",
                      boxShadow: ice ? "var(--hostly-shadow-hairline)" : undefined,
                    }}
                  >
                    <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: ice ? "var(--hostly-ink-faint)" : "#64748b",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        {t(keys.fileStrip)}
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: ice ? "var(--hostly-ink-strong)" : "#f1f5f9",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {file.name}
                      </div>
                      <div style={{ fontSize: 11, color: ice ? "var(--hostly-ink-muted)" : "#94a3b8", marginTop: 2 }}>{fmtSize(file.size)}</div>
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
                          border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(71,85,105,0.6)",
                          background: ice ? "var(--hostly-table-head-surface)" : "rgba(15,23,42,0.6)",
                          color: ice ? "var(--hostly-accent)" : "#e2e8f0",
                          padding: "8px 14px",
                          borderRadius: ice ? 9 : 9,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: busy ? "not-allowed" : "pointer",
                          boxShadow: ice ? "var(--hostly-shadow-hairline)" : undefined,
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
                            border: "1px solid color-mix(in srgb, #b42318 25%, transparent)",
                            background: "color-mix(in srgb, #fef2f2 94%, transparent)",
                            color: "#b42318",
                            padding: "8px 14px",
                            borderRadius: 9,
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: busy ? "not-allowed" : "pointer",
                            boxShadow: ice ? "var(--hostly-shadow-hairline)" : undefined,
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
                        border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(51,65,85,0.6)",
                        alignSelf: "center",
                      }}
                    />
                  ) : file.type === "application/pdf" ? (
                    <div
                      style={{
                        alignSelf: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: ice ? "var(--hostly-ink-muted)" : "#94a3b8",
                        padding: "10px 16px",
                        borderRadius: 10,
                        background: ice ? "var(--hostly-info-soft)" : "rgba(15,23,42,0.65)",
                        border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(51,65,85,0.55)",
                      }}
                    >
                      PDF · {file.name}
                    </div>
                  ) : null}
                  {analyzeError && onRetryAnalyze && !noProductsDetected ? (
                    <div
                      style={{
                        width: "100%",
                        padding: cv ? "10px 12px" : "12px 14px",
                        borderRadius: 10,
                        border: "1px solid color-mix(in srgb, #b42318 28%, transparent)",
                        background: "color-mix(in srgb, #fef2f2 92%, transparent)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 650, color: "#b42318", lineHeight: 1.45 }}>{analyzeError}</p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRetryAnalyze();
                        }}
                        style={{
                          alignSelf: "flex-start",
                          border: "1px solid color-mix(in srgb, #b42318 22%, transparent)",
                          background: "var(--hostly-surface-card-solid)",
                          color: "#b42318",
                          padding: "8px 14px",
                          borderRadius: 9,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: busy ? "not-allowed" : "pointer",
                        }}
                      >
                        {t(keys.ctaAnalyze)}
                      </button>
                    </div>
                  ) : null}
                  {noProductsDetected ? (
                    <div
                      style={{
                        width: "100%",
                        padding: cv ? "12px 14px" : "14px 16px",
                        borderRadius: 11,
                        border: "1px solid color-mix(in srgb, #b45309 24%, transparent)",
                        background: "color-mix(in srgb, #fffbeb 92%, transparent)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 720, color: "#92400e", lineHeight: 1.4 }}>
                        {t("cartaImport.noProductsDetectedTitle")}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 560, color: "#a16207", lineHeight: 1.45 }}>
                        {t("cartaImport.noProductsDetectedSub")}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {onUploadAnother ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onUploadAnother();
                            }}
                            style={{
                              border: "1px solid color-mix(in srgb, var(--hostly-accent) 22%, transparent)",
                              background: ice ? "var(--hostly-accent)" : "rgba(251,191,36,0.95)",
                              color: ice ? "var(--hostly-navy-deep)" : "#1c1917",
                              padding: "9px 16px",
                              borderRadius: 10,
                              fontWeight: 750,
                              fontSize: 12,
                              cursor: busy ? "not-allowed" : "pointer",
                            }}
                          >
                            {t("cartaImport.uploadAnotherFile")}
                          </button>
                        ) : null}
                        {onRetryAnalyze ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onRetryAnalyze();
                            }}
                            style={{
                              border: "1px solid var(--hostly-table-divider-soft)",
                              background: "var(--hostly-surface-card-solid)",
                              color: "var(--hostly-ink-muted)",
                              padding: "9px 14px",
                              borderRadius: 10,
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: busy ? "not-allowed" : "pointer",
                            }}
                          >
                            {t(keys.ctaAnalyze)}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {showAnalyzeCta ? (
                    <div style={{ fontSize: 11, color: ice ? "var(--hostly-ink-muted)" : "#94a3b8", textAlign: "center", lineHeight: 1.45, width: "100%" }}>
                      {t("cartaImport.fileReadyHint")}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {busy ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 12,
                    background: ice
                      ? "color-mix(in srgb, var(--hostly-surface-card-solid) 94%, transparent)"
                      : "rgba(15, 23, 42, 0.9)",
                    backdropFilter: ice ? "none" : "blur(10px)",
                    WebkitBackdropFilter: ice ? "none" : "blur(10px)",
                    border: ice ? "1px solid var(--hostly-table-divider-faint)" : undefined,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: cv ? 10 : 14,
                    padding: cv ? 16 : 24,
                    zIndex: 4,
                  }}
                >
                  <CartaIaSpinner ice={ice} />
                  <div style={{ width: "100%", maxWidth: 460 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: cv ? 13 : 15,
                        fontWeight: ice ? 760 : 900,
                        color: ice ? "var(--hostly-ink-strong)" : "#f1f5f9",
                        textAlign: "center",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {iaLabel}
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: cv ? 11 : 12, color: ice ? "var(--hostly-ink-muted)" : "#64748b", textAlign: "center" }}>
                      {t(keys.loadingSub)}
                    </p>
                    <div
                      style={{
                        marginTop: cv ? 10 : 12,
                        height: 9,
                        borderRadius: 999,
                        background: ice ? "var(--hostly-table-head-surface)" : "rgba(51, 65, 85, 0.55)",
                        border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(71, 85, 105, 0.55)",
                        overflow: "hidden",
                        boxShadow: ice ? "var(--hostly-shadow-hairline)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                      }}
                      aria-hidden
                    >
                      <div
                        style={{
                          width: `${Math.round(Math.max(0.02, p) * 100)}%`,
                          height: "100%",
                          background: ice
                            ? "linear-gradient(90deg, color-mix(in srgb, var(--hostly-accent) 65%, transparent), color-mix(in srgb, var(--hostly-accent) 22%, transparent))"
                            : "linear-gradient(90deg, rgba(251,191,36,0.95) 0%, rgba(56,189,248,0.65) 55%, rgba(52,211,153,0.55) 100%)",
                          boxShadow: ice ? "none" : "0 0 24px rgba(251,191,36,0.15)",
                          transition: "width 220ms ease",
                        }}
                      />
                    </div>
                    <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 750,
                          color: ice ? "var(--hostly-ink-muted)" : "#64748b",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        {t(keys.wizard2)}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 750, color: ice ? "var(--hostly-ink-soft)" : "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(Math.max(0.02, p) * 100)}%
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: cv ? 4 : 6 }}>
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: ice ? 7 : 9,
                          height: ice ? 7 : 9,
                          borderRadius: 999,
                          border: ice ? `1px solid ${i === iaPhaseIndex % 4 ? "color-mix(in srgb, var(--hostly-accent) 45%, transparent)" : "var(--hostly-table-divider-faint)"}` : undefined,
                          background: i === iaPhaseIndex % 4 ? (ice ? "var(--hostly-accent)" : "#fbbf24") : ice ? "var(--hostly-table-head-surface)" : "rgba(71,85,105,0.75)",
                          boxShadow: !ice && i === iaPhaseIndex % 4 ? "0 0 12px rgba(251,191,36,0.5)" : "none",
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
            flex: mIce ? "1 1 auto" : ice ? "0.95 1 232px" : "0.95 1 300px",
            minWidth: mIce ? 0 : ice ? 200 : 260,
            maxWidth: mIce ? "100%" : ice ? (cv ? 300 : 320) : cv ? 400 : 440,
            width: mIce ? "100%" : undefined,
            display: "flex",
            flexDirection: "column",
            gap: cv ? (ice ? 8 : 9) : ice ? 10 : 14,
            minHeight: cv ? 0 : mIce ? undefined : undefined,
            maxHeight: iceScroll ? undefined : cv ? "min(100%, calc(100dvh - 200px))" : undefined,
            overflow: iceScroll ? "visible" : cv ? "auto" : undefined,
          }}
        >
          <div style={{ ...shell, padding: cv ? "10px 12px 9px" : ice ? "12px 12px 10px" : "16px 16px 14px", flexShrink: 0 }}>
            <p
              style={{
                margin: cv ? "0 0 7px 0" : "0 0 12px 0",
                fontSize: cv ? 11 : 12,
                fontWeight: ice ? 720 : 800,
                color: ice ? "var(--hostly-accent)" : "#fde68a",
                letterSpacing: "0.035em",
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
                    borderRadius: cv ? 10 : 11,
                    background: ice ? "color-mix(in srgb, var(--hostly-ice-100) 92%, transparent)" : "rgba(15, 23, 42, 0.65)",
                    border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(51, 65, 85, 0.55)",
                    boxShadow: ice ? "var(--hostly-shadow-hairline)" : undefined,
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: cv ? 24 : 26,
                      height: cv ? 24 : 26,
                      borderRadius: cv ? 7 : 8,
                      background: ice ? "var(--hostly-accent-soft)" : "rgba(251,191,36,0.12)",
                      border: ice ? "1px solid color-mix(in srgb, var(--hostly-accent) 18%, var(--hostly-table-divider-soft))" : "1px solid rgba(251,191,36,0.35)",
                      color: ice ? "var(--hostly-accent)" : "#fde68a",
                      fontSize: cv ? 11 : 12,
                      fontWeight: 750,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span style={{ fontSize: cv ? 12 : 13, fontWeight: ice ? 580 : 600, color: ice ? "var(--hostly-ink)" : "#e2e8f0", lineHeight: 1.35, paddingTop: 1 }}>{t(bk)}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              borderRadius: cv ? 11 : 12,
              padding: cv ? "9px 11px" : ice ? "12px 13px" : "14px 16px",
              border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(56, 189, 248, 0.28)",
              background: ice ? "color-mix(in srgb, var(--hostly-info-soft) 94%, transparent)" : "linear-gradient(125deg, rgba(8, 47, 73, 0.4) 0%, rgba(15, 23, 42, 0.85) 100%)",
              boxShadow: ice ? "var(--hostly-shadow-hairline)" : "0 0 0 1px rgba(56,189,248,0.06)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", gap: cv ? 8 : 12, alignItems: "flex-start" }}>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: cv ? 17 : 20,
                  lineHeight: 1,
                  filter: ice ? "grayscale(0.35)" : "grayscale(0.2)",
                }}
                aria-hidden
              >
                🛡️
              </span>
              <div>
                <p
                  style={{
                    margin: cv ? "0 0 3px 0" : "0 0 6px 0",
                    fontSize: cv ? 13 : 14,
                    fontWeight: ice ? 720 : 800,
                    color: ice ? "var(--hostly-navy-deep)" : "#f0f9ff",
                  }}
                >
                  {t(keys.controlTitle)}
                </p>
                <p style={{ margin: 0, fontSize: cv ? 11 : 12, color: ice ? "var(--hostly-ink-muted)" : "#bae6fd", lineHeight: 1.4, fontWeight: 600 }}>
                  {t(keys.controlBody)}
                </p>
              </div>
            </div>
          </div>

          <div style={{ ...shell, padding: cv ? "10px 12px 11px" : ice ? "12px 12px 14px" : "14px 16px 16px", flex: cv ? undefined : 1, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: cv ? 8 : 12 }}>
              <span style={{ fontSize: cv ? 12 : 13, fontWeight: 750, color: ice ? "var(--hostly-ink-strong)" : "#f1f5f9" }}>{t(keys.mockTitle)}</span>
              <span style={{ fontSize: cv ? 8 : 9, fontWeight: 800, color: ice ? "var(--hostly-ink-faint)" : "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {t(keys.mockDemo)}
              </span>
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
                    background: ice ? "var(--hostly-info-soft)" : "rgba(15, 23, 42, 0.72)",
                    border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(51, 65, 85, 0.5)",
                    boxShadow: ice ? "var(--hostly-shadow-hairline)" : undefined,
                  }}
                >
                  <span
                    style={{
                      fontSize: cv ? 12 : 14,
                      fontWeight: 700,
                      color: ice ? "var(--hostly-ink-strong)" : "#f8fafc",
                      flex: "1 1 120px",
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t(row.nameKey)}
                  </span>
                  <span style={{ fontSize: 11, color: ice ? "var(--hostly-ink-faint)" : "#64748b", fontWeight: 700 }}>—</span>
                  <span style={{ fontSize: cv ? 12 : 14, fontWeight: 760, color: ice ? "var(--hostly-accent)" : "#fde68a", fontVariantNumeric: "tabular-nums" }}>{t(row.priceKey)}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: cv ? 8 : 9,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: cv ? "2px 6px" : "3px 8px",
                      borderRadius: 999,
                      background: ice ? "color-mix(in srgb, var(--hostly-accent-soft) 96%, transparent)" : "rgba(251,191,36,0.14)",
                      border: ice ? "1px solid color-mix(in srgb, var(--hostly-accent) 16%, var(--hostly-table-divider-soft))" : "1px solid rgba(251,191,36,0.32)",
                      color: ice ? "var(--hostly-accent)" : "#fde68a",
                    }}
                  >
                    {t(TIPO_KEYS[row.tipo])}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ margin: cv ? "8px 0 0 0" : "12px 0 0 0", fontSize: cv ? 10 : 11, color: ice ? "var(--hostly-ink-muted)" : "#64748b", lineHeight: 1.35 }}>{t(keys.mockCaption)}</p>
          </div>

          <div
            style={{
              borderRadius: cv ? 11 : 12,
              padding: cv ? "9px 11px" : ice ? "11px 12px" : "14px 16px",
              border: ice ? "1px solid var(--hostly-table-divider-soft)" : "1px solid rgba(71, 85, 105, 0.5)",
              background: ice ? "color-mix(in srgb, var(--hostly-success-soft) 22%, transparent)" : "rgba(15, 23, 42, 0.5)",
              flexShrink: 0,
              boxShadow: ice ? "var(--hostly-shadow-hairline)" : undefined,
            }}
          >
            <p
              style={{
                margin: cv ? "0 0 6px 0" : "0 0 10px 0",
                fontSize: cv ? 10 : 11,
                fontWeight: 800,
                color: ice ? "var(--hostly-ink-faint)" : "#94a3b8",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {t(keys.flowTitle)}
            </p>
            <ol style={{ margin: 0, paddingLeft: 16, color: ice ? "var(--hostly-ink-muted)" : "#cbd5e1", fontSize: cv ? 11 : 12, fontWeight: 620, lineHeight: 1.45 }}>
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
