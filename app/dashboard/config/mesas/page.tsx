"use client";

import {
  collection,
  deleteField,
  doc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import type { CSSProperties, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  BedDouble,
  BedSingle,
  Circle,
  DoorOpen,
  Flower2,
  Layers3,
  Maximize2,
  Minus,
  Plus,
  RectangleHorizontal,
  Scan,
  Square,
  Waves,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import {
  EditableFloorMap,
  type FloorSurfacePresetId,
  type EditableFloorMapViewportControls,
} from "@/components/map/EditableFloorMap";
import MapFloatingQuickActions, {
  type ScreenRect,
} from "@/components/map/MapFloatingQuickActions";
import {
  ConfigMapAssistantPlanoBanner,
  ConfigMapEditorEmptyState,
  ConfigMapElementContextPanel,
  ConfigMapInspectorGuide,
  ConfigMapInspectorIdleHint,
  ConfigMapSelectionHud,
} from "@/components/map/config-map-editor-assistant-ux";
import FloorPlanLayoutToolbar from "@/components/map/floor-plan-layout-toolbar";
import ModulePageShell from "@/components/module-page-shell";
import { useFloorPlanLayouts } from "@/hooks/useFloorPlanLayouts";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  getDefaultSizeForPlanElementType,
  getTables,
  isDecorativePlanElementType,
  TABLE_MAP_STATUS_FREE,
  type FloorElement,
  type PlanElementType,
} from "@/lib/firestore/tables";
import {
  canvasSizeForNewFloorPlan,
  createDefaultFloorPlanIfNeeded,
  createFloorPlan,
  duplicateFloorPlan,
  entityBelongsToFloorPlan,
  getFloorPlans,
  legacyUnscopedFloorPlanAnchorId,
  moveFloorPlanOrder,
  slugifyFloorPlanName,
  updateFloorPlan,
  type FloorPlan,
} from "@/lib/firestore/floorPlans";
import {
  createZone,
  getZones,
  updateZone,
  type Zone,
} from "@/lib/firestore/zones";
import {
  defaultZoneColorForTemplate,
  getAreaTemplateFurniture,
  type AreaTemplateKey,
} from "@/lib/map/area-template-furniture";
import type { FloorPlanSnapshotFloorPlan } from "@/lib/firestore/floor-plan-snapshots";
import {
  planTypeLabelEs,
  resolvePlanElementDisplayName,
} from "@/lib/map/plan-element-labels";
import {
  dismissRoomsAssistantBanner,
  dismissRoomsAssistantGuide,
  isRoomsAssistantBannerDismissed,
  isRoomsAssistantGuideDismissed,
  readRoomsAssistantDraft,
  type RoomsAssistantDraft,
} from "@/lib/rooms-assistant/draft";
import { buildFloorPlanSeedFromDraft } from "@/lib/rooms-assistant/floor-plan-seed";
import type { FloorPlanSeedZone } from "@/lib/rooms-assistant/floor-plan-seed-types";

const fieldLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  color: "#94a3b8",
  marginBottom: 4,
  letterSpacing: "0.02em",
};

const fieldBlock: CSSProperties = {
  marginBottom: 10,
};

const inspectorPremiumDivider: CSSProperties = {
  height: 1,
  margin: "4px 0 6px",
  border: "none",
  background: "rgba(148, 163, 184, 0.07)",
};

const inspectorCfgDivider: CSSProperties = {
  height: 1,
  margin: "6px 0 8px",
  border: "none",
  background: "#e7e0d6",
};

const inspectorPremiumLabel: CSSProperties = {
  display: "block",
  fontSize: 8.5,
  fontWeight: 700,
  color: "#64748b",
  marginBottom: 3,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const inspectorPremiumInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: "1px solid rgba(148, 163, 184, 0.12)",
  background: "rgba(15, 23, 42, 0.32)",
  color: "#f1f5f9",
  padding: "4px 6px",
  fontSize: 11.5,
  outline: "none",
};

const inspectorMapLayoutLabel: CSSProperties = {
  display: "block",
  fontSize: 9,
  fontWeight: 600,
  color: "#64748b",
  marginBottom: 4,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const inspectorMapLayoutInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 6,
  border: "1px solid #e7e0d6",
  background: "#fffdf9",
  color: "#0f172a",
  padding: "4px 8px",
  fontSize: 12,
  fontWeight: 500,
  outline: "none",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.5)",
  color: "#f8fafc",
  padding: "8px 10px",
  fontSize: 13,
  outline: "none",
};

const readOnlyStyle: CSSProperties = {
  ...inputStyle,
  opacity: 0.88,
  cursor: "default",
};

const btnDanger: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid rgba(248, 113, 113, 0.35)",
  background: "rgba(248, 113, 113, 0.12)",
  color: "#fecaca",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  marginTop: 4,
};

const zoneLegendStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.45)",
  flexWrap: "wrap",
  maxWidth: "min(360px, 100%)",
};

const zoneLegendItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  color: "#cbd5f5",
  whiteSpace: "nowrap",
};

const zoneHighlightSelectStyle: CSSProperties = {
  appearance: "none",
  padding: "6px 26px 6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background:
    "rgba(15, 23, 42, 0.65) url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23cbd5f5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\") no-repeat right 10px center",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  cursor: "pointer",
  minWidth: 160,
};

const smallBtn: CSSProperties = {
  padding: "5px 10px",
  borderRadius: 8,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: "rgba(15, 23, 42, 0.35)",
  color: "#cbd5e1",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const smallBtnDanger: CSSProperties = {
  ...smallBtn,
  border: "1px solid rgba(248, 113, 113, 0.35)",
  background: "rgba(248, 113, 113, 0.12)",
  color: "#fecaca",
};

const smallBtnActive: CSSProperties = {
  ...smallBtn,
  border: "1px solid rgba(56, 189, 248, 0.35)",
  background: "rgba(56, 189, 248, 0.18)",
  color: "#e0f2fe",
  fontWeight: 700,
};

const primaryBtn: CSSProperties = {
  ...smallBtn,
  border: "1px solid rgba(56, 189, 248, 0.32)",
  background: "rgba(56, 189, 248, 0.16)",
  color: "#e0f2fe",
  fontWeight: 700,
};

const unsavedBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(249, 115, 22, 0.28)",
  background: "rgba(249, 115, 22, 0.1)",
  color: "#fed7aa",
  fontWeight: 600,
  fontSize: 11,
  whiteSpace: "nowrap",
};

const unsavedBadgeCompactStyle: CSSProperties = {
  ...unsavedBadgeStyle,
  padding: "2px 6px",
  fontSize: 9,
  gap: 3,
};

/** Pill “Sin guardar” en cabecera del editor de plano (config clara, mínima). */
const mapEditorUnsavedPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "1px 7px",
  borderRadius: 999,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  color: "#64748b",
  fontWeight: 500,
  fontSize: 10,
  letterSpacing: "0.01em",
  whiteSpace: "nowrap",
};

/** Guardar integrado en toolbar premium (protagonismo mapa). */
const premiumToolbarSaveBtn: CSSProperties = {
  padding: "3px 9px",
  borderRadius: 6,
  border: "1px solid rgba(71, 85, 105, 0.55)",
  background: "rgba(51, 65, 85, 0.95)",
  color: "#f1f5f9",
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: "-0.01em",
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
};

const premiumToolbarResetBtn: CSSProperties = {
  ...premiumToolbarSaveBtn,
  borderColor: "rgba(71, 85, 105, 0.42)",
  background: "rgba(30, 41, 59, 0.75)",
  color: "#94a3b8",
  fontWeight: 600,
};

const premiumToolbarDiscardBtn: CSSProperties = {
  padding: "2px 6px",
  borderRadius: 5,
  border: "1px solid transparent",
  background: "transparent",
  color: "#64748b",
  fontWeight: 600,
  fontSize: 9,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/** Barra mínima encima del lienzo (solo preset premium). */
const premiumUltraPlanBarStyle: CSSProperties = {
  marginBottom: 2,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  minHeight: 28,
  minWidth: 0,
  padding: "2px 8px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.08)",
  background: "rgba(15, 23, 42, 0.42)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 22px rgba(2, 6, 23, 0.14)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxSizing: "border-box",
};

const premiumPopoverSectionLabel: CSSProperties = {
  marginTop: 8,
  marginBottom: 4,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.1em",
  color: "#64748b",
  textTransform: "uppercase",
};

const premiumMenuActionRow: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid rgba(148, 163, 184, 0.08)",
  background: "rgba(30, 41, 59, 0.4)",
  color: "#e2e8f0",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  marginBottom: 4,
  boxSizing: "border-box",
};

const premiumFabPlusStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(15, 23, 42, 0.78)",
  color: "#f1f5f9",
  fontSize: 24,
  fontWeight: 200,
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "none",
  boxShadow:
    "0 4px 22px rgba(2, 6, 23, 0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const premiumPopoverPanelStyle: CSSProperties = {
  width: 268,
  maxHeight: "min(420px, 72vh)",
  overflow: "auto",
  padding: "8px 8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.12)",
  background: "rgba(15, 23, 42, 0.94)",
  boxShadow: "0 16px 48px rgba(2, 6, 23, 0.5)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxSizing: "border-box",
};

const mapToolboxAsideStyle: CSSProperties = {
  flex: "0 0 168px",
  width: 168,
  maxWidth: 168,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  boxSizing: "border-box",
  padding: "12px 10px 14px",
  background: "#f3f7fb",
  borderRight: "1px solid var(--hostly-line)",
};

const mapToolboxMicro: CSSProperties = {
  fontSize: 9,
  fontWeight: 650,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "#64748b",
  margin: "0 0 7px",
};

const mapToolboxTopCard: CSSProperties = {
  borderRadius: 12,
  padding: 8,
  marginBottom: 16,
  background: "rgba(255, 255, 255, 0.76)",
  border: "1px solid var(--hostly-line)",
  boxShadow: "none",
};

const mapToolboxSelect: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
  fontSize: 11,
  padding: "6px 8px",
  marginBottom: 8,
  borderRadius: 8,
  border: "1px solid var(--hostly-line)",
  background: "rgba(255, 255, 255, 0.84)",
  color: "#0f172a",
  cursor: "pointer",
};

const mapToolboxRow2: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 4,
};

const mapToolboxSaveSm: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #7dd3fc",
  background: "#f5efe5",
  color: "#5f4b32",
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const mapToolboxGhostSm: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid var(--hostly-line)",
  background: "#ffffff",
  color: "#475569",
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

/** Rail configuración: añadir en 2 columnas, compacto y legible. */
const mapToolboxAddGrid2: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 5,
  marginBottom: 16,
};

const mapToolboxChipsRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginBottom: 18,
};

const mapToolboxSectionBtn: CSSProperties = {
  width: "100%",
  minHeight: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "6px 0",
  margin: 0,
  border: "none",
  background: "transparent",
  color: "#334155",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 750,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
};

const mapToolboxSectionPanel: CSSProperties = {
  overflow: "hidden",
  transition: "grid-template-rows 150ms ease, opacity 150ms ease",
};

const mapFloorSwatchGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 6,
  marginBottom: 16,
};

const mapToolboxVistaGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
  marginBottom: 10,
};

const mapToolboxFullMuted: CSSProperties = {
  width: "100%",
  fontSize: 11,
  fontWeight: 600,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--hostly-line)",
  background: "#ffffff",
  color: "#475569",
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const mapRailActionCaption: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  lineHeight: 1.15,
  color: "#475569",
  letterSpacing: "0.01em",
};

/** Inspector: acciones inferiores compactas (ruta configuración mapa). */
const inspectorCfgFooterBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #e7e0d6",
  background: "#fffdf9",
  color: "#334155",
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  transition: "background-color 140ms ease, border-color 140ms ease, color 140ms ease",
};

const inspectorCfgFooterDelete: CSSProperties = {
  ...inspectorCfgFooterBtn,
  border: "1px solid #f0c9c9",
  background: "#fff7f5",
  color: "#be123c",
  fontWeight: 600,
  transition:
    "background-color 140ms ease, border-color 140ms ease, color 140ms ease",
};

function mapToolboxChipStyle(disabled: boolean): CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    padding: "4px 9px",
    borderRadius: 999,
    border: "1px solid var(--hostly-line)",
    background: "#ffffff",
    color: "#475569",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    whiteSpace: "nowrap",
  };
}

/** Barra principal del editor: acciones colocar + guardar. */
const editorTopBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  rowGap: 6,
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(15, 23, 42, 0.42)",
  marginBottom: 4,
  boxSizing: "border-box",
};

/** Herramientas de zona, vista y selección (menos protagonistas). */
const editorSecondaryStripStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 5,
  rowGap: 5,
  padding: "5px 8px",
  borderRadius: 9,
  border: "1px solid rgba(148, 163, 184, 0.1)",
  background: "rgba(15, 23, 42, 0.26)",
  marginBottom: 6,
  boxSizing: "border-box",
};

/** Barra única del preset espacial premium (ruta configuración → espacios → mesas). */
const editorPremiumBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 1,
  rowGap: 1,
  minHeight: 36,
  padding: "1px 4px",
  borderRadius: 6,
  border: "1px solid rgba(148, 163, 184, 0.05)",
  background: "rgba(2, 6, 23, 0.26)",
  marginBottom: 0,
  boxSizing: "border-box",
};

const editorPremiumSecondaryStyle: CSSProperties = {
  ...editorSecondaryStripStyle,
  border: "1px solid rgba(148, 163, 184, 0.06)",
  background: "rgba(15, 23, 42, 0.12)",
  marginBottom: 2,
  minHeight: 32,
  boxSizing: "border-box",
  padding: "1px 4px",
  gap: 2,
  rowGap: 2,
};

function EditorToolbarGroup({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: compact ? 0 : 2,
        padding: compact ? "0 1px 0 2px" : "2px 4px 2px 5px",
        borderRadius: 6,
        border: "1px solid rgba(148, 163, 184, 0.05)",
        background: "rgba(15, 23, 42, 0.14)",
        boxSizing: "border-box",
        minHeight: 24,
      }}
    >
      <span
        style={{
          fontSize: compact ? 5.5 : 6.5,
          fontWeight: 600,
          letterSpacing: "0.12em",
          color: "rgba(71, 85, 105, 0.72)",
          textTransform: "uppercase",
          paddingRight: compact ? 2 : 4,
          marginRight: 0,
          borderRight: "1px solid rgba(148, 163, 184, 0.1)",
          lineHeight: 1.1,
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: compact ? 0 : 2,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const topBarMesaBtn: CSSProperties = {
  padding: "5px 10px",
  borderRadius: 8,
  border: "1px solid rgba(56, 189, 248, 0.32)",
  background: "rgba(56, 189, 248, 0.12)",
  color: "#bae6fd",
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: "-0.02em",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const topBarMesaBtnActive: CSSProperties = {
  ...topBarMesaBtn,
  background: "rgba(56, 189, 248, 0.28)",
  boxShadow: "inset 0 0 0 1px rgba(56, 189, 248, 0.25)",
};

/** Mesa en toolbar premium: menos “neon”, más editorial. */
const premiumTopBarMesaBtn: CSSProperties = {
  padding: "3px 8px",
  borderRadius: 7,
  border: "1px solid rgba(71, 85, 105, 0.55)",
  background: "rgba(30, 41, 59, 0.65)",
  color: "#e2e8f0",
  fontWeight: 600,
  fontSize: 9.5,
  letterSpacing: "-0.01em",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const premiumTopBarMesaBtnActive: CSSProperties = {
  ...premiumTopBarMesaBtn,
  border: "1px solid rgba(148, 163, 184, 0.45)",
  background: "rgba(51, 65, 85, 0.9)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
};

const decorativeSelectStyle: CSSProperties = {
  ...zoneHighlightSelectStyle,
  minWidth: 148,
  fontSize: 12,
  padding: "6px 24px 6px 10px",
};

const miniToolBtn: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 7,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(15, 23, 42, 0.32)",
  color: "#cbd5e1",
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const miniToolBtnDanger: CSSProperties = {
  ...miniToolBtn,
  border: "1px solid rgba(248, 113, 113, 0.35)",
  background: "rgba(248, 113, 113, 0.1)",
  color: "#fecaca",
};

const miniToolBtnActive: CSSProperties = {
  ...miniToolBtn,
  border: "1px solid rgba(56, 189, 248, 0.35)",
  background: "rgba(56, 189, 248, 0.14)",
  color: "#e0f2fe",
  fontWeight: 700,
};

const premiumMiniToolBtn: CSSProperties = {
  ...miniToolBtn,
  padding: "1px 4px",
  fontSize: 8.5,
  borderRadius: 6,
};

const premiumMiniToolBtnActive: CSSProperties = {
  ...miniToolBtn,
  padding: "1px 4px",
  fontSize: 8.5,
  borderRadius: 6,
  border: "1px solid rgba(100, 116, 139, 0.45)",
  background: "rgba(51, 65, 85, 0.55)",
  color: "#e2e8f0",
  fontWeight: 700,
};

/** Chips compactos “plantilla de área” (solo toolbar premium). */
const areaTemplateChip: CSSProperties = {
  ...premiumMiniToolBtn,
  fontSize: 7.5,
  padding: "1px 4px",
  letterSpacing: "0.01em",
};

const sidePanelStyle: CSSProperties = {
  flex: "0 0 228px",
  width: 228,
  maxWidth: "100%",
  minWidth: 200,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  padding: "9px 9px 8px",
  borderRadius: "var(--hostly-radius-md)",
  alignSelf: "stretch",
  overflow: "hidden",
};

const sidePanelTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#94a3b8",
  marginBottom: 10,
};

const sideEmptyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 8,
  padding: "10px 2px",
  color: "#94a3b8",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
};

function minSizeForPlanType(t: PlanElementType): { w: number; h: number } {
  if (t === "sunbed") return { w: 64, h: 28 };
  if (t === "bed") return { w: 72, h: 44 };
  if (t === "wall") return { w: 10, h: 4 };
  if (t === "bar") return { w: 44, h: 16 };
  if (t === "column") return { w: 10, h: 10 };
  if (t === "pool") return { w: 48, h: 28 };
  if (t === "door") return { w: 10, h: 10 };
  if (t === "planter") return { w: 12, h: 8 };
  return { w: 36, h: 36 };
}

function createSizeForPlanType(t: PlanElementType): { width: number; height: number } | null {
  if (t === "door") return { width: 36, height: 10 };
  if (t === "wall") return { width: 80, height: 10 };
  if (t === "planter") return { width: 64, height: 12 };
  return null;
}

const DUPLICATE_OFFSET = 20;
/** Offset al pegar selección copiada (Ctrl/Cmd+V). */
const OFFSET = 20;
const GRID_SIZE = 10;

function snapToGrid(n: number): number {
  return Math.round(n / GRID_SIZE) * GRID_SIZE;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function getNextElementName(
  type: PlanElementType,
  elements: Pick<FloorElement, "type" | "name">[],
): string {
  const baseName =
    type === "sunbed"
      ? "Hamaca"
      : type === "bed"
        ? "Cama"
        : type === "wall"
          ? "Pared"
          : type === "bar"
            ? "Barra"
            : type === "column"
              ? "Columna"
              : type === "pool"
              ? "Piscina"
              : type === "door"
                ? "Puerta"
                : type === "planter"
                  ? "Jardinera"
                  : "Mesa";
  const re = new RegExp(`^${baseName}\\s+(\\d+)$`, "i");
  let max = 0;
  for (const el of elements) {
    if (el.type !== type) continue;
    const n = typeof el.name === "string" ? el.name.trim() : "";
    const m = re.exec(n);
    if (!m) continue;
    const parsed = Number.parseInt(m[1] ?? "", 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return `${baseName} ${Math.max(1, max + 1)}`;
}

const MAX_ELEMENT_HISTORY = 50;

function cloneElementList(els: FloorElement[]): FloorElement[] {
  return els.map((e) => ({ ...e }));
}

const AREA_QUICK_TEMPLATES = [
  { key: "interior", label: "Interior", baseName: "Interior", width: 520, height: 360 },
  { key: "terraza", label: "Terraza", baseName: "Terraza", width: 600, height: 320 },
  { key: "barra", label: "Barra", baseName: "Barra", width: 520, height: 120 },
  { key: "piscina", label: "Piscina", baseName: "Piscina", width: 480, height: 260 },
  { key: "cocktail", label: "Cocktail", baseName: "Cocktail Bar", width: 440, height: 300 },
  { key: "vip", label: "VIP", baseName: "VIP", width: 360, height: 240 },
] as const;
type AreaQuickTemplate = (typeof AREA_QUICK_TEMPLATES)[number];

const FLOOR_SURFACE_OPTIONS = [
  { id: "ice", label: "Azul hielo", swatch: "linear-gradient(135deg, #f8fbfe 0%, #dceaf5 100%)" },
  { id: "stone", label: "Piedra clara", swatch: "linear-gradient(135deg, #f7f9fb 0%, #d8e0e7 100%)" },
  { id: "warm", label: "Beige suave", swatch: "linear-gradient(135deg, #fffaf2 0%, #e7ddd0 100%)" },
  { id: "coolGray", label: "Gris frío", swatch: "linear-gradient(135deg, #f6f9fb 0%, #d9e2ea 100%)" },
  { id: "sand", label: "Arena", swatch: "linear-gradient(135deg, #fbf6eb 0%, #dfd2bd 100%)" },
  { id: "cement", label: "Cemento", swatch: "linear-gradient(135deg, #f2f6f8 0%, #cfdbe4 100%)" },
  { id: "lightWood", label: "Madera clara", swatch: "linear-gradient(135deg, #fbf5eb 0%, #dccab2 100%)" },
  { id: "slate", label: "Slate claro", swatch: "linear-gradient(135deg, #eef4f9 0%, #cbdbe8 100%)" },
] as const satisfies readonly {
  id: FloorSurfacePresetId;
  label: string;
  swatch: string;
}[];

type RailSectionId = "floor" | "tables" | "elements" | "areas";

const TABLE_CREATE_VARIANTS = [
  {
    key: "round",
    label: "Redonda",
    icon: Circle,
    tableShape: "round",
    width: 62,
    height: 62,
    seats: 4,
  },
  {
    key: "square",
    label: "Cuadrada",
    icon: Square,
    tableShape: "square",
    width: 68,
    height: 68,
    seats: 4,
  },
  {
    key: "rect",
    label: "Rect.",
    icon: RectangleHorizontal,
    tableShape: "square",
    width: 108,
    height: 64,
    seats: 4,
  },
  {
    key: "long",
    label: "Larga",
    icon: RectangleHorizontal,
    tableShape: "square",
    width: 150,
    height: 62,
    seats: 6,
  },
] as const satisfies readonly {
  key: string;
  label: string;
  icon: LucideIcon;
  tableShape: FloorElement["tableShape"];
  width: number;
  height: number;
  seats: number;
}[];

type TableCreateVariantKey = (typeof TABLE_CREATE_VARIANTS)[number]["key"];
type ActiveCreateTool = PlanElementType | null;

function sortZonesByName(list: Zone[]): Zone[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function sortFloorPlansForSelector(list: FloorPlan[]): FloorPlan[] {
  return [...list].sort((a, b) => {
    const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name, "es");
  });
}

function nextUniqueZoneBaseName(baseName: string, zones: Zone[]): string {
  const names = new Set(zones.map((z) => z.name.trim()));
  const base = baseName.trim();
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

function zoneHasVisualRect(z: Zone): boolean {
  return (
    typeof z.x === "number" &&
    typeof z.y === "number" &&
    typeof z.width === "number" &&
    typeof z.height === "number" &&
    Number.isFinite(z.x) &&
    Number.isFinite(z.y) &&
    Number.isFinite(z.width) &&
    Number.isFinite(z.height)
  );
}

/** Posición inicial cerca del centro del plano, con ligero escalonado si ya hay zonas con rect. */
function suggestNewZonePosition(
  zones: Zone[],
  width: number,
  height: number,
): { x: number; y: number } {
  const stagger = 26;
  const idx = zones.filter(zoneHasVisualRect).length;
  const col = idx % 6;
  const row = Math.floor(idx / 6);
  const x = Math.round(420 - width / 2 + col * stagger);
  const y = Math.round(300 - height / 2 + row * stagger);
  return { x, y };
}

/** Si no hay zona con rect, el escenario base usa este rectángulo lógico. */
const DEFAULT_VENUE_SEED_RECT = { x: 88, y: 76, w: 600, h: 412 };

function pickSeedZoneLayout(zones: Zone[]): {
  rect: { x: number; y: number; w: number; h: number };
  attach: { id: string; name: string };
} | null {
  const rects = zones.filter(zoneHasVisualRect);
  if (rects.length === 0) return null;
  const interior = rects.find((z) =>
    z.name.trim().toLowerCase().includes("interior"),
  );
  const chosen =
    interior ??
    [...rects].sort(
      (a, b) =>
        (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
    )[0]!;
  return {
    rect: {
      x: chosen.x as number,
      y: chosen.y as number,
      w: chosen.width as number,
      h: chosen.height as number,
    },
    attach: { id: chosen.id, name: chosen.name },
  };
}

/** Desplazamiento estable por plano/índice (aspecto “natural”, no grid perfecto). */
function seedJitter(planId: string, index: number, salt: number): number {
  let h = 0;
  for (let i = 0; i < planId.length; i++) {
    h = (h * 31 + planId.charCodeAt(i)) | 0;
  }
  const t = Math.sin((h + salt * 127 + index * 19.091) * 12.9898) * 43758.5453123;
  const f = t - Math.floor(t);
  return Math.round(f * 28 - 14);
}

const mapRailIconProps = {
  size: 14 as const,
  strokeWidth: 1.7 as const,
  className: "text-stone-500 shrink-0",
};

function MapRailIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon {...mapRailIconProps} aria-hidden />;
}

function mapRailPaletteBtnClass(active: boolean, disabled?: boolean): string {
  const base =
    "flex min-h-[38px] flex-col items-center justify-center gap-0.5 rounded-lg border text-center transition-[background-color,border-color,color] duration-[140ms] ease-out";
  if (disabled) {
    return `${base} cursor-not-allowed border-stone-100/70 bg-stone-50/50 text-stone-400 opacity-50`;
  }
  if (active) {
    return `${base} cursor-pointer border-stone-300/90 bg-stone-100/80 text-stone-900`;
  }
  return `${base} cursor-pointer border-stone-200/75 bg-[#fffdf9]/70 text-stone-600 hover:bg-stone-50/90`;
}

export type ConfigMesasPageProps = {
  lockViewportFillParent?: boolean;
  /** Solo ruta `/dashboard/configuracion/espacios/mesas`: look espacial premium sin tocar modelos ni Firestore. */
  premiumSpatialEditor?: boolean;
  /** Solo esa misma ruta: rail izquierdo de herramientas y sin sidebar de configuración (layout padre). */
  configuracionMapEditorLayout?: boolean;
};

export default function ConfigMesasPage({
  lockViewportFillParent = false,
  premiumSpatialEditor = false,
  configuracionMapEditorLayout = false,
}: ConfigMesasPageProps = {}) {
  const router = useRouter();
  const { user, restaurantId: profileRestaurantId, ready: authReady } =
    useAuth();
  const restaurantId = profileRestaurantId ?? null;

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [activeCreateType, setActiveCreateType] =
    useState<ActiveCreateTool>(null);
  const [activeTableVariant, setActiveTableVariant] =
    useState<TableCreateVariantKey>("round");

  const [loadedElements, setLoadedElements] = useState<FloorElement[]>([]);
  const [loadedZones, setLoadedZones] = useState<Zone[]>([]);
  const [elements, setElementsBase] = useState<FloorElement[]>([]);
  const elementsRef = useRef<FloorElement[]>([]);
  const venueBaselineLockRef = useRef<Set<string>>(new Set());
  const roomsAssistantSeedLockRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);
  const [history, setHistory] = useState<FloorElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<FloorElement[][]>([]);
  const historyIndexRef = useRef(0);
  const [zones, setZones] = useState<Zone[]>([]);
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [selectedFloorPlanId, setSelectedFloorPlanId] = useState<string | null>(
    null,
  );
  const [zoneHighlight, setZoneHighlight] = useState<
    "all" | "unassigned" | string
  >("all");
  const [editingZones, setEditingZones] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  const lastMapInteractionRef = useRef<{ x: number; y: number } | null>(null);
  const [preferredPlacementMapPoint, setPreferredPlacementMapPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectionScreenRect, setSelectionScreenRect] =
    useState<ScreenRect | null>(null);
  const [zoneHudScreenRect, setZoneHudScreenRect] =
    useState<ScreenRect | null>(null);
  const [clipboardElements, setClipboardElements] = useState<
    FloorElement[] | null
  >(null);

  useEffect(() => {
    selectedIdsRef.current = selectedIds.map((id) => String(id).trim());
  }, [selectedIds]);

  const [editorLayoutNarrow, setEditorLayoutNarrow] = useState(false);
  const [areaTemplateBusy, setAreaTemplateBusy] = useState(false);
  const [areaTemplateFeedback, setAreaTemplateFeedback] = useState<string | null>(null);
  const [floorSurfacePreset, setFloorSurfacePreset] =
    useState<FloorSurfacePresetId>("ice");
  const [openRailSection, setOpenRailSection] =
    useState<RailSectionId | null>("tables");
  const [premiumToolsMenuOpen, setPremiumToolsMenuOpen] = useState(false);
  const [premiumInspectorCollapsed, setPremiumInspectorCollapsed] = useState(
    () => Boolean(configuracionMapEditorLayout),
  );
  const [roomsAssistantBannerVisible, setRoomsAssistantBannerVisible] =
    useState(false);
  const [roomsAssistantGuideVisible, setRoomsAssistantGuideVisible] =
    useState(false);
  const [cfgInspectorAdvancedOpen, setCfgInspectorAdvancedOpen] =
    useState(false);
  const [cfgMapActionFeedback, setCfgMapActionFeedback] = useState<string | null>(
    null,
  );
  const [hasRoomsAssistantDraft, setHasRoomsAssistantDraft] = useState(false);
  const cfgMapFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const premiumToolsMenuRef = useRef<HTMLDivElement | null>(null);
  const mapViewportControlsRef = useRef<EditableFloorMapViewportControls | null>(
    null,
  );
  const placementSeqRef = useRef(0);
  const [placementRequest, setPlacementRequest] = useState<{
    id: number;
    planType: PlanElementType;
  } | null>(null);
  const clearPlacementRequest = useCallback(() => {
    setPlacementRequest(null);
    setPreferredPlacementMapPoint(null);
  }, []);

  const flashCfgMapFeedback = useCallback((message: string) => {
    setCfgMapActionFeedback(message);
    if (cfgMapFeedbackTimerRef.current) {
      clearTimeout(cfgMapFeedbackTimerRef.current);
    }
    cfgMapFeedbackTimerRef.current = setTimeout(() => {
      setCfgMapActionFeedback(null);
      cfgMapFeedbackTimerRef.current = null;
    }, 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (cfgMapFeedbackTimerRef.current) {
        clearTimeout(cfgMapFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!configuracionMapEditorLayout || !premiumSpatialEditor) return;
    setHasRoomsAssistantDraft(Boolean(readRoomsAssistantDraft()));
  }, [configuracionMapEditorLayout, premiumSpatialEditor]);

  useEffect(() => {
    if (!premiumToolsMenuOpen || configuracionMapEditorLayout) return;
    const onDown = (e: MouseEvent) => {
      const root = premiumToolsMenuRef.current;
      if (!root?.contains(e.target as Node)) {
        setPremiumToolsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [premiumToolsMenuOpen]);

  useEffect(() => {
    if (!premiumSpatialEditor) return;
    if (editorLayoutNarrow) {
      setPremiumInspectorCollapsed(false);
      return;
    }
    if (!configuracionMapEditorLayout) return;
    if (
      roomsAssistantGuideVisible &&
      selectedIds.length === 0 &&
      !editingZones
    ) {
      setPremiumInspectorCollapsed(false);
      return;
    }
    const hasFocus = editingZones || selectedIds.length > 0;
    setPremiumInspectorCollapsed(!hasFocus);
  }, [
    premiumSpatialEditor,
    editorLayoutNarrow,
    configuracionMapEditorLayout,
    editingZones,
    selectedIds.length,
    roomsAssistantGuideVisible,
  ]);

  useEffect(() => {
    if (!configuracionMapEditorLayout || !premiumSpatialEditor) return;
    const draft = readRoomsAssistantDraft();
    if (draft && !isRoomsAssistantGuideDismissed()) {
      setRoomsAssistantGuideVisible(true);
      setPremiumInspectorCollapsed(false);
    }
  }, [configuracionMapEditorLayout, premiumSpatialEditor]);

  const requestStructureAtMapCenter = useCallback(
    (planType: PlanElementType) => {
      setEditingZones(false);
      setActiveCreateType(planType);
      placementSeqRef.current += 1;
      setPreferredPlacementMapPoint(null);
      setPlacementRequest({
        id: placementSeqRef.current,
        planType,
      });
    },
    [],
  );

  const [nameDraft, setNameDraft] = useState("");
  const [dimDraft, setDimDraft] = useState({
    w: "",
    h: "",
    x: "",
    y: "",
  });

  const [zoneDraft, setZoneDraft] = useState({
    name: "",
    color: "",
    x: "",
    y: "",
    width: "",
    height: "",
  });

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const replaceElementsHistory = useCallback((els: FloorElement[]) => {
    const snap = cloneElementList(els);
    const nh = [snap];
    setHistory(nh);
    historyRef.current = nh;
    setHistoryIndex(0);
    historyIndexRef.current = 0;
  }, []);

  const pushHistory = useCallback((nextElements: FloorElement[]) => {
    const snap = cloneElementList(nextElements);
    const prevHist = historyRef.current;
    const idx = historyIndexRef.current;
    const cut = prevHist.slice(0, idx + 1);
    let nh = [...cut, snap];
    if (nh.length > MAX_ELEMENT_HISTORY) nh = nh.slice(-MAX_ELEMENT_HISTORY);
    const newIdx = nh.length - 1;
    historyIndexRef.current = newIdx;
    historyRef.current = nh;
    setHistory(nh);
    setHistoryIndex(newIdx);
  }, []);

  const commitElements = useCallback(
    (
      nextOrUpdater:
        | FloorElement[]
        | ((prev: FloorElement[]) => FloorElement[]),
    ) => {
      setElementsBase((prev) => {
        const next =
          typeof nextOrUpdater === "function"
            ? nextOrUpdater(prev)
            : nextOrUpdater;
        pushHistory(next);
        return next;
      });
    },
    [pushHistory],
  );

  const setElementsNoHistory = useCallback(
    (
      nextOrUpdater:
        | FloorElement[]
        | ((prev: FloorElement[]) => FloorElement[]),
    ) => {
      setElementsBase(nextOrUpdater);
    },
    [],
  );

  const undo = useCallback(() => {
    setHistoryIndex((idx) => {
      if (idx <= 0) return idx;
      const newIdx = idx - 1;
      const h = historyRef.current;
      const snap = h[newIdx];
      if (!snap) return idx;
      const els = cloneElementList(snap);
      setElementsBase(els);
      historyIndexRef.current = newIdx;
      setSelectedIds((ids) =>
        ids.filter((id) =>
          els.some((e) => String(e.id).trim() === String(id).trim()),
        ),
      );
      return newIdx;
    });
  }, []);

  const redo = useCallback(() => {
    setHistoryIndex((idx) => {
      const h = historyRef.current;
      if (idx >= h.length - 1) return idx;
      const newIdx = idx + 1;
      const snap = h[newIdx];
      if (!snap) return idx;
      const els = cloneElementList(snap);
      setElementsBase(els);
      historyIndexRef.current = newIdx;
      setSelectedIds((ids) =>
        ids.filter((id) =>
          els.some((e) => String(e.id).trim() === String(id).trim()),
        ),
      );
      return newIdx;
    });
  }, []);

  const resetFromLoaded = useCallback(() => {
    const snap = cloneElementList(loadedElements);
    setElementsBase(snap);
    replaceElementsHistory(loadedElements);
    setZones(loadedZones);
    setSelectedIds([]);
    setSelectedZoneId(null);
    setEditingZones(false);
    setHasUnsavedChanges(false);
  }, [loadedElements, loadedZones, replaceElementsHistory]);

  const refreshElements = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured) {
      setLoadedElements([]);
      setElementsBase([]);
      replaceElementsHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await getTables(restaurantId);
      const filtered = list.filter((t) => t.isActive !== false);
      setLoadedElements(filtered);
      const snap = cloneElementList(filtered);
      setElementsBase(snap);
      replaceElementsHistory(filtered);
      setHasUnsavedChanges(false);
    } catch {
      setLoadedElements([]);
      setElementsBase([]);
      replaceElementsHistory([]);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, replaceElementsHistory]);

  useEffect(() => {
    if (!authReady) return;
    void refreshElements();
  }, [authReady, refreshElements]);

  useEffect(() => {
    if (!authReady || !restaurantId || !isFirebaseConfigured) {
      setLoadedZones([]);
      setZones([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await getZones(restaurantId);
        if (cancelled) return;
        setLoadedZones(list);
        setZones(list);
        setHasUnsavedChanges(false);
      } catch {
        if (!cancelled) {
          setLoadedZones([]);
          setZones([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !restaurantId || !isFirebaseConfigured) {
      setFloorPlans([]);
      setSelectedFloorPlanId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await createDefaultFloorPlanIfNeeded(restaurantId);
        const list = await getFloorPlans(restaurantId);
        if (cancelled) return;
        setFloorPlans(list);
        setSelectedFloorPlanId((current) => {
          if (current && list.some((p) => p.id === current)) return current;
          const def = list.find((p) => p.isDefault === true);
          return def?.id ?? list[0]?.id ?? null;
        });
      } catch {
        if (!cancelled) {
          setFloorPlans([]);
          setSelectedFloorPlanId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, restaurantId]);

  const selectedFloorPlanName = useMemo(() => {
    if (!selectedFloorPlanId) return null;
    return (
      floorPlans.find((p) => p.id === selectedFloorPlanId)?.name?.trim() ?? null
    );
  }, [floorPlans, selectedFloorPlanId]);

  const selectedFloorPlan = useMemo(() => {
    if (!selectedFloorPlanId) return null;
    return floorPlans.find((p) => p.id === selectedFloorPlanId) ?? null;
  }, [floorPlans, selectedFloorPlanId]);

  /**
   * Mundo del mapa en config: un solo lienzo lógico para todos los planos (= canvas del plano canónico,
   * igual que al crear un plano nuevo). Así zoom 100 %, ajuste y clamp no dependen del plano seleccionado.
   */
  const mapEditorWorldSize = useMemo(
    () => canvasSizeForNewFloorPlan(floorPlans),
    [floorPlans],
  );

  /**
   * Ancla legacy (mesas/zonas sin `floorPlanId`): mismo id en editor y TPV.
   */
  const legacyFloorPlanAnchorId = useMemo(
    () => legacyUnscopedFloorPlanAnchorId(floorPlans),
    [floorPlans],
  );

  const visibleElements = useMemo(() => {
    if (!selectedFloorPlanId) return [];
    return elements.filter((el) =>
      entityBelongsToFloorPlan(el, selectedFloorPlanId, floorPlans),
    );
  }, [elements, selectedFloorPlanId, floorPlans]);

  const visibleZones = useMemo(() => {
    if (!selectedFloorPlanId) return [];
    return zones.filter((z) =>
      entityBelongsToFloorPlan(z, selectedFloorPlanId, floorPlans),
    );
  }, [zones, selectedFloorPlanId, floorPlans]);

  const buildCurrentFloorPlanSnapshot =
    useCallback((): FloorPlanSnapshotFloorPlan | null => {
      if (!selectedFloorPlan || !selectedFloorPlanId) return null;
      return {
        plan: { ...selectedFloorPlan },
        elements: visibleElements.map((el) => ({ ...el })),
        zones: visibleZones.map((z) => ({ ...z })),
      };
    }, [selectedFloorPlan, selectedFloorPlanId, visibleElements, visibleZones]);

  const refreshPlanFromServer = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured) return;
    await refreshElements();
    try {
      const list = await getZones(restaurantId);
      setLoadedZones(list);
      setZones(list);
      setHasUnsavedChanges(false);
      setSelectedIds([]);
      setSelectedZoneId(null);
    } catch {
      // refreshElements ya sincronizó mesas
    }
  }, [restaurantId, refreshElements]);

  const floorPlanLayouts = useFloorPlanLayouts({
    restaurantId,
    selectedFloorPlanId,
    buildCurrentFloorPlanSnapshot,
    createdBy: user?.uid,
    onAfterActivate: refreshPlanFromServer,
  });

  const canReorderSelectionFront = useMemo(() => {
    if (selectedIds.length < 1) return false;
    const set = new Set(selectedIds.map((s) => String(s).trim()));
    let maxIdx = -1;
    visibleElements.forEach((el, i) => {
      if (set.has(String(el.id).trim())) maxIdx = Math.max(maxIdx, i);
    });
    return maxIdx >= 0 && maxIdx < visibleElements.length - 1;
  }, [selectedIds, visibleElements]);

  const canReorderSelectionBack = useMemo(() => {
    if (selectedIds.length < 1) return false;
    const set = new Set(selectedIds.map((s) => String(s).trim()));
    let minIdx = Number.POSITIVE_INFINITY;
    visibleElements.forEach((el, i) => {
      if (set.has(String(el.id).trim())) minIdx = Math.min(minIdx, i);
    });
    return Number.isFinite(minIdx) && minIdx > 0;
  }, [selectedIds, visibleElements]);

  const tablesCountInSelectedZone = useMemo(() => {
    if (!selectedZoneId) return 0;
    const zid = selectedZoneId.trim();
    let n = 0;
    for (const el of elements) {
      if (el.type !== "table") continue;
      const ez = typeof el.zoneId === "string" ? el.zoneId.trim() : "";
      if (ez === zid) n++;
    }
    return n;
  }, [elements, selectedZoneId]);

  const [mapFitNonce, setMapFitNonce] = useState(0);
  const prevVisibleCountRef = useRef(-1);

  /** Al cambiar de plano: selección y cámara no deben “arrastrar” el contexto visual anterior. */
  useEffect(() => {
    if (!selectedFloorPlanId) return;
    setSelectedIds([]);
    setSelectedZoneId(null);
    setEditingZones(false);
    setSelectionScreenRect(null);
    setZoneHudScreenRect(null);
    setPlacementRequest(null);
    setPreferredPlacementMapPoint(null);
    setZoneHighlight("all");
    setMapFitNonce((n) => n + 1);
    const raf = requestAnimationFrame(() => {
      mapViewportControlsRef.current?.fitToViewport();
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedFloorPlanId]);

  useEffect(() => {
    if (!premiumSpatialEditor) return;
    const n = visibleElements.length;
    if (prevVisibleCountRef.current === 0 && n > 0) {
      setMapFitNonce((c) => c + 1);
    }
    prevVisibleCountRef.current = n;
  }, [premiumSpatialEditor, visibleElements.length]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onClickCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      const ok = window.confirm("Tienes cambios sin guardar. ¿Salir igualmente?");
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [hasUnsavedChanges]);

  const selectedZone = useMemo(() => {
    if (!selectedZoneId) return null;
    return visibleZones.find((z) => z.id === selectedZoneId) ?? null;
  }, [visibleZones, selectedZoneId]);

  useEffect(() => {
    if (!selectedZone) {
      setZoneDraft({
        name: "",
        color: "",
        x: "",
        y: "",
        width: "",
        height: "",
      });
      return;
    }
    setZoneDraft({
      name: selectedZone.name ?? "",
      color: selectedZone.color ?? "",
      x:
        typeof selectedZone.x === "number" && Number.isFinite(selectedZone.x)
          ? String(selectedZone.x)
          : "",
      y:
        typeof selectedZone.y === "number" && Number.isFinite(selectedZone.y)
          ? String(selectedZone.y)
          : "",
      width:
        typeof selectedZone.width === "number" &&
        Number.isFinite(selectedZone.width)
          ? String(selectedZone.width)
          : "",
      height:
        typeof selectedZone.height === "number" &&
        Number.isFinite(selectedZone.height)
          ? String(selectedZone.height)
          : "",
    });
  }, [selectedZone]);

  const selectedElement = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    const only = String(selectedIds[0]).trim();
    return elements.find((el) => String(el.id).trim() === only) ?? null;
  }, [elements, selectedIds]);

  const handleSelectElement = useCallback(
    (id: string, modifiers?: { shiftKey?: boolean }) => {
      const tid = String(id).trim();
      const el = elements.find((e) => String(e.id).trim() === tid);
      if (el) {
        const def = getDefaultSizeForPlanElementType(el.type);
        const ew = el.width ?? def.width;
        const eh = el.height ?? def.height;
        lastMapInteractionRef.current = {
          x: (el.x ?? 0) + ew / 2,
          y: (el.y ?? 0) + eh / 2,
        };
      }
      if (modifiers?.shiftKey) {
        setSelectedIds((prev) => {
          const trimmed = prev.map((p) => String(p).trim());
          const i = trimmed.indexOf(tid);
          if (i >= 0) {
            return prev.filter((_, idx) => idx !== i);
          }
          return [...prev, tid];
        });
      } else {
        setSelectedIds([tid]);
      }
    },
    [elements],
  );

  const handleRenameElement = useCallback((id: string, newName: string) => {
    const tid = String(id).trim();
    commitElements((prev) =>
      prev.map((el) =>
        String(el.id).trim() === tid ? { ...el, name: newName } : el,
      ),
    );
    setHasUnsavedChanges(true);
  }, [commitElements]);

  const selectedElementIndex = useMemo(() => {
    if (!selectedElement) return -1;
    return elements.findIndex(
      (el) => String(el.id).trim() === String(selectedElement.id).trim(),
    );
  }, [elements, selectedElement]);

  const showSideInspector = useMemo(() => {
    if (configuracionMapEditorLayout && premiumSpatialEditor) return true;
    return editingZones || selectedIds.length > 0;
  }, [
    configuracionMapEditorLayout,
    premiumSpatialEditor,
    editingZones,
    selectedIds,
  ]);

  useEffect(() => {
    if (!selectedElement) {
      setNameDraft("");
      setDimDraft({ w: "", h: "", x: "", y: "" });
      setCfgInspectorAdvancedOpen(false);
      return;
    }
    const def = getDefaultSizeForPlanElementType(selectedElement.type);
    setNameDraft(selectedElement.name ?? "");
    setDimDraft({
      w: String(selectedElement.width ?? def.width),
      h: String(selectedElement.height ?? def.height),
      x: String(selectedElement.x ?? 0),
      y: String(selectedElement.y ?? 0),
    });
  }, [selectedElement]);

  const zoneWithRectForPoint = useCallback(
    (x: number, y: number) => {
      let best: Zone | null = null;
      let bestArea = Number.POSITIVE_INFINITY;
      for (const z of visibleZones) {
        if (
          typeof z.x !== "number" ||
          typeof z.y !== "number" ||
          typeof z.width !== "number" ||
          typeof z.height !== "number" ||
          !Number.isFinite(z.x) ||
          !Number.isFinite(z.y) ||
          !Number.isFinite(z.width) ||
          !Number.isFinite(z.height)
        ) {
          continue;
        }
        const within =
          x >= z.x &&
          y >= z.y &&
          x <= z.x + z.width &&
          y <= z.y + z.height;
        if (!within) continue;
        const area = z.width * z.height;
        if (area < bestArea) {
          bestArea = area;
          best = z;
        }
      }
      return best;
    },
    [visibleZones],
  );

  const persistElementZoneFromLayout = useCallback(
    async (id: string, x: number, y: number, width: number, height: number) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      const cx = x + width / 2;
      const cy = y + height / 2;
      const z = zoneWithRectForPoint(cx, cy);
      setElementsNoHistory((prev) =>
        prev.map((el) =>
          el.id === id
            ? z
              ? { ...el, zoneId: z.id, zoneName: z.name, zone: z.name }
              : {
                  ...el,
                  zoneId: undefined,
                  zoneName: undefined,
                  zone: undefined,
                }
            : el,
        ),
      );
    },
    [restaurantId, zoneWithRectForPoint, editingZones, setElementsNoHistory],
  );

  type AlignMode = "left" | "centerH" | "right" | "top" | "centerV" | "bottom";

  const alignSelectedElements = useCallback(
    (mode: AlignMode) => {
      if (editingZones) return;
      if (selectedIds.length < 2) return;
      const refSid = String(selectedIds[0]).trim();
      const restSids = selectedIds.slice(1).map((s) => String(s).trim());
      const floorW = mapEditorWorldSize.width;
      const floorH = mapEditorWorldSize.height;

      const persistLater: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }[] = [];

      commitElements((prev) => {
        const ref = prev.find((el) => String(el.id).trim() === refSid);
        if (!ref) return prev;

        const refDef = getDefaultSizeForPlanElementType(ref.type);
        const rx = ref.x ?? 0;
        const ry = ref.y ?? 0;
        const rw = ref.width ?? refDef.width;
        const rh = ref.height ?? refDef.height;

        persistLater.length = 0;

        return prev.map((el) => {
          const id = String(el.id).trim();
          if (id === refSid) return el;
          if (!restSids.includes(id)) return el;
          if (el.locked === true) return el;

          const def = getDefaultSizeForPlanElementType(el.type);
          const w = el.width ?? def.width;
          const h = el.height ?? def.height;
          let nx = el.x ?? 0;
          let ny = el.y ?? 0;

          switch (mode) {
            case "left":
              nx = rx;
              break;
            case "centerH":
              nx = rx + rw / 2 - w / 2;
              break;
            case "right":
              nx = rx + rw - w;
              break;
            case "top":
              ny = ry;
              break;
            case "centerV":
              ny = ry + rh / 2 - h / 2;
              break;
            case "bottom":
              ny = ry + rh - h;
              break;
            default:
              break;
          }

          nx = snapToGrid(nx);
          ny = snapToGrid(ny);
          if (floorW > 0 && floorH > 0) {
            nx = clamp(nx, -w / 2, floorW - w / 2);
            ny = clamp(ny, -h / 2, floorH - h / 2);
          }

          persistLater.push({ id: el.id, x: nx, y: ny, w, h });
          return { ...el, x: nx, y: ny };
        });
      });

      for (const p of persistLater) {
        void persistElementZoneFromLayout(p.id, p.x, p.y, p.w, p.h);
      }

      setHasUnsavedChanges(true);
    },
    [
      selectedIds,
      editingZones,
      persistElementZoneFromLayout,
      commitElements,
      mapEditorWorldSize.width,
      mapEditorWorldSize.height,
    ],
  );

  const distributeSelectedElements = useCallback(
    (axis: "horizontal" | "vertical") => {
      if (editingZones) return;
      if (selectedIds.length < 3) return;
      const floorW = mapEditorWorldSize.width;
      const floorH = mapEditorWorldSize.height;

      const persistLater: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }[] = [];

      commitElements((prev) => {
        persistLater.length = 0;
        const trimmed = selectedIds.map((s) => String(s).trim());
        const sel = trimmed
          .map((id) => prev.find((e) => String(e.id).trim() === id))
          .filter((e): e is FloorElement => Boolean(e));
        if (sel.length < 3) return prev;

        const sorted =
          axis === "horizontal"
            ? [...sel].sort((a, b) => (a.x ?? 0) - (b.x ?? 0))
            : [...sel].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

        const n = sorted.length;
        const start =
          axis === "horizontal" ? sorted[0].x ?? 0 : sorted[0].y ?? 0;
        const end =
          axis === "horizontal"
            ? sorted[n - 1].x ?? 0
            : sorted[n - 1].y ?? 0;
        const spacing = (end - start) / (n - 1);

        const updates = new Map<string, { nx?: number; ny?: number }>();
        sorted.forEach((el, i) => {
          if (el.locked === true) return;
          const key = String(el.id).trim();
          const v = start + i * spacing;
          if (axis === "horizontal") updates.set(key, { nx: v });
          else updates.set(key, { ny: v });
        });

        return prev.map((el) => {
          const id = String(el.id).trim();
          const u = updates.get(id);
          if (!u) return el;

          const def = getDefaultSizeForPlanElementType(el.type);
          const w = el.width ?? def.width;
          const h = el.height ?? def.height;
          let nx = el.x ?? 0;
          let ny = el.y ?? 0;

          if (u.nx !== undefined) {
            nx = snapToGrid(u.nx);
            if (floorW > 0) nx = clamp(nx, -w / 2, floorW - w / 2);
          }
          if (u.ny !== undefined) {
            ny = snapToGrid(u.ny);
            if (floorH > 0) ny = clamp(ny, -h / 2, floorH - h / 2);
          }

          persistLater.push({ id: el.id, x: nx, y: ny, w, h });
          return { ...el, x: nx, y: ny };
        });
      });

      for (const p of persistLater) {
        void persistElementZoneFromLayout(p.id, p.x, p.y, p.w, p.h);
      }

      setHasUnsavedChanges(true);
    },
    [
      selectedIds,
      editingZones,
      persistElementZoneFromLayout,
      commitElements,
      mapEditorWorldSize.width,
      mapEditorWorldSize.height,
    ],
  );

  const handleMove = useCallback(
    async (id: string, x: number, y: number) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      const floorW = mapEditorWorldSize.width;
      const floorH = mapEditorWorldSize.height;
      const moved = elements.find((el) => el.id === id);
      if (moved && floorW > 0 && floorH > 0) {
        const def = getDefaultSizeForPlanElementType(moved.type);
        const w = moved.width ?? def.width;
        const h = moved.height ?? def.height;
        x = clamp(x, -w / 2, floorW - w / 2);
        y = clamp(y, -h / 2, floorH - h / 2);
      }
      commitElements((prev) =>
        prev.map((el) => (el.id === id ? { ...el, x, y } : el)),
      );
      if (moved) {
        const def = getDefaultSizeForPlanElementType(moved.type);
        const w = moved.width ?? def.width;
        const h = moved.height ?? def.height;
        void persistElementZoneFromLayout(id, x, y, w, h);
      }
      setHasUnsavedChanges(true);
    },
    [
      restaurantId,
      editingZones,
      elements,
      persistElementZoneFromLayout,
      commitElements,
      mapEditorWorldSize.width,
      mapEditorWorldSize.height,
    ],
  );

  const handleMoveMany = useCallback(
    async (updates: { id: string; x: number; y: number }[]) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      if (updates.length === 0) return;
      const floorW = mapEditorWorldSize.width;
      const floorH = mapEditorWorldSize.height;

      const nextCoords = new Map(
        updates.map((u) => [String(u.id).trim(), { x: u.x, y: u.y }] as const),
      );

      commitElements((prev) =>
        prev.map((el) => {
          const key = String(el.id).trim();
          const p = nextCoords.get(key);
          if (!p) return el;
          let x = p.x;
          let y = p.y;
          if (floorW > 0 && floorH > 0) {
            const def = getDefaultSizeForPlanElementType(el.type);
            const w = el.width ?? def.width;
            const h = el.height ?? def.height;
            x = clamp(x, -w / 2, floorW - w / 2);
            y = clamp(y, -h / 2, floorH - h / 2);
          }
          return { ...el, x, y };
        }),
      );

      for (const u of updates) {
        const moved = elements.find(
          (el) => String(el.id).trim() === String(u.id).trim(),
        );
        if (!moved) continue;
        const key = String(u.id).trim();
        const p = nextCoords.get(key);
        if (!p) continue;
        const def = getDefaultSizeForPlanElementType(moved.type);
        const w = moved.width ?? def.width;
        const h = moved.height ?? def.height;
        let x = p.x;
        let y = p.y;
        if (floorW > 0 && floorH > 0) {
          x = clamp(x, -w / 2, floorW - w / 2);
          y = clamp(y, -h / 2, floorH - h / 2);
        }
        void persistElementZoneFromLayout(moved.id, x, y, w, h);
      }
      setHasUnsavedChanges(true);
    },
    [
      restaurantId,
      editingZones,
      elements,
      persistElementZoneFromLayout,
      commitElements,
      mapEditorWorldSize.width,
      mapEditorWorldSize.height,
    ],
  );

  const handleResize = useCallback(
    async (id: string, width: number, height: number) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      const el = elements.find((e) => e.id === id);
      const mins = minSizeForPlanType(el?.type ?? "table");
      width = Math.max(mins.w, Math.round(width));
      height = Math.max(mins.h, Math.round(height));
      commitElements((prev) =>
        prev.map((it) => (it.id === id ? { ...it, width, height } : it)),
      );
      setHasUnsavedChanges(true);
    },
    [restaurantId, editingZones, elements, commitElements],
  );

  const createFloorElement = useCallback(
    async (
      type: PlanElementType,
      x: number,
      y: number,
      opts?: {
        id?: string;
        name?: string;
        width?: number;
        height?: number;
        tableShape?: FloorElement["tableShape"];
        seats?: number;
        zoneId?: string;
        zoneName?: string;
        zone?: string;
        /** Asignar plano sin depender del `selectedFloorPlanId` del render (p. ej. escenario base). */
        floorPlanId?: string;
      },
    ) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      if (type === "custom") return;
      const ref =
        typeof opts?.id === "string" && opts.id.trim()
          ? doc(db, "tables", opts.id.trim())
          : doc(collection(db, "tables"));
      const defSz = getDefaultSizeForPlanElementType(type);
      const w = opts?.width ?? defSz.width;
      const h = opts?.height ?? defSz.height;
      const cx = Math.round(x) + w / 2;
      const cy = Math.round(y) + h / 2;
      const zFromOpts =
        typeof opts?.zoneId === "string" &&
        opts.zoneId.trim() &&
        typeof opts?.zoneName === "string" &&
        opts.zoneName.trim()
          ? {
              zoneId: opts.zoneId.trim(),
              zoneName: opts.zoneName.trim(),
              zone:
                typeof opts.zone === "string" && opts.zone.trim()
                  ? opts.zone.trim()
                  : opts.zoneName.trim(),
            }
          : null;
      const zHit = zFromOpts ? null : zoneWithRectForPoint(cx, cy);
      commitElements((prev) => {
        const name = opts?.name?.trim() ? opts.name.trim() : getNextElementName(type, prev);
        const created: FloorElement = {
          id: ref.id,
          restaurantId,
          name,
          type,
          status: TABLE_MAP_STATUS_FREE,
          ...(zFromOpts
            ? zFromOpts
            : zHit
              ? { zoneId: zHit.id, zoneName: zHit.name, zone: zHit.name }
              : {}),
          ...(typeof opts?.floorPlanId === "string" && opts.floorPlanId.trim()
            ? { floorPlanId: opts.floorPlanId.trim() }
            : selectedFloorPlanId
              ? { floorPlanId: selectedFloorPlanId }
              : {}),
          tableShape: opts?.tableShape ?? "square",
          seats:
            opts?.seats ??
            (isDecorativePlanElementType(type) ? 0 : 4),
          x: Math.round(x),
          y: Math.round(y),
          width: w,
          height: h,
          isActive: true,
        };
        return [...prev, created];
      });
      setSelectedIds([ref.id]);
      setHasUnsavedChanges(true);
    },
    [
      restaurantId,
      isFirebaseConfigured,
      editingZones,
      zoneWithRectForPoint,
      commitElements,
      selectedFloorPlanId,
    ],
  );

  const handleCreateZoneVisual = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured) return;
    if (!selectedFloorPlanId?.trim()) {
      setAreaTemplateFeedback("Crea o selecciona un plano antes de crear zonas");
      window.setTimeout(() => {
        setAreaTemplateFeedback(null);
      }, 2400);
      return;
    }
    if (visibleZones.length === 0) return;
    const preferred =
      zoneHighlight !== "all" && zoneHighlight !== "unassigned"
        ? zoneHighlight
        : visibleZones[0]?.id;
    const zoneId = preferred ? String(preferred).trim() : "";
    const zone = visibleZones.find((z) => z.id === zoneId) ?? visibleZones[0]!;
    if (
      typeof zone.x === "number" &&
      typeof zone.y === "number" &&
      typeof zone.width === "number" &&
      typeof zone.height === "number" &&
      Number.isFinite(zone.x) &&
      Number.isFinite(zone.y) &&
      Number.isFinite(zone.width) &&
      Number.isFinite(zone.height)
    ) {
      setSelectedZoneId(zone.id);
      setEditingZones(true);
      return;
    }
    setZones((prev) =>
      prev.map((z) =>
        z.id === zone.id ? { ...z, x: 40, y: 40, width: 320, height: 220 } : z,
      ),
    );
    setSelectedZoneId(zone.id);
    setEditingZones(true);
    setHasUnsavedChanges(true);
  }, [restaurantId, selectedFloorPlanId, visibleZones, zoneHighlight]);

  const handleApplyAreaTemplate = useCallback(
    async (t: AreaQuickTemplate) => {
      if (!premiumSpatialEditor) return;
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones || areaTemplateBusy) return;
      const planId = selectedFloorPlanId?.trim();
      if (!planId) {
        setAreaTemplateFeedback("Crea o selecciona un plano antes de crear zonas");
        window.setTimeout(() => {
          setAreaTemplateFeedback(null);
        }, 2400);
        return;
      }
      const uniqueName = nextUniqueZoneBaseName(t.baseName, visibleZones);
      const { x, y } = suggestNewZonePosition(visibleZones, t.width, t.height);
      const zoneColor = defaultZoneColorForTemplate(t.key as AreaTemplateKey);
      const previewId = `area-preview-${Date.now()}`;
      const previewZone: Zone = {
        id: previewId,
        restaurantId,
        floorPlanId: planId,
        name: uniqueName,
        x,
        y,
        width: t.width,
        height: t.height,
        color: zoneColor,
      };
      setAreaTemplateBusy(true);
      setAreaTemplateFeedback(`Creando zona ${uniqueName}`);
      setSelectedIds([]);
      setSelectedZoneId(previewId);
      setZoneHighlight(previewId);
      setEditingZones(true);
      setZones((prev) => sortZonesByName([...prev, previewZone]));
      try {
        const zoneId = await createZone(restaurantId, uniqueName, zoneColor, {
          floorPlanId: planId,
          x,
          y,
          width: t.width,
          height: t.height,
        });
        const newZone: Zone = {
          id: zoneId,
          restaurantId,
          floorPlanId: planId,
          name: uniqueName,
          x,
          y,
          width: t.width,
          height: t.height,
          color: zoneColor,
        };
        setZones((prev) => {
          let replaced = false;
          const next = prev.map((z) => {
            if (z.id !== previewId) return z;
            replaced = true;
            return newZone;
          });
          return sortZonesByName(replaced ? next : [...next, newZone]);
        });
        setLoadedZones((prev) =>
          sortZonesByName([...prev.filter((z) => z.id !== zoneId), newZone]),
        );
        const pieces = getAreaTemplateFurniture(t.key as AreaTemplateKey, {
          x,
          y,
          width: t.width,
          height: t.height,
        });
        for (const p of pieces) {
          await createFloorElement(p.type, p.x, p.y, {
            name: p.name,
            width: p.width,
            height: p.height,
            seats: p.seats,
            tableShape: p.tableShape,
            zoneId,
            zoneName: uniqueName,
            zone: uniqueName,
            floorPlanId: planId,
          });
        }
        setSelectedZoneId(zoneId);
        setZoneHighlight(zoneId);
        setAreaTemplateFeedback(`Zona ${uniqueName} lista. Arrástrala o redimensiónala.`);
      } catch (error) {
        console.error("[MAP_EDITOR] area template failed", error);
        const detail = error instanceof Error ? error.message : String(error);
        setZones((prev) => prev.filter((z) => z.id !== previewId));
        setSelectedZoneId(null);
        setZoneHighlight("all");
        setEditingZones(false);
        setAreaTemplateFeedback(`No se pudo crear la zona: ${detail}`);
      } finally {
        setAreaTemplateBusy(false);
        window.setTimeout(() => {
          setAreaTemplateFeedback(null);
        }, 2200);
      }
    },
    [
      premiumSpatialEditor,
      restaurantId,
      isFirebaseConfigured,
      editingZones,
      areaTemplateBusy,
      zones,
      visibleZones,
      selectedFloorPlanId,
      createFloorElement,
    ],
  );

  const handleMoveZone = useCallback(
    async (zoneId: string, x: number, y: number) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      setZones((prev) =>
        prev.map((z) => (z.id === zoneId ? { ...z, x, y } : z)),
      );
      setHasUnsavedChanges(true);
    },
    [restaurantId],
  );

  const handleResizeZone = useCallback(
    async (zoneId: string, width: number, height: number) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      setZones((prev) =>
        prev.map((z) => (z.id === zoneId ? { ...z, width, height } : z)),
      );
      setHasUnsavedChanges(true);
    },
    [restaurantId],
  );

  const persistZoneFields = useCallback(async () => {
    if (!selectedZone || !restaurantId || !isFirebaseConfigured) return;
    const name = zoneDraft.name.trim();
    if (!name) return;
    const color = zoneDraft.color.trim() || null;
    const x = Number.parseFloat(zoneDraft.x);
    const y = Number.parseFloat(zoneDraft.y);
    const width = Number.parseFloat(zoneDraft.width);
    const height = Number.parseFloat(zoneDraft.height);
    const updates: Parameters<typeof updateZone>[1] = { name, color };
    if ([x, y, width, height].every((n) => Number.isFinite(n))) {
      updates.x = Math.round(x);
      updates.y = Math.round(y);
      updates.width = Math.round(width);
      updates.height = Math.round(height);
    }
    setZones((prev) =>
      prev.map((z) =>
        z.id === selectedZone.id
          ? {
              ...z,
              name,
              color: color ?? undefined,
              ...(updates.x != null ? { x: updates.x as number } : {}),
              ...(updates.y != null ? { y: updates.y as number } : {}),
              ...(updates.width != null ? { width: updates.width as number } : {}),
              ...(updates.height != null ? { height: updates.height as number } : {}),
            }
          : z,
      ),
    );
    setHasUnsavedChanges(true);
  }, [selectedZone, restaurantId, zoneDraft]);

  const handleDeleteZoneVisual = useCallback(async () => {
    if (!selectedZone || !restaurantId || !isFirebaseConfigured) return;
    if (!window.confirm("¿Eliminar esta zona visual?")) return;
    setZones((prev) =>
      prev.map((z) =>
        z.id === selectedZone.id
          ? {
              ...z,
              x: undefined,
              y: undefined,
              width: undefined,
              height: undefined,
            }
          : z,
      ),
    );
    setSelectedZoneId(null);
    setHasUnsavedChanges(true);
  }, [selectedZone, restaurantId]);

  const persistName = useCallback(async () => {
    if (!selectedElement || !restaurantId || !isFirebaseConfigured) return;
    const name = nameDraft.trim() || selectedElement.name;
    const previous = (selectedElement.name ?? "").trim();
    commitElements((prev) =>
      prev.map((el) => (el.id === selectedElement.id ? { ...el, name } : el)),
    );
    setHasUnsavedChanges(true);
    if (
      configuracionMapEditorLayout &&
      premiumSpatialEditor &&
      name.trim() !== previous
    ) {
      flashCfgMapFeedback("Nombre actualizado");
    }
  }, [
    selectedElement,
    nameDraft,
    restaurantId,
    commitElements,
    configuracionMapEditorLayout,
    premiumSpatialEditor,
    flashCfgMapFeedback,
  ]);

  const persistSeats = useCallback(
    (seats: number) => {
      if (!selectedElement || !restaurantId || !isFirebaseConfigured) return;
      if (selectedElement.type !== "table") return;
      if ((selectedElement.seats ?? 4) === seats) return;
      commitElements((prev) =>
        prev.map((el) =>
          el.id === selectedElement.id ? { ...el, seats } : el,
        ),
      );
      setHasUnsavedChanges(true);
      if (configuracionMapEditorLayout && premiumSpatialEditor) {
        flashCfgMapFeedback(`${seats} comensales`);
      }
    },
    [
      selectedElement,
      restaurantId,
      commitElements,
      configuracionMapEditorLayout,
      premiumSpatialEditor,
      flashCfgMapFeedback,
    ],
  );

  const persistDims = useCallback(async () => {
    if (!selectedElement || !restaurantId || !isFirebaseConfigured) return;
    const w = Math.round(Number.parseFloat(dimDraft.w));
    const h = Math.round(Number.parseFloat(dimDraft.h));
    const x = Math.round(Number.parseFloat(dimDraft.x));
    const y = Math.round(Number.parseFloat(dimDraft.y));
    const mins = minSizeForPlanType(selectedElement.type);
    if (
      ![w, h, x, y].every((n) => Number.isFinite(n)) ||
      w < mins.w ||
      h < mins.h
    ) {
      return;
    }
    commitElements((prev) =>
      prev.map((el) =>
        el.id === selectedElement.id ? { ...el, width: w, height: h, x, y } : el,
      ),
    );
    void persistElementZoneFromLayout(selectedElement.id, x, y, w, h);
    setHasUnsavedChanges(true);
  }, [
    selectedElement,
    dimDraft,
    restaurantId,
    persistElementZoneFromLayout,
    commitElements,
  ]);

  const persistZone = useCallback(
    async (zoneIdValue: string) => {
      if (!selectedElement || !restaurantId || !isFirebaseConfigured) return;
      const trimmed = zoneIdValue.trim();
      let nextZoneId: string | undefined;
      let nextZoneName: string | undefined;
      if (!trimmed) {
        nextZoneId = undefined;
        nextZoneName = undefined;
      } else {
        const z = zones.find((zz) => zz.id === trimmed);
        if (!z) return;
        nextZoneId = z.id;
        nextZoneName = z.name;
      }
      if (
        (selectedElement.zoneId ?? "") === (nextZoneId ?? "") &&
        (selectedElement.zoneName ?? "") === (nextZoneName ?? "")
      ) {
        return;
      }
      commitElements((prev) =>
        prev.map((el) =>
          el.id === selectedElement.id
            ? {
                ...el,
                zoneId: nextZoneId,
                zoneName: nextZoneName,
                zone: nextZoneName,
              }
            : el,
        ),
      );
      setHasUnsavedChanges(true);
      if (configuracionMapEditorLayout && premiumSpatialEditor) {
        flashCfgMapFeedback(
          nextZoneName ? `Zona: ${nextZoneName}` : "Sin zona asignada",
        );
      }
    },
    [
      selectedElement,
      restaurantId,
      zones,
      commitElements,
      configuracionMapEditorLayout,
      premiumSpatialEditor,
      flashCfgMapFeedback,
    ],
  );

  const handleDelete = useCallback(async () => {
    if (!selectedElement || !restaurantId || !isFirebaseConfigured) return;
    if (!window.confirm("¿Eliminar este elemento?")) return;
    const label = resolvePlanElementDisplayName(selectedElement);
    commitElements((prev) => prev.filter((el) => el.id !== selectedElement.id));
    setSelectedIds((prevSel) =>
      prevSel.filter(
        (id) => String(id).trim() !== String(selectedElement.id).trim(),
      ),
    );
    setHasUnsavedChanges(true);
    if (configuracionMapEditorLayout && premiumSpatialEditor) {
      flashCfgMapFeedback(`${label} eliminado`);
    }
  }, [
    selectedElement,
    restaurantId,
    commitElements,
    configuracionMapEditorLayout,
    premiumSpatialEditor,
    flashCfgMapFeedback,
  ]);

  const handleBringToFront = useCallback(() => {
    if (!selectedElement) return;
    commitElements((prev) => {
      const idx = prev.findIndex(
        (el) => String(el.id).trim() === String(selectedElement.id).trim(),
      );
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.push(item);
      return next;
    });
    setHasUnsavedChanges(true);
  }, [selectedElement, commitElements]);

  const handleSendToBack = useCallback(() => {
    if (!selectedElement) return;
    commitElements((prev) => {
      const idx = prev.findIndex(
        (el) => String(el.id).trim() === String(selectedElement.id).trim(),
      );
      if (idx <= 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
    setHasUnsavedChanges(true);
  }, [selectedElement, commitElements]);

  const handleBoxSelect = useCallback((ids: string[]) => {
    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const raw of ids) {
      const t = String(raw).trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      uniq.push(t);
    }
    setSelectedIds(uniq);
  }, []);

  const handleBringSelectionToFront = useCallback(() => {
    if (selectedIds.length < 1) return;
    const set = new Set(selectedIds.map((s) => String(s).trim()));
    commitElements((prev) => {
      const picked: FloorElement[] = [];
      const rest: FloorElement[] = [];
      for (const el of prev) {
        if (set.has(String(el.id).trim())) picked.push(el);
        else rest.push(el);
      }
      if (picked.length === 0) return prev;
      return [...rest, ...picked];
    });
    setHasUnsavedChanges(true);
  }, [selectedIds, commitElements]);

  const handleSendSelectionToBack = useCallback(() => {
    if (selectedIds.length < 1) return;
    const set = new Set(selectedIds.map((s) => String(s).trim()));
    commitElements((prev) => {
      const picked: FloorElement[] = [];
      const rest: FloorElement[] = [];
      for (const el of prev) {
        if (set.has(String(el.id).trim())) picked.push(el);
        else rest.push(el);
      }
      if (picked.length === 0) return prev;
      return [...picked, ...rest];
    });
    setHasUnsavedChanges(true);
  }, [selectedIds, commitElements]);

  const handleToggleSelectionLock = useCallback(() => {
    if (selectedIds.length < 1) return;
    const set = new Set(selectedIds.map((s) => String(s).trim()));
    const selEls = elements.filter((el) => set.has(String(el.id).trim()));
    if (selEls.length === 0) return;
    const everyLocked = selEls.every((el) => el.locked === true);
    const nextLocked = !everyLocked;
    commitElements((prev) =>
      prev.map((el) =>
        set.has(String(el.id).trim()) ? { ...el, locked: nextLocked } : el,
      ),
    );
    setHasUnsavedChanges(true);
  }, [selectedIds, elements, commitElements]);

  const handleToggleElementLock = useCallback(() => {
    if (!selectedElement) return;
    const id = String(selectedElement.id).trim();
    commitElements((prev) =>
      prev.map((el) =>
        String(el.id).trim() === id
          ? { ...el, locked: !(el.locked === true) }
          : el,
      ),
    );
    setHasUnsavedChanges(true);
  }, [selectedElement, commitElements]);

  const handleDuplicate = useCallback(async () => {
    if (!selectedElement || !restaurantId || !isFirebaseConfigured) return;
    if (editingZones) return;
    if (selectedElement.type === "custom") {
      return;
    }
    const ref = doc(collection(db, "tables"));
    const def = getDefaultSizeForPlanElementType(selectedElement.type);
    const width = selectedElement.width ?? def.width;
    const height = selectedElement.height ?? def.height;
    const floorW = mapEditorWorldSize.width;
    const floorH = mapEditorWorldSize.height;
    let x = snapToGrid((selectedElement.x ?? 0) + DUPLICATE_OFFSET);
    let y = snapToGrid((selectedElement.y ?? 0) + DUPLICATE_OFFSET);
    if (floorW > 0 && floorH > 0) {
      x = clamp(x, -width / 2, floorW - width / 2);
      y = clamp(y, -height / 2, floorH - height / 2);
    }

    const base = (selectedElement.name || planTypeLabelEs(selectedElement.type)).trim();
    const used = new Set<string>(
      elements.map((e) => (e.name ?? "").trim().toLowerCase()).filter(Boolean),
    );
    let name = `${base} copia`;
    if (used.has(name.toLowerCase())) {
      let i = 2;
      while (i < 9999) {
        const c = `${base} copia ${i}`;
        if (!used.has(c.toLowerCase())) {
          name = c;
          break;
        }
        i++;
      }
    }

    void createFloorElement(selectedElement.type, x, y, {
      id: ref.id,
      name,
      width,
      height,
      tableShape: selectedElement.tableShape ?? "square",
      seats:
        isDecorativePlanElementType(selectedElement.type)
          ? 0
          : (selectedElement.seats ?? 4),
      ...(selectedElement.zoneId && selectedElement.zoneName
        ? {
            zoneId: selectedElement.zoneId,
            zoneName: selectedElement.zoneName,
            zone: selectedElement.zoneName,
          }
        : {}),
    });
    if (configuracionMapEditorLayout && premiumSpatialEditor) {
      flashCfgMapFeedback("Copia creada");
    }
  }, [
    selectedElement,
    restaurantId,
    elements,
    editingZones,
    createFloorElement,
    mapEditorWorldSize.width,
    mapEditorWorldSize.height,
    configuracionMapEditorLayout,
    premiumSpatialEditor,
    flashCfgMapFeedback,
  ]);

  const handleDuplicateSelection = useCallback(() => {
    if (!restaurantId || !isFirebaseConfigured) return;
    if (editingZones) return;
    if (selectedIds.length < 1) return;

    const floorW = mapEditorWorldSize.width;
    const floorH = mapEditorWorldSize.height;

    let cloneCount = 0;

    commitElements((prev) => {
      const clones: FloorElement[] = [];
      let acc = prev;
      const newSelectionIds: string[] = [];

      const sources = selectedIds
        .map((sid) =>
          prev.find((e) => String(e.id).trim() === String(sid).trim()),
        )
        .filter((e): e is FloorElement => !!e && e.type !== "custom");

      if (sources.length === 0) return prev;

      const refEl = sources[0];
      const baseX = refEl.x ?? 0;
      const baseY = refEl.y ?? 0;
      const ddx = snapToGrid(baseX + DUPLICATE_OFFSET) - baseX;
      const ddy = snapToGrid(baseY + DUPLICATE_OFFSET) - baseY;

      for (const source of sources) {
        const ref = doc(collection(db, "tables"));
        const def = getDefaultSizeForPlanElementType(source.type);
        const w = source.width ?? def.width;
        const h = source.height ?? def.height;
        let nx = snapToGrid((source.x ?? 0) + ddx);
        let ny = snapToGrid((source.y ?? 0) + ddy);
        if (floorW > 0 && floorH > 0) {
          nx = clamp(nx, -w / 2, floorW - w / 2);
          ny = clamp(ny, -h / 2, floorH - h / 2);
        }

        const name = getNextElementName(
          source.type,
          acc.map((e) => ({ type: e.type, name: e.name })),
        );

        const clone: FloorElement = {
          id: ref.id,
          restaurantId,
          name,
          type: source.type,
          status: TABLE_MAP_STATUS_FREE,
          ...(source.zoneId && source.zoneName
            ? {
                zoneId: source.zoneId,
                zoneName: source.zoneName,
                zone: source.zoneName,
              }
            : {}),
          ...(selectedFloorPlanId
            ? { floorPlanId: selectedFloorPlanId }
            : {}),
          tableShape: source.tableShape ?? "square",
          seats:
            isDecorativePlanElementType(source.type)
              ? 0
              : (source.seats ?? 4),
          x: nx,
          y: ny,
          width: w,
          height: h,
          isActive: true,
          locked: false,
        };

        clones.push(clone);
        newSelectionIds.push(ref.id);
        acc = [...acc, clone];
      }

      cloneCount = clones.length;
      if (clones.length === 0) return prev;

      queueMicrotask(() => {
        setSelectedIds(newSelectionIds);
      });

      return [...prev, ...clones];
    });

    if (cloneCount > 0) setHasUnsavedChanges(true);
  }, [
    selectedIds,
    restaurantId,
    editingZones,
    commitElements,
    selectedFloorPlanId,
    mapEditorWorldSize.width,
    mapEditorWorldSize.height,
  ]);

  const copySelectionToClipboard = useCallback(() => {
    if (selectedIds.length === 0) return;
    const sel = new Set(selectedIds.map((id) => String(id).trim()));
    const picked = elements.filter((el) => {
      const id = String(el.id).trim();
      if (!sel.has(id)) return false;
      return el.type !== "custom";
    });
    if (picked.length === 0) return;
    setClipboardElements(cloneElementList(picked));
  }, [selectedIds, elements]);

  const pasteFromClipboard = useCallback(() => {
    if (!restaurantId || !isFirebaseConfigured) return;
    if (editingZones) return;
    if (!clipboardElements || clipboardElements.length === 0) return;

    const floorW = mapEditorWorldSize.width;
    const floorH = mapEditorWorldSize.height;

    let cloneCount = 0;

    commitElements((prev) => {
      const clones: FloorElement[] = [];
      let acc = prev;
      const newSelectionIds: string[] = [];

      for (const source of clipboardElements) {
        if (source.type === "custom") {
          continue;
        }

        const ref = doc(collection(db, "tables"));
        const def = getDefaultSizeForPlanElementType(source.type);
        const w = source.width ?? def.width;
        const h = source.height ?? def.height;
        let nx = snapToGrid((source.x ?? 0) + OFFSET);
        let ny = snapToGrid((source.y ?? 0) + OFFSET);
        if (floorW > 0 && floorH > 0) {
          nx = clamp(nx, -w / 2, floorW - w / 2);
          ny = clamp(ny, -h / 2, floorH - h / 2);
        }

        const name = getNextElementName(
          source.type,
          acc.map((e) => ({ type: e.type, name: e.name })),
        );

        const clone: FloorElement = {
          id: ref.id,
          restaurantId,
          name,
          type: source.type,
          status: TABLE_MAP_STATUS_FREE,
          ...(source.zoneId && source.zoneName
            ? {
                zoneId: source.zoneId,
                zoneName: source.zoneName,
                zone: source.zoneName,
              }
            : {}),
          ...(selectedFloorPlanId
            ? { floorPlanId: selectedFloorPlanId }
            : {}),
          tableShape: source.tableShape ?? "square",
          seats:
            isDecorativePlanElementType(source.type)
              ? 0
              : (source.seats ?? 4),
          x: nx,
          y: ny,
          width: w,
          height: h,
          isActive: true,
          locked: false,
        };

        clones.push(clone);
        newSelectionIds.push(ref.id);
        acc = [...acc, clone];
      }

      cloneCount = clones.length;
      if (clones.length === 0) return prev;

      queueMicrotask(() => {
        setSelectedIds(newSelectionIds);
      });

      return [...prev, ...clones];
    });

    if (cloneCount > 0) setHasUnsavedChanges(true);
  }, [
    restaurantId,
    editingZones,
    clipboardElements,
    commitElements,
    selectedFloorPlanId,
    mapEditorWorldSize.width,
    mapEditorWorldSize.height,
  ]);

  const handleDeleteSelection = useCallback(() => {
    if (!restaurantId || !isFirebaseConfigured) return;
    if (editingZones) return;
    if (selectedIds.length < 1) return;
    if (!window.confirm("¿Eliminar los elementos seleccionados?")) return;

    const remove = new Set(selectedIds.map((id) => String(id).trim()));

    commitElements((prev) =>
      prev.filter((el) => !remove.has(String(el.id).trim())),
    );
    setSelectedIds([]);
    setHasUnsavedChanges(true);
  }, [selectedIds, restaurantId, editingZones, commitElements]);

  const handleMoveSelectionToActiveFloorPlan = useCallback(() => {
    if (!selectedFloorPlanId) return;
    if (selectedIds.length < 1) return;
    if (editingZones) return;
    if (!window.confirm("¿Mover los elementos seleccionados a este plano?"))
      return;
    const sel = new Set(selectedIds.map((id) => String(id).trim()));
    commitElements((prev) =>
      prev.map((el) =>
        sel.has(String(el.id).trim())
          ? { ...el, floorPlanId: selectedFloorPlanId }
          : el,
      ),
    );
    setHasUnsavedChanges(true);
  }, [selectedFloorPlanId, selectedIds, editingZones, commitElements]);

  const runPremiumVenueBaseline = useCallback(
    async (floorPlanId: string) => {
      if (!premiumSpatialEditor || !restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      const onPlan = (e: FloorElement) =>
        typeof e.floorPlanId === "string" &&
        e.floorPlanId.trim() === floorPlanId;
      if (elementsRef.current.some(onPlan)) return;
      if (venueBaselineLockRef.current.has(floorPlanId)) return;
      venueBaselineLockRef.current.add(floorPlanId);
      try {
        const allRemoteZones = await getZones(restaurantId);
        let remoteZones = allRemoteZones.filter(
          (z) => z.floorPlanId === floorPlanId,
        );
        if (elementsRef.current.some(onPlan)) return;

        const hasVisibleZone = remoteZones.some(zoneHasVisualRect);
        if (!hasVisibleZone) {
          if (remoteZones.length === 0) {
            const iw = 672;
            const ih = 432;
            const { x: ix, y: iy } = suggestNewZonePosition([], iw, ih);
            const interiorId = await createZone(restaurantId, "Interior", undefined, {
              floorPlanId,
              x: ix,
              y: iy,
              width: iw,
              height: ih,
            });
            const interiorZone: Zone = {
              id: interiorId,
              restaurantId,
              floorPlanId,
              name: "Interior",
              x: ix,
              y: iy,
              width: iw,
              height: ih,
            };
            const twW = 152;
            const twH = Math.max(220, ih - 100);
            const twX = ix + iw + 12;
            const twY = iy + 56;
            const terrazaName = nextUniqueZoneBaseName("Terraza", [interiorZone]);
            const terrazaId = await createZone(restaurantId, terrazaName, undefined, {
              floorPlanId,
              x: twX,
              y: twY,
              width: twW,
              height: twH,
            });
            const terrazaZone: Zone = {
              id: terrazaId,
              restaurantId,
              floorPlanId,
              name: terrazaName,
              x: twX,
              y: twY,
              width: twW,
              height: twH,
            };
            remoteZones = sortZonesByName([interiorZone, terrazaZone]);
            setZones((prev) =>
              sortZonesByName([
                ...prev.filter((z) => z.floorPlanId !== floorPlanId),
                ...remoteZones,
              ]),
            );
            setLoadedZones((prev) =>
              sortZonesByName([
                ...prev.filter((z) => z.floorPlanId !== floorPlanId),
                ...remoteZones,
              ]),
            );
            setZoneHighlight(interiorId);
            setSelectedZoneId(interiorId);
          } else {
            const nm = nextUniqueZoneBaseName("Interior", remoteZones);
            const iw = 664;
            const ih = 420;
            const { x: ix, y: iy } = suggestNewZonePosition(remoteZones, iw, ih);
            const zid = await createZone(restaurantId, nm, undefined, {
              floorPlanId,
              x: ix,
              y: iy,
              width: iw,
              height: ih,
            });
            const nz: Zone = {
              id: zid,
              restaurantId,
              floorPlanId,
              name: nm,
              x: ix,
              y: iy,
              width: iw,
              height: ih,
            };
            const withInterior = [...remoteZones, nz];
            const terrazaName = nextUniqueZoneBaseName("Terraza", withInterior);
            const twW = 148;
            const twH = Math.max(216, ih - 100);
            const twX = ix + iw + 10;
            const twY = iy + 50;
            const terrazaId = await createZone(restaurantId, terrazaName, undefined, {
              floorPlanId,
              x: twX,
              y: twY,
              width: twW,
              height: twH,
            });
            const terrazaZone: Zone = {
              id: terrazaId,
              restaurantId,
              floorPlanId,
              name: terrazaName,
              x: twX,
              y: twY,
              width: twW,
              height: twH,
            };
            remoteZones = sortZonesByName([...remoteZones, nz, terrazaZone]);
            setZones((prev) =>
              sortZonesByName([
                ...prev.filter((z) => z.floorPlanId !== floorPlanId),
                ...remoteZones,
              ]),
            );
            setLoadedZones((prev) =>
              sortZonesByName([
                ...prev.filter((z) => z.floorPlanId !== floorPlanId),
                ...remoteZones,
              ]),
            );
            setZoneHighlight(zid);
            setSelectedZoneId(zid);
          }
        }

        if (elementsRef.current.some(onPlan)) return;

        const interiorPick = pickSeedZoneLayout(remoteZones);
        const rect = interiorPick?.rect ?? DEFAULT_VENUE_SEED_RECT;
        const interiorAttach = interiorPick?.attach ?? null;
        const baseInteriorOpts = {
          floorPlanId: floorPlanId,
          ...(interiorAttach
            ? {
                zoneId: interiorAttach.id,
                zoneName: interiorAttach.name,
                zone: interiorAttach.name,
              }
            : {}),
        };

        const terrazaZ = remoteZones.find(
          (z) =>
            zoneHasVisualRect(z) &&
            z.name.trim().toLowerCase().includes("terraza"),
        );
        const terrazaAttach =
          terrazaZ && zoneHasVisualRect(terrazaZ)
            ? {
                zoneId: terrazaZ.id,
                zoneName: terrazaZ.name,
                zone: terrazaZ.name,
                floorPlanId: floorPlanId,
              }
            : null;
        const terrRect =
          terrazaZ &&
          typeof terrazaZ.x === "number" &&
          typeof terrazaZ.y === "number" &&
          typeof terrazaZ.width === "number" &&
          typeof terrazaZ.height === "number"
            ? {
                x: terrazaZ.x,
                y: terrazaZ.y,
                w: terrazaZ.width,
                h: terrazaZ.height,
              }
            : null;

        const barW = Math.round(
          Math.min(Math.max(240, rect.w * 0.68), rect.w - 32, 596),
        );
        const barH = 74;
        const barX = Math.round(
          rect.x + (rect.w - barW) / 2 + seedJitter(floorPlanId, 0, 5),
        );
        const barY = Math.round(rect.y + 22 + seedJitter(floorPlanId, 0, 6));
        const barCenterX = barX + barW / 2;
        void createFloorElement("bar", barX, barY, {
          ...baseInteriorOpts,
          width: barW,
          height: barH,
        });

        const td = getDefaultSizeForPlanElementType("table");
        const tw = td.width;
        const th = td.height;
        const nearY = barY + barH + 18 + seedJitter(floorPlanId, 2, 1);
        const nearBaseX = [-162, -84, 54, 132];
        for (let i = 0; i < 4; i++) {
          const rowShift = i < 2 ? -6 + i * 10 : 4 + (i - 2) * 12;
          const bx = Math.round(
            barCenterX +
              nearBaseX[i]! -
              tw / 2 +
              seedJitter(floorPlanId, i * 2, 20) +
              (i === 1 || i === 3 ? seedJitter(floorPlanId, i * 2 + 1, 22) : 0),
          );
          const by = Math.round(
            nearY + rowShift + seedJitter(floorPlanId, i * 2 + 1, 21),
          );
          void createFloorElement("table", bx, by, {
            ...baseInteriorOpts,
            tableShape: i % 3 === 1 ? "round" : "square",
            seats: i % 2 === 0 ? 4 : 2,
          });
        }

        const salonY =
          barY +
          barH +
          124 +
          seedJitter(floorPlanId, 3, 2) +
          (Math.abs(seedJitter(floorPlanId, 3, 3)) % 16);
        const salonCx =
          rect.x + rect.w / 2 + seedJitter(floorPlanId, 8, 5);
        const salonLayout = [
          { ox: -108, oy: 2 },
          { ox: 8, oy: 20 },
          { ox: 112, oy: -6 },
        ];
        for (let i = 0; i < 3; i++) {
          const { ox, oy } = salonLayout[i]!;
          const bx = Math.round(
            salonCx + ox - tw / 2 + seedJitter(floorPlanId, i + 10, 11),
          );
          const by = Math.round(salonY + oy + seedJitter(floorPlanId, i + 10, 12));
          void createFloorElement("table", bx, by, {
            ...baseInteriorOpts,
            tableShape: i === 1 ? "round" : "square",
            seats: 6,
          });
        }

        if (terrazaAttach && terrRect) {
          const gapT = 40 + (Math.abs(seedJitter(floorPlanId, 30, 1)) % 16);
          const pairMidX = terrRect.x + terrRect.w / 2;
          for (let i = 0; i < 2; i++) {
            const bx = Math.round(
              pairMidX -
                tw / 2 +
                (i === 0 ? -gapT / 2 : gapT / 2) +
                seedJitter(floorPlanId, i + 40, 4) +
                (i === 0 ? -6 : 8),
            );
            const by = Math.round(
              terrRect.y +
                terrRect.h / 2 -
                th / 2 +
                (i === 0 ? -22 : 26) +
                seedJitter(floorPlanId, i + 40, 5),
            );
            void createFloorElement("table", bx, by, {
              ...terrazaAttach,
              tableShape: "square",
              seats: 4,
            });
          }
        }

        setSelectedIds([]);
      } finally {
        venueBaselineLockRef.current.delete(floorPlanId);
      }
    },
    [
      premiumSpatialEditor,
      restaurantId,
      isFirebaseConfigured,
      editingZones,
      createFloorElement,
      setZones,
      setLoadedZones,
      setZoneHighlight,
      setSelectedZoneId,
      setSelectedIds,
    ],
  );

  const runRoomsAssistantDraftSeed = useCallback(
    async (floorPlanId: string, draft: RoomsAssistantDraft): Promise<boolean> => {
      if (!configuracionMapEditorLayout || !premiumSpatialEditor) return false;
      if (!restaurantId || !isFirebaseConfigured) return false;
      if (editingZones) return false;
      const onPlan = (e: FloorElement) =>
        typeof e.floorPlanId === "string" &&
        e.floorPlanId.trim() === floorPlanId;
      if (elementsRef.current.some(onPlan)) return false;
      if (roomsAssistantSeedLockRef.current.has(floorPlanId)) return false;
      roomsAssistantSeedLockRef.current.add(floorPlanId);
      try {
        const seed = buildFloorPlanSeedFromDraft(draft, floorPlanId);
        const allRemoteZones = await getZones(restaurantId);
        let remoteZones = allRemoteZones.filter(
          (z) => z.floorPlanId === floorPlanId,
        );
        if (elementsRef.current.some(onPlan)) return false;

        const ensureZone = async (
          name: string,
          rect: { x: number; y: number; w: number; h: number },
        ): Promise<Zone> => {
          const existing = remoteZones.find(
            (z) =>
              zoneHasVisualRect(z) &&
              z.name.trim().toLowerCase() === name.trim().toLowerCase(),
          );
          if (existing) return existing;
          const zoneId = await createZone(restaurantId, name, undefined, {
            floorPlanId,
            x: rect.x,
            y: rect.y,
            width: rect.w,
            height: rect.h,
          });
          const created: Zone = {
            id: zoneId,
            restaurantId,
            floorPlanId,
            name,
            x: rect.x,
            y: rect.y,
            width: rect.w,
            height: rect.h,
          };
          remoteZones = sortZonesByName([...remoteZones, created]);
          return created;
        };

        const zoneByKey = new Map<
          FloorPlanSeedZone["key"],
          Zone
        >();

        for (const zoneSpec of seed.zones) {
          const zone = await ensureZone(zoneSpec.name, zoneSpec);
          zoneByKey.set(zoneSpec.key, zone);
        }

        const mainZone = zoneByKey.get("main");
        if (!mainZone) return false;

        setZones((prev) =>
          sortZonesByName([
            ...prev.filter((z) => z.floorPlanId !== floorPlanId),
            ...remoteZones,
          ]),
        );
        setLoadedZones((prev) =>
          sortZonesByName([
            ...prev.filter((z) => z.floorPlanId !== floorPlanId),
            ...remoteZones,
          ]),
        );
        setZoneHighlight(mainZone.id);
        setSelectedZoneId(mainZone.id);

        if (elementsRef.current.some(onPlan)) return false;

        for (const piece of seed.elements) {
          const zone =
            (piece.zoneKey && zoneByKey.get(piece.zoneKey)) ?? mainZone;
          await createFloorElement(piece.type, piece.x, piece.y, {
            name: piece.name,
            width: piece.width,
            height: piece.height,
            tableShape: piece.tableShape,
            seats: piece.seats,
            floorPlanId,
            zoneId: zone.id,
            zoneName: zone.name,
            zone: zone.name,
          });
        }

        setSelectedIds([]);
        return true;
      } finally {
        roomsAssistantSeedLockRef.current.delete(floorPlanId);
      }
    },
    [
      configuracionMapEditorLayout,
      premiumSpatialEditor,
      restaurantId,
      isFirebaseConfigured,
      editingZones,
      createFloorElement,
      setZones,
      setLoadedZones,
      setZoneHighlight,
      setSelectedZoneId,
      setSelectedIds,
    ],
  );

  const handleCreateNewFloorPlan = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured) return;
    const raw = window.prompt("Nombre del plano");
    if (raw == null) return;
    const name = raw.trim();
    if (!name) return;
    try {
      const created = await createFloorPlan(restaurantId, name);
      const optimisticPlan: FloorPlan = {
        id: created.id,
        restaurantId,
        name: created.name,
        width: created.width,
        height: created.height,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setFloorPlans((prev) =>
        sortFloorPlansForSelector([
          ...prev.filter((p) => p.id !== created.id),
          optimisticPlan,
        ]),
      );
      setSelectedFloorPlanId(created.id);
      const updated = await getFloorPlans(restaurantId);
      setFloorPlans((prev) => {
        const withCreated = updated.some((p) => p.id === created.id)
          ? updated
          : [...updated, optimisticPlan];
        const merged = withCreated.length > 0 ? withCreated : prev;
        return sortFloorPlansForSelector(merged);
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      window.alert(`No se pudo crear el plano.\n\nDetalle: ${detail}`);
    }
  }, [restaurantId]);

  const handleRenameSelectedFloorPlan = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured || !selectedFloorPlanId) return;
    const plan = floorPlans.find((p) => p.id === selectedFloorPlanId);
    const raw = window.prompt("Nombre del plano", plan?.name ?? "");
    if (raw == null) return;
    const name = raw.trim();
    if (!name) return;
    try {
      await updateFloorPlan(selectedFloorPlanId, {
        name,
        slug: slugifyFloorPlanName(name),
      });
      const updated = await getFloorPlans(restaurantId);
      setFloorPlans(sortFloorPlansForSelector(updated));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      window.alert(`No se pudo renombrar el plano.\n\nDetalle: ${detail}`);
    }
  }, [restaurantId, isFirebaseConfigured, selectedFloorPlanId, floorPlans]);

  const handleDuplicateSelectedFloorPlan = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured || !selectedFloorPlanId) return;
    try {
      const created = await duplicateFloorPlan(restaurantId, selectedFloorPlanId);
      const updated = await getFloorPlans(restaurantId);
      setFloorPlans(sortFloorPlansForSelector(updated));
      setSelectedFloorPlanId(created.id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      window.alert(`No se pudo duplicar el plano.\n\nDetalle: ${detail}`);
    }
  }, [restaurantId, isFirebaseConfigured, selectedFloorPlanId]);

  const handleToggleSelectedFloorPlanActive = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured || !selectedFloorPlanId) return;
    const plan = floorPlans.find((p) => p.id === selectedFloorPlanId);
    const currentlyActive = plan?.active !== false;
    try {
      await updateFloorPlan(selectedFloorPlanId, { active: !currentlyActive });
      const updated = await getFloorPlans(restaurantId);
      setFloorPlans(sortFloorPlansForSelector(updated));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      window.alert(`No se pudo actualizar el plano.\n\nDetalle: ${detail}`);
    }
  }, [restaurantId, isFirebaseConfigured, selectedFloorPlanId, floorPlans]);

  const handleMoveSelectedFloorPlanOrder = useCallback(
    async (direction: "up" | "down") => {
      if (!restaurantId || !isFirebaseConfigured || !selectedFloorPlanId) return;
      try {
        await moveFloorPlanOrder(restaurantId, selectedFloorPlanId, direction);
        const updated = await getFloorPlans(restaurantId);
        setFloorPlans(sortFloorPlansForSelector(updated));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        window.alert(`No se pudo reordenar.\n\nDetalle: ${detail}`);
      }
    },
    [restaurantId, isFirebaseConfigured, selectedFloorPlanId],
  );

  useEffect(() => {
    if (!premiumSpatialEditor || !restaurantId || !isFirebaseConfigured) return;
    if (configuracionMapEditorLayout) return;
    if (!selectedFloorPlanId || loading || editingZones) return;
    if (visibleElements.length > 0) return;
    /** Solo el plano ancla legacy se auto-rellena vacío; planos nuevos permanecen en blanco. */
    if (legacyFloorPlanAnchorId !== selectedFloorPlanId) return;
    let cancelled = false;
    void (async () => {
      await runPremiumVenueBaseline(selectedFloorPlanId);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [
    premiumSpatialEditor,
    configuracionMapEditorLayout,
    restaurantId,
    isFirebaseConfigured,
    selectedFloorPlanId,
    loading,
    editingZones,
    visibleElements.length,
    legacyFloorPlanAnchorId,
    runPremiumVenueBaseline,
  ]);

  useEffect(() => {
    if (!configuracionMapEditorLayout || !premiumSpatialEditor) return;
    if (!restaurantId || !isFirebaseConfigured) return;
    if (!selectedFloorPlanId || loading || editingZones) return;
    if (visibleElements.length > 0) return;

    const draft = readRoomsAssistantDraft();
    if (!draft) return;

    let cancelled = false;
    void (async () => {
      const applied = await runRoomsAssistantDraftSeed(selectedFloorPlanId, draft);
      if (cancelled || !applied) return;
      setPremiumInspectorCollapsed(false);
      if (!isRoomsAssistantBannerDismissed()) {
        setRoomsAssistantBannerVisible(true);
      }
      if (!isRoomsAssistantGuideDismissed()) {
        setRoomsAssistantGuideVisible(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    configuracionMapEditorLayout,
    premiumSpatialEditor,
    restaurantId,
    isFirebaseConfigured,
    selectedFloorPlanId,
    loading,
    editingZones,
    visibleElements.length,
    runRoomsAssistantDraftSeed,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          "input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']",
        )
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
        return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          "input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']",
        )
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "c" || e.key === "C")) {
        if (editingZones) return;
        if (selectedIds.length === 0) return;
        e.preventDefault();
        copySelectionToClipboard();
        return;
      }
      if (mod && (e.key === "v" || e.key === "V")) {
        if (!restaurantId || !isFirebaseConfigured) return;
        if (editingZones) return;
        if (!clipboardElements || clipboardElements.length === 0) return;
        e.preventDefault();
        pasteFromClipboard();
        return;
      }
      if (e.key === "Escape" && activeCreateType !== null) {
        e.preventDefault();
        setActiveCreateType(null);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (selectedIds.length === 0) return;
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      e.preventDefault();
      void handleDeleteSelection();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    selectedIds,
    restaurantId,
    editingZones,
    handleDeleteSelection,
    copySelectionToClipboard,
    pasteFromClipboard,
    clipboardElements,
    activeCreateType,
  ]);

  const handleSavePlanChanges = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured) return;
    if (areaTemplateBusy) {
      window.alert("Espera a que termine de crearse la zona antes de guardar.");
      return;
    }
    const batch = writeBatch(db);

    if (selectedFloorPlanId) {
      batch.set(
        doc(db, "floorPlans", selectedFloorPlanId),
        {
          id: selectedFloorPlanId,
          restaurantId,
          width: mapEditorWorldSize.width,
          height: mapEditorWorldSize.height,
          updatedAt: serverTimestamp(),
        } as DocumentData,
        { merge: true },
      );
    }

    const loadedById: Record<string, FloorElement> = {};
    for (const el of loadedElements) loadedById[el.id] = el;

    const currentIds = new Set(elements.map((e) => e.id));
    for (const oldId of Object.keys(loadedById)) {
      if (!currentIds.has(oldId)) {
        batch.update(doc(db, "tables", oldId), {
          isActive: false,
          updatedAt: serverTimestamp(),
        } as DocumentData);
      }
    }

    for (const el of elements) {
      const ref = doc(db, "tables", el.id);
      const def = getDefaultSizeForPlanElementType(el.type);
      const mins = minSizeForPlanType(el.type);
      const width = Math.max(mins.w, Math.round(el.width ?? def.width));
      const height = Math.max(mins.h, Math.round(el.height ?? def.height));
      const decorative = isDecorativePlanElementType(el.type);
      const payload: DocumentData = {
        id: el.id,
        restaurantId,
        name: String(el.name ?? "").trim(),
        type: el.type,
        status: el.status ?? TABLE_MAP_STATUS_FREE,
        tableShape: el.tableShape ?? "square",
        seats: decorative ? 0 : (el.seats ?? 4),
        x: Math.round(el.x ?? 0),
        y: Math.round(el.y ?? 0),
        width,
        height,
        isActive: el.isActive !== false,
        locked: el.locked === true,
        updatedAt: serverTimestamp(),
      };
      if (el.zoneId && el.zoneName) {
        payload.zoneId = el.zoneId;
        payload.zoneName = el.zoneName;
        payload.zone = el.zoneName;
      } else {
        payload.zoneId = deleteField();
        payload.zoneName = deleteField();
        payload.zone = deleteField();
      }
      if (
        typeof el.floorPlanId === "string" &&
        el.floorPlanId.trim() !== ""
      ) {
        payload.floorPlanId = el.floorPlanId.trim();
      } else {
        payload.floorPlanId = deleteField();
      }
      if (!loadedById[el.id]) payload.createdAt = serverTimestamp();
      batch.set(ref, payload, { merge: true });
    }

    const loadedZonesById: Record<string, Zone> = {};
    for (const z of loadedZones) loadedZonesById[z.id] = z;

    for (const z of zones) {
      const before = loadedZonesById[z.id];
      const changed =
        !before ||
        before.name !== z.name ||
        (before.floorPlanId ?? "") !== (z.floorPlanId ?? "") ||
        (before.color ?? "") !== (z.color ?? "") ||
        (before.x ?? null) !== (z.x ?? null) ||
        (before.y ?? null) !== (z.y ?? null) ||
        (before.width ?? null) !== (z.width ?? null) ||
        (before.height ?? null) !== (z.height ?? null);
      if (!changed) continue;
      const zref = doc(db, "zones", z.id);
      const up: DocumentData = {
        name: z.name,
        updatedAt: serverTimestamp(),
      };
      if (z.floorPlanId && z.floorPlanId.trim()) {
        up.floorPlanId = z.floorPlanId.trim();
      } else {
        up.floorPlanId = deleteField();
      }
      if (z.color && z.color.trim()) up.color = z.color.trim();
      else up.color = deleteField();
      if (
        typeof z.x === "number" &&
        typeof z.y === "number" &&
        typeof z.width === "number" &&
        typeof z.height === "number" &&
        Number.isFinite(z.x) &&
        Number.isFinite(z.y) &&
        Number.isFinite(z.width) &&
        Number.isFinite(z.height)
      ) {
        up.x = Math.round(z.x);
        up.y = Math.round(z.y);
        up.width = Math.round(z.width);
        up.height = Math.round(z.height);
      } else {
        up.x = deleteField();
        up.y = deleteField();
        up.width = deleteField();
        up.height = deleteField();
      }
      if (before) {
        batch.update(zref, up);
      } else {
        batch.set(
          zref,
          {
            ...up,
            id: z.id,
            restaurantId,
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
    }

    try {
      await batch.commit();
      setLoadedElements(elements.map((el) => ({ ...el })));
      setLoadedZones(zones.map((z) => ({ ...z })));
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("[MAP_EDITOR] save failed", error);
      const detail = error instanceof Error ? error.message : String(error);
      window.alert(`No se pudo guardar el plano.\n\nDetalle: ${detail}`);
      // keep unsaved state
    }
  }, [
    restaurantId,
    elements,
    zones,
    loadedElements,
    loadedZones,
    areaTemplateBusy,
    selectedFloorPlanId,
    mapEditorWorldSize,
  ]);

  const handleDiscardPlanChanges = useCallback(() => {
    if (!hasUnsavedChanges) return;
    if (!window.confirm("¿Descartar cambios sin guardar?")) return;
    resetFromLoaded();
  }, [hasUnsavedChanges, resetFromLoaded]);

  const hasAnyLockedElement = useMemo(
    () => elements.some((el) => el.locked === true),
    [elements],
  );

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setEditorLayoutNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const handleUnlockAllElements = useCallback(() => {
    if (!window.confirm("¿Desbloquear todos los elementos?")) return;
    commitElements((prev) => prev.map((el) => ({ ...el, locked: false })));
    setHasUnsavedChanges(true);
  }, [commitElements]);

  const showMapEmptyHint =
    !loading &&
    Boolean(restaurantId && isFirebaseConfigured) &&
    visibleElements.length === 0;

  const handleStartManualPlacement = useCallback(() => {
    setEditingZones(false);
    setOpenRailSection("tables");
    setActiveCreateType("table");
    setActiveTableVariant(TABLE_CREATE_VARIANTS[0].key);
    if (configuracionMapEditorLayout && premiumSpatialEditor) {
      flashCfgMapFeedback("Toca el plano para colocar la mesa");
    }
  }, [
    configuracionMapEditorLayout,
    premiumSpatialEditor,
    flashCfgMapFeedback,
  ]);

  const editorSecondaryActionBtnStyle = premiumSpatialEditor
    ? premiumMiniToolBtn
    : miniToolBtn;

  const editorToolbar = (
    <>
      {premiumSpatialEditor ? null : (
        <div style={editorTopBarStyle}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            flex: "1 1 220px",
            minWidth: 0,
          }}
        >
          <button
            type="button"
            style={
              activeCreateType === "table" ? topBarMesaBtnActive : topBarMesaBtn
            }
            onClick={() => setActiveCreateType("table")}
            disabled={editingZones}
          >
            Añadir mesa
          </button>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Añadir elemento
            </span>
            <select
              id="hostly-decorative-place-type"
              aria-label="Tipo de elemento decorativo a colocar"
              value={activeCreateType == null || activeCreateType === "table" ? "" : activeCreateType}
              onChange={(e) => {
                const v = e.target.value;
                if (
                  v === "sunbed" ||
                  v === "bed" ||
                  v === "wall" ||
                  v === "bar" ||
                  v === "column" ||
                  v === "pool" ||
                  v === "door" ||
                  v === "planter"
                ) {
                  setActiveCreateType(v);
                }
              }}
              disabled={editingZones}
              style={decorativeSelectStyle}
            >
              <option value="">Elige tipo…</option>
              <option value="sunbed">{planTypeLabelEs("sunbed")}</option>
              <option value="bed">{planTypeLabelEs("bed")}</option>
              <option value="wall">{planTypeLabelEs("wall")}</option>
              <option value="bar">{planTypeLabelEs("bar")}</option>
              <option value="column">{planTypeLabelEs("column")}</option>
              <option value="pool">{planTypeLabelEs("pool")}</option>
              <option value="door">{planTypeLabelEs("door")}</option>
              <option value="planter">{planTypeLabelEs("planter")}</option>
            </select>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            justifyContent: "flex-end",
            flex: "1 1 160px",
            marginLeft: "auto",
          }}
        >
          {hasUnsavedChanges ? (
            <span style={unsavedBadgeStyle}>Sin guardar</span>
          ) : null}
          <button
            type="button"
            style={{
              ...primaryBtn,
              fontSize: 12,
              padding: "6px 12px",
              opacity: hasUnsavedChanges ? 1 : 0.5,
              cursor: hasUnsavedChanges ? "pointer" : "not-allowed",
            }}
            onClick={() => void handleSavePlanChanges()}
            disabled={!hasUnsavedChanges}
          >
            Guardar
          </button>
          <button
            type="button"
            style={{
              ...smallBtn,
              fontSize: 12,
              padding: "6px 12px",
              opacity: hasUnsavedChanges ? 1 : 0.5,
              cursor: hasUnsavedChanges ? "pointer" : "not-allowed",
            }}
            onClick={handleDiscardPlanChanges}
            disabled={!hasUnsavedChanges}
          >
            Restablecer
          </button>
        </div>
      </div>
      )}

      {!premiumSpatialEditor ? (
        <div style={editorSecondaryStripStyle}>
          <>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                marginRight: 4,
              }}
            >
              Zonas y selección
            </span>
            <button
              type="button"
              style={editingZones ? miniToolBtnActive : miniToolBtn}
              onClick={() => {
                setEditingZones((v) => {
                  const next = !v;
                  if (next) setSelectedIds([]);
                  else setSelectedZoneId(null);
                  return next;
                });
              }}
            >
              {editingZones ? "Salir zonas" : "Editar zonas"}
            </button>
            <button
              type="button"
              style={editorSecondaryActionBtnStyle}
              onClick={() => void handleCreateZoneVisual()}
              disabled={visibleZones.length === 0}
            >
              Zona visual
            </button>
            {visibleZones.length > 0 ? (
              <select
                value={zoneHighlight}
                onChange={(e) => setZoneHighlight(e.target.value)}
                style={{ ...zoneHighlightSelectStyle, fontSize: 12, minWidth: 140 }}
                aria-label="Resaltar zona"
              >
                <option value="all">Todas las zonas</option>
                <option value="unassigned">Sin zona</option>
                <optgroup label="Zonas">
                  {visibleZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            ) : null}
          </>
        {hasAnyLockedElement ? (
          <button
            type="button"
            style={editorSecondaryActionBtnStyle}
            onClick={() => void handleUnlockAllElements()}
            disabled={editingZones}
          >
            Desbloquear todo
          </button>
        ) : null}
        {selectedIds.length >= 1 ? (
          <>
            <button
              type="button"
              style={editorSecondaryActionBtnStyle}
              onClick={() => void handleDuplicateSelection()}
              disabled={editingZones}
            >
              Duplicar
            </button>
            <button
              type="button"
              style={miniToolBtnDanger}
              onClick={() => void handleDeleteSelection()}
              disabled={editingZones}
            >
              Eliminar
            </button>
            {selectedFloorPlanId ? (
              <button
                type="button"
                style={editorSecondaryActionBtnStyle}
                onClick={() => void handleMoveSelectionToActiveFloorPlan()}
                disabled={editingZones}
              >
                A este plano
              </button>
            ) : null}
          </>
        ) : null}
        {selectedIds.length >= 2 ? (
          <>
            <div
              style={{
                display: "inline-flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 4,
              }}
              role="group"
              aria-label="Alinear elementos"
            >
              <span
                style={{
                  fontSize: 10,
                  color: "#64748b",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Alinear
              </span>
              <button
                type="button"
                style={editorSecondaryActionBtnStyle}
                disabled={editingZones}
                title="Alinear a la izquierda"
                onClick={() => alignSelectedElements("left")}
              >
                ←
              </button>
              <button
                type="button"
                style={editorSecondaryActionBtnStyle}
                disabled={editingZones}
                title="Centrar horizontalmente"
                onClick={() => alignSelectedElements("centerH")}
              >
                H
              </button>
              <button
                type="button"
                style={editorSecondaryActionBtnStyle}
                disabled={editingZones}
                title="Alinear a la derecha"
                onClick={() => alignSelectedElements("right")}
              >
                →
              </button>
              <button
                type="button"
                style={editorSecondaryActionBtnStyle}
                disabled={editingZones}
                title="Alinear arriba"
                onClick={() => alignSelectedElements("top")}
              >
                ↑
              </button>
              <button
                type="button"
                style={editorSecondaryActionBtnStyle}
                disabled={editingZones}
                title="Centrar verticalmente"
                onClick={() => alignSelectedElements("centerV")}
              >
                V
              </button>
              <button
                type="button"
                style={editorSecondaryActionBtnStyle}
                disabled={editingZones}
                title="Alinear abajo"
                onClick={() => alignSelectedElements("bottom")}
              >
                ↓
              </button>
            </div>
            {selectedIds.length >= 3 ? (
              <div
                style={{
                  display: "inline-flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 4,
                }}
                role="group"
                aria-label="Distribuir elementos"
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#64748b",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Repartir
                </span>
                <button
                  type="button"
                  style={editorSecondaryActionBtnStyle}
                  disabled={editingZones}
                  onClick={() => distributeSelectedElements("horizontal")}
                >
                  Horizontal
                </button>
                <button
                  type="button"
                  style={editorSecondaryActionBtnStyle}
                  disabled={editingZones}
                  onClick={() => distributeSelectedElements("vertical")}
                >
                  Vertical
                </button>
              </div>
            ) : null}
          </>
        ) : null}
        {visibleZones.length > 0 ? (
          <div
            style={{
              ...zoneLegendStyle,
              marginLeft: "auto",
              maxWidth: 360,
            }}
            aria-label="Leyenda de zonas"
          >
            {visibleZones.map((z) => (
              <span
                key={z.id}
                style={{
                  ...zoneLegendItemStyle,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: z.color ?? "rgba(148, 163, 184, 0.55)",
                    border: "1px solid rgba(148, 163, 184, 0.45)",
                    flex: "none",
                  }}
                />
                <span>{z.name}</span>
              </span>
            ))}
          </div>
        ) : null}
        </div>
      ) : null}
    </>
  );

  const mapInspectorLabelStyle: CSSProperties =
    configuracionMapEditorLayout && premiumSpatialEditor
      ? inspectorMapLayoutLabel
      : premiumSpatialEditor
        ? inspectorPremiumLabel
        : fieldLabelStyle;

  const mapInspectorInputStyle: CSSProperties =
    configuracionMapEditorLayout && premiumSpatialEditor
      ? inspectorMapLayoutInput
      : premiumSpatialEditor
        ? inspectorPremiumInput
        : inputStyle;

  const insFieldMb =
    configuracionMapEditorLayout && premiumSpatialEditor
      ? 5
      : premiumSpatialEditor
        ? 6
        : 10;

  const insGridGap =
    configuracionMapEditorLayout && premiumSpatialEditor
      ? 4
      : premiumSpatialEditor
        ? 6
        : 12;

  const premiumCanvasHeaderRight =
    configuracionMapEditorLayout &&
    premiumSpatialEditor &&
    restaurantId &&
    isFirebaseConfigured ? (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        {hasUnsavedChanges ? (
          <span style={mapEditorUnsavedPillStyle}>Sin guardar</span>
        ) : null}
      </div>
    ) : null;

  const cfgMapUi = configuracionMapEditorLayout && premiumSpatialEditor;

  const renderRailSection = (
    sectionId: RailSectionId,
    label: string,
    children: ReactNode,
  ) => {
    const open = openRailSection === sectionId;
    return (
      <div style={{ marginBottom: open ? 12 : 6 }}>
        <button
          type="button"
          style={mapToolboxSectionBtn}
          aria-expanded={open}
          onClick={() =>
            setOpenRailSection((current) =>
              current === sectionId ? null : sectionId,
            )
          }
        >
          <span>{label}</span>
          <span
            aria-hidden
            style={{
              fontSize: 12,
              lineHeight: 1,
              color: "#64748b",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 140ms ease",
            }}
          >
            ›
          </span>
        </button>
        <div
          style={{
            ...mapToolboxSectionPanel,
            display: "grid",
            gridTemplateRows: open ? "1fr" : "0fr",
            opacity: open ? 1 : 0,
          }}
        >
          <div style={{ minHeight: 0 }}>{children}</div>
        </div>
      </div>
    );
  };

  return (
    <ModulePageShell
      title="Editor de plano"
      maxWidth={premiumSpatialEditor ? 1760 : 1400}
      compactLayout
      operationalFocus
      lockViewport
      lockViewportFillParent={lockViewportFillParent}
      backLabel={configuracionMapEditorLayout ? "Dashboard" : "Volver"}
      shellSurface={configuracionMapEditorLayout ? "configLight" : "default"}
      backHref="/dashboard"
      fitLaptopViewport={premiumSpatialEditor}
      denseWorkbench={premiumSpatialEditor}
      stretchContentWidth={premiumSpatialEditor}
      mapEditorDenseChrome={configuracionMapEditorLayout}
      headerRight={premiumCanvasHeaderRight}
      hideLogoutButton={configuracionMapEditorLayout}
    >
      {restaurantId && isFirebaseConfigured ? (
        premiumSpatialEditor ? (
          configuracionMapEditorLayout ? null : (
          <div style={premiumUltraPlanBarStyle}>
            <label
              htmlFor="hostly-floor-plan-select"
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                whiteSpace: "nowrap",
              }}
            >
              Plano
            </label>
            <select
              id="hostly-floor-plan-select"
              aria-label="Seleccionar plano"
              value={selectedFloorPlanId ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                setSelectedFloorPlanId(v ? v : null);
              }}
              style={{
                ...inputStyle,
                width: "auto",
                minWidth: 120,
                maxWidth: "min(42vw, 280px)",
                cursor: "pointer",
                fontSize: 11,
                padding: "3px 7px",
              }}
            >
              {floorPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.active === false ? " (inactivo)" : ""}
                </option>
              ))}
            </select>
            {hasUnsavedChanges ? (
              <span
                title="Cambios sin guardar"
                style={{
                  ...unsavedBadgeCompactStyle,
                  fontSize: 8,
                  padding: "1px 5px",
                }}
              >
                ●
              </span>
            ) : null}
            <button
              type="button"
              style={{
                ...premiumToolbarSaveBtn,
                opacity: hasUnsavedChanges ? 1 : 0.42,
                cursor: hasUnsavedChanges ? "pointer" : "not-allowed",
              }}
              onClick={() => void handleSavePlanChanges()}
              disabled={!hasUnsavedChanges}
            >
              Guardar
            </button>
            <button
              type="button"
              style={
                activeCreateType === "table" && !editingZones
                  ? premiumTopBarMesaBtnActive
                  : premiumTopBarMesaBtn
              }
              onClick={() => {
                setEditingZones(false);
                setActiveCreateType("table");
              }}
              disabled={editingZones}
            >
              Mesa
            </button>
            <button
              type="button"
              style={premiumMiniToolBtn}
              onClick={() => void handleCreateZoneVisual()}
              disabled={visibleZones.length === 0 || editingZones}
              title="Dibujar o editar rectángulo de zona en el plano"
            >
              Zona
            </button>
          </div>
          )
        ) : (
          <div
            style={{
              marginBottom: 6,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "6px 10px",
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#e2e8f0",
                letterSpacing: "-0.02em",
              }}
            >
              {selectedFloorPlanName ?? "—"}
            </span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                flex: "1 1 200px",
                minWidth: 0,
              }}
            >
              <label
                htmlFor="hostly-floor-plan-select"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  whiteSpace: "nowrap",
                }}
              >
                Plano
              </label>
              <select
                id="hostly-floor-plan-select"
                aria-label="Seleccionar plano"
                value={selectedFloorPlanId ?? ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setSelectedFloorPlanId(v ? v : null);
                }}
                style={{
                  ...inputStyle,
                  width: "auto",
                  minWidth: 160,
                  maxWidth: "100%",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "6px 10px",
                }}
              >
                {floorPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.active === false ? " (inactivo)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                style={{
                  ...smallBtn,
                  fontSize: 12,
                  padding: "5px 10px",
                }}
                onClick={() => void handleCreateNewFloorPlan()}
              >
                Nuevo plano
              </button>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 4,
                  width: "100%",
                }}
              >
                <button
                  type="button"
                  style={{ ...smallBtn, fontSize: 11, padding: "4px 8px" }}
                  disabled={!selectedFloorPlanId || editingZones}
                  onClick={() => void handleRenameSelectedFloorPlan()}
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  style={{ ...smallBtn, fontSize: 11, padding: "4px 8px" }}
                  disabled={!selectedFloorPlanId || editingZones}
                  onClick={() => void handleDuplicateSelectedFloorPlan()}
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  style={{ ...smallBtn, fontSize: 11, padding: "4px 8px" }}
                  disabled={!selectedFloorPlanId || editingZones}
                  onClick={() => void handleToggleSelectedFloorPlanActive()}
                >
                  {selectedFloorPlan?.active === false ? "Activar" : "Desactivar"}
                </button>
                <button
                  type="button"
                  style={{ ...smallBtn, fontSize: 11, padding: "4px 8px" }}
                  disabled={!selectedFloorPlanId || editingZones}
                  onClick={() => void handleMoveSelectedFloorPlanOrder("up")}
                >
                  Subir
                </button>
                <button
                  type="button"
                  style={{ ...smallBtn, fontSize: 11, padding: "4px 8px" }}
                  disabled={!selectedFloorPlanId || editingZones}
                  onClick={() => void handleMoveSelectedFloorPlanOrder("down")}
                >
                  Bajar
                </button>
              </div>
            </div>
          </div>
        )
      ) : null}
      {!premiumSpatialEditor ? editorToolbar : null}
      <div
        className={
          configuracionMapEditorLayout && premiumSpatialEditor
            ? "hostly-floor-editor-workbench"
            : undefined
        }
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          width: "100%",
          display: "flex",
          flexDirection:
            configuracionMapEditorLayout && premiumSpatialEditor
              ? "row"
              : editorLayoutNarrow
                ? "column"
                : "row",
          alignItems: "stretch",
          gap:
            configuracionMapEditorLayout && premiumSpatialEditor
              ? 0
              : premiumSpatialEditor
                ? 2
                : 10,
        }}
      >
        {configuracionMapEditorLayout &&
        premiumSpatialEditor &&
        restaurantId &&
        isFirebaseConfigured ? (
          <aside
            className="hostly-floor-editor-toolbox"
            style={
              {
                ...mapToolboxAsideStyle,
                "--hostly-touch-min": "34px",
              } as CSSProperties
            }
            aria-label="Herramientas del plano"
          >
            <div style={mapToolboxMicro}>Plano</div>
            <div style={mapToolboxTopCard}>
              <select
                id="hostly-floor-plan-select"
                aria-label="Seleccionar plano"
                value={selectedFloorPlanId ?? ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setSelectedFloorPlanId(v ? v : null);
                }}
                style={mapToolboxSelect}
              >
                {floorPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.active === false ? " (inactivo)" : ""}
                  </option>
                ))}
              </select>
              <div style={mapToolboxRow2}>
                <button
                  type="button"
                  style={{
                    ...mapToolboxSaveSm,
                    opacity: hasUnsavedChanges ? 1 : 0.4,
                    cursor: hasUnsavedChanges ? "pointer" : "not-allowed",
                  }}
                  disabled={!hasUnsavedChanges}
                  onClick={() => void handleSavePlanChanges()}
                >
                  Guardar
                </button>
                <button
                  type="button"
                  style={mapToolboxGhostSm}
                  onClick={() => void handleCreateNewFloorPlan()}
                >
                  Nuevo
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  style={mapToolboxGhostSm}
                  disabled={!selectedFloorPlanId || editingZones}
                  onClick={() => void handleRenameSelectedFloorPlan()}
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  style={mapToolboxGhostSm}
                  disabled={!selectedFloorPlanId || editingZones}
                  onClick={() => void handleDuplicateSelectedFloorPlan()}
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  style={mapToolboxGhostSm}
                  disabled={!selectedFloorPlanId || editingZones}
                  onClick={() => void handleToggleSelectedFloorPlanActive()}
                >
                  {selectedFloorPlan?.active === false ? "Activar" : "Desactivar"}
                </button>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    style={{ ...mapToolboxGhostSm, flex: 1, minWidth: 0 }}
                    disabled={!selectedFloorPlanId || editingZones}
                    title="Subir en la lista"
                    onClick={() => void handleMoveSelectedFloorPlanOrder("up")}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    style={{ ...mapToolboxGhostSm, flex: 1, minWidth: 0 }}
                    disabled={!selectedFloorPlanId || editingZones}
                    title="Bajar en la lista"
                    onClick={() => void handleMoveSelectedFloorPlanOrder("down")}
                  >
                    ↓
                  </button>
                </div>
              </div>
              <button
                type="button"
                style={{
                  ...mapToolboxGhostSm,
                  width: "100%",
                  marginTop: 6,
                  opacity: hasUnsavedChanges ? 1 : 0.42,
                  cursor: hasUnsavedChanges ? "pointer" : "not-allowed",
                }}
                disabled={!hasUnsavedChanges}
                onClick={handleDiscardPlanChanges}
              >
                Restablecer
              </button>
            </div>

            <FloorPlanLayoutToolbar
              presets={floorPlanLayouts.presets}
              activeLayout={floorPlanLayouts.activeLayout}
              loading={floorPlanLayouts.loading}
              error={floorPlanLayouts.error}
              busyAction={floorPlanLayouts.busyAction}
              feedback={floorPlanLayouts.feedback}
              activatePrecheck={floorPlanLayouts.activatePrecheck}
              activatePrecheckHint={floorPlanLayouts.activatePrecheckHint}
              onPresetSelectionChange={floorPlanLayouts.runActivatePrecheck}
              onRefreshActivatePrecheck={floorPlanLayouts.refreshActivatePrecheck}
              hasUnsavedChanges={hasUnsavedChanges}
              disabled={!selectedFloorPlanId || editingZones}
              onSavePreset={floorPlanLayouts.savePreset}
              onActivatePreset={floorPlanLayouts.activatePreset}
              onDuplicatePreset={floorPlanLayouts.duplicatePreset}
              onArchivePreset={floorPlanLayouts.archivePreset}
            />

            {renderRailSection("floor", "Suelo", (
            <div style={mapFloorSwatchGrid} aria-label="Suelo del restaurante">
              {FLOOR_SURFACE_OPTIONS.map((preset) => {
                const selected = floorSurfacePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-label={preset.label}
                    title={preset.label}
                    aria-pressed={selected}
                    onClick={() => setFloorSurfacePreset(preset.id)}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      minHeight: 30,
                      borderRadius: 999,
                      border: selected
                        ? "2px solid #3f6478"
                        : "1px solid rgba(71, 85, 105, 0.18)",
                      background: preset.swatch,
                      cursor: "pointer",
                      boxShadow: selected
                        ? "0 0 0 3px rgba(63, 100, 120, 0.12)"
                        : "0 1px 2px rgba(15, 23, 42, 0.04)",
                    }}
                  />
                );
              })}
            </div>
            ))}

            {renderRailSection("tables", "Mesas", (
            <div style={mapToolboxAddGrid2}>
              {TABLE_CREATE_VARIANTS.map((variant) => (
                <button
                  key={variant.key}
                  type="button"
                  className={mapRailPaletteBtnClass(
                    activeCreateType === "table" &&
                      activeTableVariant === variant.key &&
                      !editingZones,
                    editingZones,
                  )}
                  onClick={() => {
                    setEditingZones(false);
                    setActiveCreateType("table");
                    setActiveTableVariant(variant.key);
                  }}
                  disabled={editingZones}
                >
                  <MapRailIcon icon={variant.icon} />
                  <span style={mapRailActionCaption}>{variant.label}</span>
                </button>
              ))}
              <button
                type="button"
                className={mapRailPaletteBtnClass(
                  activeCreateType === "sunbed" && !editingZones,
                  editingZones,
                )}
                disabled={editingZones}
                onClick={() => {
                  setEditingZones(false);
                  setActiveCreateType("sunbed");
                }}
              >
                <MapRailIcon icon={BedSingle} />
                <span style={mapRailActionCaption}>Hamaca</span>
              </button>
              <button
                type="button"
                className={mapRailPaletteBtnClass(
                  activeCreateType === "bed" && !editingZones,
                  editingZones,
                )}
                disabled={editingZones}
                onClick={() => {
                  setEditingZones(false);
                  setActiveCreateType("bed");
                }}
              >
                <MapRailIcon icon={BedDouble} />
                <span style={mapRailActionCaption}>Cama</span>
              </button>
            </div>
            ))}

            {renderRailSection("elements", "Elementos", (
            <div style={mapToolboxAddGrid2}>
              <button
                type="button"
                className={mapRailPaletteBtnClass(activeCreateType === "bar" && !editingZones, editingZones)}
                disabled={editingZones}
                onClick={() => requestStructureAtMapCenter("bar")}
              >
                <MapRailIcon icon={RectangleHorizontal} />
                <span style={mapRailActionCaption}>Barra</span>
              </button>
              <button
                type="button"
                className={mapRailPaletteBtnClass(activeCreateType === "wall" && !editingZones, editingZones)}
                disabled={editingZones}
                onClick={() => requestStructureAtMapCenter("wall")}
              >
                <MapRailIcon icon={Minus} />
                <span style={mapRailActionCaption}>Pared</span>
              </button>
              <button
                type="button"
                className={mapRailPaletteBtnClass(activeCreateType === "door" && !editingZones, editingZones)}
                disabled={editingZones}
                onClick={() => requestStructureAtMapCenter("door")}
              >
                <MapRailIcon icon={DoorOpen} />
                <span style={mapRailActionCaption}>Puerta</span>
              </button>
              <button
                type="button"
                className={mapRailPaletteBtnClass(activeCreateType === "pool" && !editingZones, editingZones)}
                disabled={editingZones}
                onClick={() => requestStructureAtMapCenter("pool")}
              >
                <MapRailIcon icon={Waves} />
                <span style={mapRailActionCaption}>Piscina</span>
              </button>
              <button
                type="button"
                className={mapRailPaletteBtnClass(activeCreateType === "planter" && !editingZones, editingZones)}
                disabled={editingZones}
                onClick={() => requestStructureAtMapCenter("planter")}
              >
                <MapRailIcon icon={Flower2} />
                <span style={mapRailActionCaption}>Jardinera</span>
              </button>
              <button
                type="button"
                className={`${mapRailPaletteBtnClass(activeCreateType === "column" && !editingZones, editingZones)} min-h-[38px]`}
                disabled={editingZones}
                onClick={() => requestStructureAtMapCenter("column")}
              >
                <MapRailIcon icon={Circle} />
                <span style={mapRailActionCaption}>Columna</span>
              </button>
            </div>
            ))}

            {renderRailSection("areas", "Áreas", (
            <>
            {editingZones || areaTemplateFeedback ? (
              <div
                style={{
                  margin: "0 0 8px",
                  padding: "7px 8px",
                  borderRadius: 10,
                  border: "1px solid var(--hostly-line)",
                  background: "rgba(248, 251, 254, 0.88)",
                  color: "#3f6478",
                  fontSize: 10.5,
                  fontWeight: 650,
                  lineHeight: 1.25,
                }}
              >
                {areaTemplateFeedback ??
                  "Modo zonas activo: mueve o redimensiona el ambiente seleccionado."}
              </div>
            ) : null}
            <div style={mapToolboxChipsRow}>
              <button
                type="button"
                style={mapToolboxChipStyle(visibleZones.length === 0 || editingZones)}
                onClick={() => void handleCreateZoneVisual()}
                disabled={visibleZones.length === 0 || editingZones}
              >
                Zona visual
              </button>
            </div>
            <div style={mapToolboxChipsRow}>
              {AREA_QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  style={mapToolboxChipStyle(
                    Boolean(editingZones || areaTemplateBusy),
                  )}
                  disabled={editingZones || areaTemplateBusy}
                  onClick={() => void handleApplyAreaTemplate(tpl)}
                >
                  {tpl.label}
                </button>
              ))}
            </div>
            </>
            ))}

            <div style={mapToolboxMicro}>Vista</div>
            <div style={mapToolboxVistaGrid}>
              <button
                type="button"
                className={`${mapRailPaletteBtnClass(false)} min-h-[40px]`}
                aria-label="Alejar el plano"
                title="Alejar"
                onClick={() => mapViewportControlsRef.current?.zoomOut()}
              >
                <MapRailIcon icon={Minus} />
              </button>
              <button
                type="button"
                className={`${mapRailPaletteBtnClass(false)} min-h-[40px]`}
                aria-label="Acercar el plano"
                title="Acercar"
                onClick={() => mapViewportControlsRef.current?.zoomIn()}
              >
                <MapRailIcon icon={Plus} />
              </button>
              <button
                type="button"
                className={`${mapRailPaletteBtnClass(false)} min-h-[40px]`}
                aria-label="Zoom al 100 %"
                title="100 %"
                onClick={() => mapViewportControlsRef.current?.resetNaturalZoom()}
              >
                <MapRailIcon icon={Scan} />
                <span style={{ ...mapRailActionCaption, fontSize: 10 }}>
                  100 %
                </span>
              </button>
              <button
                type="button"
                className={`${mapRailPaletteBtnClass(false)} min-h-[40px]`}
                aria-label="Ajustar plano a la vista"
                title="Ajustar"
                onClick={() => mapViewportControlsRef.current?.fitToViewport()}
              >
                <MapRailIcon icon={Maximize2} />
                <span style={{ ...mapRailActionCaption, fontSize: 10 }}>
                  Ajustar
                </span>
              </button>
            </div>
            <button
              type="button"
              style={{ ...mapToolboxFullMuted, marginBottom: 6 }}
              onClick={() => {
                setEditingZones((v) => {
                  const next = !v;
                  if (next) setSelectedIds([]);
                  else setSelectedZoneId(null);
                  return next;
                });
              }}
            >
              {editingZones ? "Salir zonas" : "Editar zonas"}
            </button>

            <div style={mapToolboxMicro}>Semilla</div>
            <button
              type="button"
              style={{
                ...mapToolboxSaveSm,
                width: "100%",
                opacity:
                  !selectedFloorPlanId ||
                  loading ||
                  editingZones ||
                  areaTemplateBusy ||
                  visibleElements.length > 0
                    ? 0.45
                    : 1,
                cursor:
                  !selectedFloorPlanId ||
                  loading ||
                  editingZones ||
                  areaTemplateBusy ||
                  visibleElements.length > 0
                    ? "not-allowed"
                    : "pointer",
              }}
              disabled={
                !selectedFloorPlanId ||
                loading ||
                editingZones ||
                areaTemplateBusy ||
                visibleElements.length > 0
              }
              onClick={() => {
                if (!selectedFloorPlanId) return;
                void runPremiumVenueBaseline(selectedFloorPlanId);
              }}
            >
              Salón sugerido
            </button>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 10,
                lineHeight: 1.4,
                color: "#64748b",
                fontWeight: 500,
              }}
            >
              Solo plano vacío. Revisa y guarda arriba.
            </p>
          </aside>
        ) : null}
        <div
          className="hostly-floor-editor-stage"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: editorLayoutNarrow ? "column" : "row",
            alignItems: "stretch",
            gap:
              configuracionMapEditorLayout && premiumSpatialEditor
                ? 0
                : premiumSpatialEditor
                  ? 2
                  : 10,
          }}
        >
        <div
          className={
            configuracionMapEditorLayout && premiumSpatialEditor
              ? "hostly-floor-editor-map-wrap"
              : "hostly-card"
          }
          style={{
            flex: "1 1 0%",
            minWidth: 0,
            minHeight: editorLayoutNarrow
              ? premiumSpatialEditor
                ? 300
                : 320
              : 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            padding: 0,
            borderRadius:
              configuracionMapEditorLayout && premiumSpatialEditor
                ? 4
                : premiumSpatialEditor
                  ? 12
                  : "var(--hostly-radius-md)",
            order: editorLayoutNarrow ? 1 : undefined,
            ...(configuracionMapEditorLayout && premiumSpatialEditor
              ? {
                  border: "1px solid #d8cec0",
                  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
                  background:
                    "linear-gradient(180deg, #eef4f9 0%, #e4edf5 100%)",
                }
              : premiumSpatialEditor
                ? {
                    boxShadow: "0 0 0 1px rgba(148, 163, 184, 0.05)",
                    border: "1px solid rgba(148, 163, 184, 0.06)",
                  }
                : {}),
          }}
        >
          {loading ? (
            <div
              style={{
                padding: 20,
                color: "#94a3b8",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Cargando…
            </div>
          ) : !restaurantId || !isFirebaseConfigured ? (
            <div style={{ padding: 20, color: "#94a3b8", fontSize: 14 }}>
              Conecta Firebase para editar el plano.
            </div>
          ) : (
            <div
              style={{
                position: "relative",
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                padding: premiumSpatialEditor ? 0 : "8px 10px 10px",
                boxSizing: "border-box",
              }}
            >
              {roomsAssistantBannerVisible && cfgMapUi ? (
                <ConfigMapAssistantPlanoBanner
                  visible
                  onDismiss={() => {
                    dismissRoomsAssistantBanner();
                    setRoomsAssistantBannerVisible(false);
                  }}
                />
              ) : null}
              {showMapEmptyHint ? (
                cfgMapUi ? (
                  <ConfigMapEditorEmptyState
                    hasAssistantDraft={hasRoomsAssistantDraft}
                    onStartManualPlacement={handleStartManualPlacement}
                  />
                ) : (
                  <div
                    className="hostly-floor-editor-empty"
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                      zIndex: 1,
                      padding: 24,
                    }}
                  >
                    <div
                      className="hostly-floor-editor-empty-card"
                      style={{ textAlign: "center", maxWidth: 340 }}
                    >
                      <p
                        style={{
                          margin: 0,
                          color: "#94a3b8",
                          fontSize: 15,
                          fontWeight: 600,
                          lineHeight: 1.4,
                        }}
                      >
                        Empieza creando tu primer espacio
                      </p>
                      <p
                        style={{
                          margin: "10px 0 0",
                          color: "#64748b",
                          fontSize: 13,
                          fontWeight: 500,
                          lineHeight: 1.45,
                        }}
                      >
                        Después podrás colocar mesas, barras, hamacas, camas o zonas.
                      </p>
                    </div>
                  </div>
                )
              ) : null}
              {premiumSpatialEditor &&
              !configuracionMapEditorLayout &&
              restaurantId &&
              isFirebaseConfigured &&
              !loading ? (
                <div
                  ref={premiumToolsMenuRef}
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 12,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 8,
                      bottom: 8,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "stretch",
                      gap: 8,
                      pointerEvents: "auto",
                      maxWidth: "calc(100% - 100px)",
                    }}
                  >
                    {premiumToolsMenuOpen ? (
                      <div
                        id="hostly-premium-tools-popover"
                        role="dialog"
                        aria-label="Más herramientas del plano"
                        style={premiumPopoverPanelStyle}
                      >
                        <div style={premiumPopoverSectionLabel}>Plano</div>
                        <button
                          type="button"
                          style={premiumMenuActionRow}
                          onClick={() => {
                            setPremiumToolsMenuOpen(false);
                            void handleCreateNewFloorPlan();
                          }}
                        >
                          Nuevo plano
                        </button>
                        <button
                          type="button"
                          style={{
                            ...premiumMenuActionRow,
                            opacity: hasUnsavedChanges ? 1 : 0.45,
                            cursor: hasUnsavedChanges ? "pointer" : "not-allowed",
                          }}
                          disabled={!hasUnsavedChanges}
                          onClick={() => {
                            setPremiumToolsMenuOpen(false);
                            handleDiscardPlanChanges();
                          }}
                        >
                          Restablecer cambios
                        </button>

                        <div style={premiumPopoverSectionLabel}>Zonas</div>
                        <button
                          type="button"
                          style={premiumMenuActionRow}
                          onClick={() => {
                            setPremiumToolsMenuOpen(false);
                            setEditingZones((v) => {
                              const next = !v;
                              if (next) setSelectedIds([]);
                              else setSelectedZoneId(null);
                              return next;
                            });
                          }}
                        >
                          {editingZones ? "Salir del modo zonas" : "Editar zonas"}
                        </button>
                        <button
                          type="button"
                          style={{
                            ...premiumMenuActionRow,
                            opacity: visibleZones.length === 0 ? 0.45 : 1,
                            cursor: visibleZones.length === 0 ? "not-allowed" : "pointer",
                          }}
                          disabled={visibleZones.length === 0}
                          onClick={() => {
                            setPremiumToolsMenuOpen(false);
                            void handleCreateZoneVisual();
                          }}
                        >
                          Rectángulo de zona en plano
                        </button>
                        {visibleZones.length > 0 ? (
                          <select
                            aria-label="Resaltar zona"
                            value={zoneHighlight}
                            onChange={(e) => setZoneHighlight(e.target.value)}
                            style={{
                              ...zoneHighlightSelectStyle,
                              fontSize: 11,
                              width: "100%",
                              marginBottom: 4,
                              boxSizing: "border-box",
                            }}
                          >
                            <option value="all">Todas las zonas</option>
                            <option value="unassigned">Sin zona</option>
                            <optgroup label="Zonas">
                              {visibleZones.map((z) => (
                                <option key={z.id} value={z.id}>
                                  {z.name}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        ) : null}

                        <div style={premiumPopoverSectionLabel}>
                          Plantillas de área
                        </div>
                        {AREA_QUICK_TEMPLATES.map((tpl) => (
                          <button
                            key={tpl.key}
                            type="button"
                            style={{
                              ...premiumMenuActionRow,
                              opacity:
                                editingZones || areaTemplateBusy ? 0.45 : 1,
                              cursor:
                                editingZones || areaTemplateBusy
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                            disabled={editingZones || areaTemplateBusy}
                            onClick={() => {
                              setPremiumToolsMenuOpen(false);
                              void handleApplyAreaTemplate(tpl);
                            }}
                          >
                            {tpl.label}
                          </button>
                        ))}

                        <div style={premiumPopoverSectionLabel}>
                          Colocar en el centro (estructura)
                        </div>
                        {(
                          [
                            ["wall", "Pared"],
                            ["bar", "Barra"],
                            ["column", "Columna"],
                            ["pool", "Piscina"],
                            ["door", "Puerta"],
                            ["planter", "Jardinera"],
                          ] as const
                        ).map(([t, label]) => (
                          <button
                            key={t}
                            type="button"
                            style={{
                              ...premiumMenuActionRow,
                              opacity: editingZones ? 0.45 : 1,
                              cursor: editingZones ? "not-allowed" : "pointer",
                            }}
                            disabled={editingZones}
                            onClick={() => {
                              setPremiumToolsMenuOpen(false);
                              requestStructureAtMapCenter(t);
                            }}
                          >
                            {label}
                          </button>
                        ))}

                        <div style={premiumPopoverSectionLabel}>
                          Cursor
                        </div>
                        <button
                          type="button"
                          style={premiumMenuActionRow}
                          onClick={() => {
                            setPremiumToolsMenuOpen(false);
                            setActiveCreateType(null);
                          }}
                        >
                          Seleccionar sin crear
                        </button>

                        <div style={premiumPopoverSectionLabel}>
                          Colocar al clic (mobiliario)
                        </div>
                        <button
                          type="button"
                          style={{
                            ...premiumMenuActionRow,
                            opacity: editingZones ? 0.45 : 1,
                            cursor: editingZones ? "not-allowed" : "pointer",
                          }}
                          disabled={editingZones}
                          onClick={() => {
                            setPremiumToolsMenuOpen(false);
                            setActiveCreateType("sunbed");
                          }}
                        >
                          Hamaca
                        </button>
                        <button
                          type="button"
                          style={{
                            ...premiumMenuActionRow,
                            opacity: editingZones ? 0.45 : 1,
                            cursor: editingZones ? "not-allowed" : "pointer",
                          }}
                          disabled={editingZones}
                          onClick={() => {
                            setPremiumToolsMenuOpen(false);
                            setActiveCreateType("bed");
                          }}
                        >
                          Cama
                        </button>

                        {hasAnyLockedElement ? (
                          <>
                            <div style={premiumPopoverSectionLabel}>
                              Bloqueo
                            </div>
                            <button
                              type="button"
                              style={premiumMenuActionRow}
                              disabled={editingZones}
                              onClick={() => {
                                setPremiumToolsMenuOpen(false);
                                void handleUnlockAllElements();
                              }}
                            >
                              Desbloquear todo
                            </button>
                          </>
                        ) : null}

                        {selectedIds.length >= 1 ? (
                          <>
                            <div style={premiumPopoverSectionLabel}>
                              Selección
                            </div>
                            <button
                              type="button"
                              style={premiumMenuActionRow}
                              disabled={editingZones}
                              onClick={() => {
                                setPremiumToolsMenuOpen(false);
                                void handleDuplicateSelection();
                              }}
                            >
                              Duplicar
                            </button>
                            <button
                              type="button"
                              style={{
                                ...premiumMenuActionRow,
                                borderColor: "rgba(248, 113, 113, 0.35)",
                                color: "#fecaca",
                              }}
                              disabled={editingZones}
                              onClick={() => {
                                setPremiumToolsMenuOpen(false);
                                void handleDeleteSelection();
                              }}
                            >
                              Eliminar
                            </button>
                            {selectedFloorPlanId ? (
                              <button
                                type="button"
                                style={premiumMenuActionRow}
                                disabled={editingZones}
                                onClick={() => {
                                  setPremiumToolsMenuOpen(false);
                                  void handleMoveSelectionToActiveFloorPlan();
                                }}
                              >
                                Mover a este plano
                              </button>
                            ) : null}
                          </>
                        ) : null}

                        {selectedIds.length >= 2 ? (
                          <>
                            <div style={premiumPopoverSectionLabel}>Alinear</div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 4,
                                marginBottom: 6,
                              }}
                            >
                              {(
                                [
                                  ["left", "←"],
                                  ["centerH", "H"],
                                  ["right", "→"],
                                  ["top", "↑"],
                                  ["centerV", "V"],
                                  ["bottom", "↓"],
                                ] as const
                              ).map(([k, sym]) => (
                                <button
                                  key={k}
                                  type="button"
                                  style={{
                                    ...premiumMiniToolBtn,
                                    flex: "1 1 28%",
                                    minWidth: 44,
                                    justifyContent: "center",
                                  }}
                                  disabled={editingZones}
                                  onClick={() => {
                                    setPremiumToolsMenuOpen(false);
                                    alignSelectedElements(k);
                                  }}
                                >
                                  {sym}
                                </button>
                              ))}
                            </div>
                          </>
                        ) : null}

                        {selectedIds.length >= 3 ? (
                          <>
                            <div style={premiumPopoverSectionLabel}>
                              Repartir
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 4,
                              }}
                            >
                              <button
                                type="button"
                                style={{
                                  ...premiumMiniToolBtn,
                                  flex: 1,
                                  justifyContent: "center",
                                }}
                                disabled={editingZones}
                                onClick={() => {
                                  setPremiumToolsMenuOpen(false);
                                  distributeSelectedElements("horizontal");
                                }}
                              >
                                Horizontal
                              </button>
                              <button
                                type="button"
                                style={{
                                  ...premiumMiniToolBtn,
                                  flex: 1,
                                  justifyContent: "center",
                                }}
                                disabled={editingZones}
                                onClick={() => {
                                  setPremiumToolsMenuOpen(false);
                                  distributeSelectedElements("vertical");
                                }}
                              >
                                Vertical
                              </button>
                            </div>
                          </>
                        ) : null}

                        {visibleZones.length > 0 ? (
                          <>
                            <div style={premiumPopoverSectionLabel}>
                              Leyenda
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 4,
                                paddingBottom: 2,
                              }}
                              aria-label="Leyenda de zonas"
                            >
                              {visibleZones.map((z) => (
                                <span
                                  key={z.id}
                                  style={{
                                    ...zoneLegendItemStyle,
                                    fontSize: 10,
                                    gap: 4,
                                    fontWeight: 600,
                                  }}
                                >
                                  <span
                                    aria-hidden
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: 999,
                                      background:
                                        z.color ?? "rgba(148, 163, 184, 0.55)",
                                      border:
                                        "1px solid rgba(148, 163, 184, 0.45)",
                                      flex: "none",
                                    }}
                                  />
                                  <span>{z.name}</span>
                                </span>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      aria-expanded={premiumToolsMenuOpen}
                      aria-controls="hostly-premium-tools-popover"
                      aria-label={
                        premiumToolsMenuOpen
                          ? "Cerrar menú de herramientas"
                          : "Más herramientas"
                      }
                      style={premiumFabPlusStyle}
                      onClick={() =>
                        setPremiumToolsMenuOpen((open) => !open)
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : null}
              {editingZones || areaTemplateFeedback ? (
                <div
                  style={{
                    position: "absolute",
                    top: 14,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 42,
                    pointerEvents: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    maxWidth: "min(520px, calc(100% - 32px))",
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(180, 150, 112, 0.28)",
                    background: "rgba(255, 252, 246, 0.86)",
                    color: "#5f513f",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    boxShadow: "0 8px 28px rgba(58, 47, 34, 0.08)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      background: areaTemplateBusy ? "#d6a85f" : "#7c6a52",
                      boxShadow: "0 0 0 4px rgba(214, 168, 95, 0.12)",
                      flex: "none",
                    }}
                  />
                  <span>
                    {areaTemplateFeedback ??
                      "Modo zonas: arrastra y redimensiona los ambientes del plano"}
                  </span>
                </div>
              ) : null}
              <EditableFloorMap
                editable
                editorPlanSurface
                hideZoneOverlays={!editingZones}
                editorVisualPreset={
                  premiumSpatialEditor ? "premium" : "default"
                }
                floorSurfacePreset={floorSurfacePreset}
                planSize={mapEditorWorldSize}
                className="hostly-floor-editor-map"
                createType={activeCreateType}
                elements={visibleElements}
                selectedId={null}
                selectedIds={selectedIds}
                onSelect={editingZones ? undefined : handleSelectElement}
                onMove={handleMove}
                onResize={handleResize}
                onRename={editingZones ? undefined : handleRenameElement}
                onCreate={(type, x, y) => {
                  lastMapInteractionRef.current = { x, y };
                  if (type === "custom") return;
                  if (type === "table") {
                    const variant =
                      TABLE_CREATE_VARIANTS.find((v) => v.key === activeTableVariant) ??
                      TABLE_CREATE_VARIANTS[0];
                    void createFloorElement(type, x, y, {
                      tableShape: variant.tableShape,
                      width: variant.width,
                      height: variant.height,
                      seats: variant.seats,
                    });
                    return;
                  }
                  void createFloorElement(type, x, y, createSizeForPlanType(type) ?? undefined);
                }}
                zones={visibleZones}
                zoneHighlight={zoneHighlight}
                editingZones={editingZones}
                selectedZoneId={selectedZoneId}
                onSelectZone={(id) => {
                  setSelectedZoneId(id);
                }}
                onMoveZone={handleMoveZone}
                onResizeZone={handleResizeZone}
                mapAutoFitKey={
                  premiumSpatialEditor ? (selectedFloorPlanId ?? "") : undefined
                }
                mapAutoFitNonce={premiumSpatialEditor ? mapFitNonce : 0}
                placementRequest={
                  premiumSpatialEditor ? placementRequest : null
                }
                onPlacementRequestHandled={
                  premiumSpatialEditor ? clearPlacementRequest : undefined
                }
                hideInlineZoomControls={
                  configuracionMapEditorLayout && premiumSpatialEditor
                }
                viewportControlsRef={
                  configuracionMapEditorLayout && premiumSpatialEditor
                    ? mapViewportControlsRef
                    : undefined
                }
                viewportFitPaddingPx={
                  configuracionMapEditorLayout && premiumSpatialEditor
                    ? 12
                    : undefined
                }
                /** "plan": el encuadre usa width/height del floor plan. "content" vacío caía a bounds 800×560 y el marco del lienzo parecía un recuadro interior. */
                viewportFitMode="plan"
                viewportFitElements={visibleElements}
                viewportFitZones={visibleZones}
                viewportFitZoomMax={
                  configuracionMapEditorLayout && premiumSpatialEditor
                    ? 1.28
                    : undefined
                }
                mapLayoutEmphasis={
                  Boolean(
                    configuracionMapEditorLayout && premiumSpatialEditor,
                  )
                }
                selectedIdsRef={
                  configuracionMapEditorLayout && premiumSpatialEditor
                    ? selectedIdsRef
                    : undefined
                }
                onSelectionScreenRect={
                  configuracionMapEditorLayout && premiumSpatialEditor
                    ? setSelectionScreenRect
                    : undefined
                }
                onZoneScreenRect={
                  configuracionMapEditorLayout && premiumSpatialEditor
                    ? setZoneHudScreenRect
                    : undefined
                }
                onBoxSelect={
                  configuracionMapEditorLayout && premiumSpatialEditor
                    ? handleBoxSelect
                    : undefined
                }
                preferredPlacementMapPoint={
                  configuracionMapEditorLayout && premiumSpatialEditor
                    ? preferredPlacementMapPoint
                    : null
                }
                onMoveMany={
                  configuracionMapEditorLayout && premiumSpatialEditor
                    ? handleMoveMany
                    : undefined
                }
              />
              {configuracionMapEditorLayout && premiumSpatialEditor ? (
                <>
                  <MapFloatingQuickActions
                    anchor={selectionScreenRect}
                    visible={
                      !editingZones &&
                      selectedIds.length > 0 &&
                      !!selectionScreenRect
                    }
                    multi={selectedIds.length > 1}
                    canDistribute={selectedIds.length >= 3}
                    canReorderFront={canReorderSelectionFront}
                    canReorderBack={canReorderSelectionBack}
                    onDuplicate={() => {
                      void handleDuplicateSelection();
                    }}
                    onLock={() => handleToggleSelectionLock()}
                    onFront={() => handleBringSelectionToFront()}
                    onBack={() => handleSendSelectionToBack()}
                    onDelete={() => void handleDeleteSelection()}
                    onAlignH={() => alignSelectedElements("centerV")}
                    onAlignV={() => alignSelectedElements("centerH")}
                    onDistributeH={() =>
                      distributeSelectedElements("horizontal")
                    }
                    onDistributeV={() =>
                      distributeSelectedElements("vertical")
                    }
                  />
                  {editingZones &&
                  zoneHudScreenRect &&
                  selectedZone ? (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        position: "fixed",
                        left:
                          zoneHudScreenRect.left +
                          zoneHudScreenRect.width / 2,
                        top: zoneHudScreenRect.top + zoneHudScreenRect.height + 6,
                        zIndex: 55,
                        pointerEvents: "none",
                        padding: "5px 10px",
                        borderRadius: 8,
                        border: "1px solid rgba(148, 163, 184, 0.35)",
                        background: "rgba(255, 255, 255, 0.96)",
                        boxShadow:
                          "0 4px 14px rgba(15, 23, 42, 0.1), 0 1px 2px rgba(15, 23, 42, 0.06)",
                        fontSize: 11,
                        color: "#334155",
                        fontWeight: 600,
                        maxWidth: 220,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        transform: "translateX(-50%)",
                      }}
                    >
                      {selectedZone.name}
                      <span style={{ opacity: 0.65, fontWeight: 500 }}>
                        {" "}
                        · {tablesCountInSelectedZone} mesas · ≈
                        {typeof selectedZone.width === "number" &&
                        typeof selectedZone.height === "number"
                          ? ` ${Math.round(selectedZone.width)}×${Math.round(
                              selectedZone.height,
                            )}`
                          : ""}
                      </span>
                    </div>
                  ) : null}
                  {cfgMapUi &&
                  selectedElement &&
                  selectionScreenRect &&
                  !editingZones &&
                  selectedIds.length === 1 ? (
                    <ConfigMapSelectionHud
                      anchor={selectionScreenRect}
                      element={selectedElement}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          )}
        </div>

        {showSideInspector ? (
        <aside
          className={
            configuracionMapEditorLayout && premiumSpatialEditor
              ? "hostly-floor-editor-inspector"
              : "hostly-card"
          }
          style={{
            ...sidePanelStyle,
            ...(premiumSpatialEditor
              ? editorLayoutNarrow
                ? configuracionMapEditorLayout
                  ? {
                      flex: "0 0 auto",
                      width: "100%",
                      maxWidth: "100%",
                      minWidth: 0,
                      maxHeight: "min(44vh, 420px)",
                      order: 2,
                      padding: "8px 10px 10px",
                      border: "1px solid #e7e0d6",
                      background: "#fffdf9",
                      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                    }
                  : {
                      flex: "0 0 auto",
                      width: "100%",
                      maxWidth: "100%",
                      minWidth: 0,
                      maxHeight: "min(44vh, 420px)",
                      order: 2,
                      padding: "4px 6px 6px",
                      border: "1px solid rgba(148, 163, 184, 0.06)",
                      background: "rgba(15, 23, 42, 0.1)",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.02), 0 6px 18px rgba(2, 6, 23, 0.12)",
                    }
                : premiumInspectorCollapsed
                  ? {
                      flex: configuracionMapEditorLayout ? "0 0 40px" : "0 0 36px",
                      width: configuracionMapEditorLayout ? 40 : 36,
                      minWidth: configuracionMapEditorLayout ? 40 : 36,
                      maxWidth: configuracionMapEditorLayout ? 40 : 36,
                      padding: configuracionMapEditorLayout ? "8px 3px" : "6px 2px",
                      border: configuracionMapEditorLayout
                        ? "1px solid #e7e0d6"
                        : "1px solid rgba(148, 163, 184, 0.06)",
                      background: configuracionMapEditorLayout
                        ? "#f7f4ef"
                        : "rgba(15, 23, 42, 0.1)",
                      boxShadow: configuracionMapEditorLayout
                        ? "0 1px 2px rgba(15, 23, 42, 0.04)"
                        : "inset 0 1px 0 rgba(255,255,255,0.02), 0 6px 18px rgba(2, 6, 23, 0.12)",
                      alignItems: "center",
                    }
                  : configuracionMapEditorLayout
                    ? {
                        flex: "0 0 212px",
                        width: 212,
                        minWidth: 188,
                        maxWidth: 220,
                        padding: "8px 10px 10px",
                        border: "1px solid #e7e0d6",
                        background: "#fffdf9",
                        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                      }
                    : {
                      flex: "0 0 148px",
                      width: 148,
                      minWidth: 132,
                      padding: "3px 5px 5px",
                      border: "1px solid rgba(148, 163, 184, 0.06)",
                      background: "rgba(15, 23, 42, 0.1)",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.02), 0 6px 18px rgba(2, 6, 23, 0.12)",
                    }
              : {}),
            ...(editorLayoutNarrow && !premiumSpatialEditor
              ? {
                  flex: "0 0 auto",
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  maxHeight: "min(44vh, 420px)",
                  order: 2,
                }
              : {}),
          }}
        >
          {premiumSpatialEditor &&
          !editorLayoutNarrow &&
          premiumInspectorCollapsed ? (
            <button
              type="button"
              aria-label="Abrir inspector"
              title="Abrir inspector"
              onClick={() => setPremiumInspectorCollapsed(false)}
              style={{
                border: configuracionMapEditorLayout
                  ? "1px solid #e2e8f0"
                  : "1px solid rgba(148, 163, 184, 0.14)",
                background: configuracionMapEditorLayout
                  ? "#ffffff"
                  : "rgba(30, 41, 59, 0.55)",
                color: configuracionMapEditorLayout ? "#64748b" : "#94a3b8",
                borderRadius: 6,
                width: "100%",
                flex: 1,
                minHeight: 72,
                maxHeight: "min(60vh, 420px)",
                cursor: "pointer",
                fontSize: configuracionMapEditorLayout ? 9 : 14,
                lineHeight: configuracionMapEditorLayout ? 1.2 : 1,
                fontWeight: configuracionMapEditorLayout ? 600 : 400,
                letterSpacing: configuracionMapEditorLayout ? "0.08em" : "normal",
                textTransform: configuracionMapEditorLayout ? "uppercase" : "none",
                writingMode: configuracionMapEditorLayout ? "vertical-rl" : "horizontal-tb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: configuracionMapEditorLayout ? "10px 0" : 0,
              }}
            >
              {configuracionMapEditorLayout ? "Inspector" : "⟨"}
            </button>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  marginBottom:
                    configuracionMapEditorLayout && premiumSpatialEditor
                      ? 2
                      : premiumSpatialEditor
                        ? 4
                        : 10,
                }}
              >
                <div
                  style={{
                    ...sidePanelTitleStyle,
                    marginBottom: 0,
                    ...(premiumSpatialEditor && configuracionMapEditorLayout
                      ? {
                          color: "#64748b",
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: "0.07em",
                        }
                      : premiumSpatialEditor
                        ? {
                            color: "#94a3b8",
                            fontSize: 8.5,
                            letterSpacing: "0.1em",
                          }
                        : {}),
                  }}
                >
                  {editingZones
                    ? "Zona"
                    : premiumSpatialEditor
                      ? "Inspector"
                      : "Detalle"}
                </div>
                {premiumSpatialEditor && !editorLayoutNarrow ? (
                  <button
                    type="button"
                    aria-label="Minimizar inspector"
                    title="Minimizar"
                    onClick={() => setPremiumInspectorCollapsed(true)}
                    style={{
                      border:
                        configuracionMapEditorLayout && premiumSpatialEditor
                          ? "1px solid #e2e8f0"
                          : "1px solid rgba(148, 163, 184, 0.1)",
                      background:
                        configuracionMapEditorLayout && premiumSpatialEditor
                          ? "#ffffff"
                          : "rgba(30, 41, 59, 0.35)",
                      color: "#64748b",
                      borderRadius: 6,
                      width: 24,
                      height: 24,
                      cursor: "pointer",
                      fontSize: 12,
                      lineHeight: 1,
                      flex: "none",
                      padding: 0,
                    }}
                  >
                    ⟩
                  </button>
                ) : null}
              </div>

          {editingZones ? (
            selectedZone ? (
              <>
                <div style={{ flex: 1, minHeight: 0, overflow: "auto", paddingRight: 2 }}>
                <div style={{ ...fieldBlock, marginBottom: insFieldMb }}>
                  <label htmlFor="zona-nombre" style={mapInspectorLabelStyle}>
                    Nombre
                  </label>
                  <input
                    id="zona-nombre"
                    style={mapInspectorInputStyle}
                    value={zoneDraft.name}
                    onChange={(e) =>
                      setZoneDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    onBlur={() => void persistZoneFields()}
                  />
                </div>

                <div style={{ ...fieldBlock, marginBottom: insFieldMb }}>
                  <label htmlFor="zona-color" style={mapInspectorLabelStyle}>
                    Color
                  </label>
                  <input
                    id="zona-color"
                    style={mapInspectorInputStyle}
                    value={zoneDraft.color}
                    placeholder="#38bdf8"
                    onChange={(e) =>
                      setZoneDraft((d) => ({ ...d, color: e.target.value }))
                    }
                    onBlur={() => void persistZoneFields()}
                  />
                </div>

                <div
                  style={{
                    ...fieldBlock,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: insGridGap,
                    marginBottom:
                      configuracionMapEditorLayout && premiumSpatialEditor
                        ? 3
                        : premiumSpatialEditor
                          ? 6
                          : undefined,
                  }}
                >
                  <div>
                    <label htmlFor="zona-x" style={mapInspectorLabelStyle}>
                      X
                    </label>
                    <input
                      id="zona-x"
                      type="number"
                      style={mapInspectorInputStyle}
                      value={zoneDraft.x}
                      onChange={(e) =>
                        setZoneDraft((d) => ({ ...d, x: e.target.value }))
                      }
                      onBlur={() => void persistZoneFields()}
                    />
                  </div>
                  <div>
                    <label htmlFor="zona-y" style={mapInspectorLabelStyle}>
                      Y
                    </label>
                    <input
                      id="zona-y"
                      type="number"
                      style={mapInspectorInputStyle}
                      value={zoneDraft.y}
                      onChange={(e) =>
                        setZoneDraft((d) => ({ ...d, y: e.target.value }))
                      }
                      onBlur={() => void persistZoneFields()}
                    />
                  </div>
                </div>

                <div
                  style={{
                    ...fieldBlock,
                    marginBottom:
                      configuracionMapEditorLayout && premiumSpatialEditor
                        ? 6
                        : premiumSpatialEditor
                          ? 10
                          : 16,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: insGridGap,
                  }}
                >
                  <div>
                    <label htmlFor="zona-w" style={mapInspectorLabelStyle}>
                      Ancho
                    </label>
                    <input
                      id="zona-w"
                      type="number"
                      min={120}
                      style={mapInspectorInputStyle}
                      value={zoneDraft.width}
                      onChange={(e) =>
                        setZoneDraft((d) => ({ ...d, width: e.target.value }))
                      }
                      onBlur={() => void persistZoneFields()}
                    />
                  </div>
                  <div>
                    <label htmlFor="zona-h" style={mapInspectorLabelStyle}>
                      Alto
                    </label>
                    <input
                      id="zona-h"
                      type="number"
                      min={90}
                      style={mapInspectorInputStyle}
                      value={zoneDraft.height}
                      onChange={(e) =>
                        setZoneDraft((d) => ({ ...d, height: e.target.value }))
                      }
                      onBlur={() => void persistZoneFields()}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  style={btnDanger}
                  title="Eliminar zona visual"
                  onClick={() => void handleDeleteZoneVisual()}
                >
                  {premiumSpatialEditor ? "Eliminar" : "Eliminar zona visual"}
                </button>
                </div>
              </>
            ) : (
              <div style={sideEmptyStyle}>
                <div>Selecciona una zona</div>
                <div style={{ color: "#64748b", fontWeight: 500, fontSize: 13 }}>
                  o crea una nueva zona visual
                </div>
              </div>
            )
          ) : selectedIds.length >= 2 ? (
            <div
              style={{
                ...sideEmptyStyle,
                flex: 1,
                justifyContent: "flex-start",
                paddingTop: 12,
              }}
            >
              <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: premiumSpatialEditor ? 14 : 15 }}>
                {premiumSpatialEditor
                  ? `${selectedIds.length} sel.`
                  : `${selectedIds.length} elementos seleccionados`}
              </div>
              <div
                style={{
                  color: "#64748b",
                  fontWeight: 500,
                  fontSize: premiumSpatialEditor ? 12 : 13,
                  textAlign: "center",
                  lineHeight: 1.45,
                }}
              >
                {premiumSpatialEditor
                  ? "Mayús+clic · el primero es referencia al alinear."
                  : "Mayús+clic para añadir o quitar. El primero en la selección es la referencia al alinear."}
              </div>
            </div>
          ) : selectedElement ? (
            cfgMapUi ? (
              <ConfigMapElementContextPanel
                element={selectedElement}
                visibleZones={visibleZones}
                nameDraft={nameDraft}
                dimDraft={dimDraft}
                showAdvancedLayout={cfgInspectorAdvancedOpen}
                actionFeedback={cfgMapActionFeedback}
                onToggleAdvancedLayout={() =>
                  setCfgInspectorAdvancedOpen((open) => !open)
                }
                onNameChange={setNameDraft}
                onNameBlur={() => void persistName()}
                onZoneChange={(zoneId) => void persistZone(zoneId)}
                onSeatsChange={persistSeats}
                onDuplicate={() => void handleDuplicate()}
                onDelete={() => void handleDelete()}
                onDimChange={(key, value) =>
                  setDimDraft((current) => ({ ...current, [key]: value }))
                }
                onDimBlur={() => void persistDims()}
                minSize={minSizeForPlanType(selectedElement.type)}
                footerActions={
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 5,
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        ...inspectorCfgFooterBtn,
                        cursor:
                          selectedElementIndex < 0 ||
                          selectedElementIndex >= elements.length - 1
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          selectedElementIndex < 0 ||
                          selectedElementIndex >= elements.length - 1
                            ? 0.45
                            : 1,
                      }}
                      disabled={
                        selectedElementIndex < 0 ||
                        selectedElementIndex >= elements.length - 1
                      }
                      onClick={() => void handleBringToFront()}
                    >
                      Delante
                    </button>
                    <button
                      type="button"
                      style={{
                        ...inspectorCfgFooterBtn,
                        cursor:
                          selectedElementIndex <= 0 ? "not-allowed" : "pointer",
                        opacity: selectedElementIndex <= 0 ? 0.45 : 1,
                      }}
                      disabled={selectedElementIndex <= 0}
                      onClick={() => void handleSendToBack()}
                    >
                      Detrás
                    </button>
                  </div>
                }
              />
            ) : (
            <>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", paddingRight: 2 }}>

            <div style={{ ...fieldBlock, marginBottom: insFieldMb }}>
              <label htmlFor="el-nombre" style={mapInspectorLabelStyle}>
                Nombre
              </label>
              <input
                id="el-nombre"
                style={mapInspectorInputStyle}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void persistName()}
              />
            </div>

            <div style={{ ...fieldBlock, marginBottom: insFieldMb }}>
              <label htmlFor="el-tipo" style={mapInspectorLabelStyle}>
                Tipo
              </label>
              <input
                id="el-tipo"
                readOnly
                tabIndex={-1}
                style={premiumSpatialEditor ? { ...mapInspectorInputStyle, opacity: 0.85 } : readOnlyStyle}
                value={planTypeLabelEs(selectedElement.type)}
              />
            </div>

            {premiumSpatialEditor ? (
              <div
                style={cfgMapUi ? inspectorCfgDivider : inspectorPremiumDivider}
                aria-hidden
              />
            ) : null}

            <div style={{ ...fieldBlock, marginBottom: insFieldMb }}>
              <button
                type="button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  padding: cfgMapUi
                    ? "5px 8px"
                    : premiumSpatialEditor
                      ? "7px 10px"
                      : "10px 12px",
                  borderRadius: cfgMapUi ? 6 : premiumSpatialEditor ? 8 : 10,
                  border: cfgMapUi
                    ? "1px solid #e2e8f0"
                    : "1px solid rgba(148, 163, 184, 0.22)",
                  background: cfgMapUi ? "#ffffff" : "rgba(15, 23, 42, 0.28)",
                  color: cfgMapUi ? "#334155" : "#e2e8f0",
                  fontWeight: 600,
                  fontSize: cfgMapUi ? 11 : premiumSpatialEditor ? 11 : 13,
                  cursor: "pointer",
                  boxShadow: cfgMapUi
                    ? "0 1px 2px rgba(15, 23, 42, 0.04)"
                    : undefined,
                  transition: cfgMapUi
                    ? "background-color 140ms ease, border-color 140ms ease"
                    : undefined,
                }}
                onClick={() => void handleToggleElementLock()}
              >
                {selectedElement.locked === true
                  ? premiumSpatialEditor
                    ? "Desbloquear"
                    : "Desbloquear elemento"
                  : premiumSpatialEditor
                    ? "Bloquear"
                    : "Bloquear elemento"}
              </button>
            </div>

            <div style={{ ...fieldBlock, marginBottom: insFieldMb }}>
              <label htmlFor="el-zona" style={mapInspectorLabelStyle}>
                Zona
              </label>
              <select
                id="el-zona"
                style={mapInspectorInputStyle}
                value={selectedElement.zoneId ?? ""}
                onChange={(e) => void persistZone(e.target.value)}
              >
                <option value="">Sin zona</option>
                {visibleZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                ...fieldBlock,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: insGridGap,
                marginBottom:
                  configuracionMapEditorLayout && premiumSpatialEditor
                    ? 3
                    : premiumSpatialEditor
                      ? 6
                      : undefined,
              }}
            >
              <div>
                <label htmlFor="el-x" style={mapInspectorLabelStyle}>
                  {premiumSpatialEditor ? "X" : "Posición X"}
                </label>
                <input
                  id="el-x"
                  type="number"
                  style={mapInspectorInputStyle}
                  value={dimDraft.x}
                  onChange={(e) =>
                    setDimDraft((d) => ({ ...d, x: e.target.value }))
                  }
                  onBlur={() => void persistDims()}
                />
              </div>
              <div>
                <label htmlFor="el-y" style={mapInspectorLabelStyle}>
                  {premiumSpatialEditor ? "Y" : "Posición Y"}
                </label>
                <input
                  id="el-y"
                  type="number"
                  style={mapInspectorInputStyle}
                  value={dimDraft.y}
                  onChange={(e) =>
                    setDimDraft((d) => ({ ...d, y: e.target.value }))
                  }
                  onBlur={() => void persistDims()}
                />
              </div>
            </div>

            <div
              style={{
                ...fieldBlock,
                marginBottom:
                  configuracionMapEditorLayout && premiumSpatialEditor
                    ? 5
                    : 10,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: insGridGap,
              }}
            >
              <div>
                <label htmlFor="el-w" style={mapInspectorLabelStyle}>
                  Ancho
                </label>
                <input
                  id="el-w"
                  type="number"
                  min={minSizeForPlanType(selectedElement.type).w}
                  style={mapInspectorInputStyle}
                  value={dimDraft.w}
                  onChange={(e) =>
                    setDimDraft((d) => ({ ...d, w: e.target.value }))
                  }
                  onBlur={() => void persistDims()}
                />
              </div>
              <div>
                <label htmlFor="el-h" style={mapInspectorLabelStyle}>
                  Alto
                </label>
                <input
                  id="el-h"
                  type="number"
                  min={minSizeForPlanType(selectedElement.type).h}
                  style={mapInspectorInputStyle}
                  value={dimDraft.h}
                  onChange={(e) =>
                    setDimDraft((d) => ({ ...d, h: e.target.value }))
                  }
                  onBlur={() => void persistDims()}
                />
              </div>
            </div>

            <div
              style={{
                position: "sticky",
                bottom: 0,
                marginTop: cfgMapUi ? 6 : 10,
                paddingTop: cfgMapUi ? 8 : 10,
                paddingBottom: cfgMapUi ? 6 : 0,
                borderTop: cfgMapUi
                  ? "1px solid #e2e8f0"
                  : "1px solid rgba(148, 163, 184, 0.18)",
                background: cfgMapUi ? "#f8fafc" : "rgba(15, 23, 42, 0.35)",
                backdropFilter: cfgMapUi ? undefined : "blur(6px)",
                WebkitBackdropFilter: cfgMapUi ? undefined : "blur(6px)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: cfgMapUi ? 5 : 8,
                  marginBottom: cfgMapUi ? 5 : 8,
                }}
              >
                <button
                  type="button"
                  style={{
                    ...(cfgMapUi
                      ? inspectorCfgFooterBtn
                      : {
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(148, 163, 184, 0.28)",
                          background: "rgba(15, 23, 42, 0.28)",
                          color: "#e2e8f0",
                          fontWeight: 700,
                          fontSize: 13,
                        }),
                    cursor:
                      selectedElementIndex < 0 ||
                      selectedElementIndex >= elements.length - 1
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      selectedElementIndex < 0 ||
                      selectedElementIndex >= elements.length - 1
                        ? 0.45
                        : 1,
                  }}
                  disabled={
                    selectedElementIndex < 0 ||
                    selectedElementIndex >= elements.length - 1
                  }
                  onClick={() => void handleBringToFront()}
                  title="Traer delante"
                >
                  {premiumSpatialEditor ? "Delante" : "Traer delante"}
                </button>
                <button
                  type="button"
                  style={{
                    ...(cfgMapUi
                      ? inspectorCfgFooterBtn
                      : {
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(148, 163, 184, 0.28)",
                          background: "rgba(15, 23, 42, 0.28)",
                          color: "#e2e8f0",
                          fontWeight: 700,
                          fontSize: 13,
                        }),
                    cursor:
                      selectedElementIndex <= 0 ? "not-allowed" : "pointer",
                    opacity: selectedElementIndex <= 0 ? 0.45 : 1,
                  }}
                  disabled={selectedElementIndex <= 0}
                  onClick={() => void handleSendToBack()}
                  title="Enviar detrás"
                >
                  {premiumSpatialEditor ? "Detrás" : "Enviar detrás"}
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: cfgMapUi ? 5 : 8,
                }}
              >
                <button
                  type="button"
                  style={{
                    ...(cfgMapUi
                      ? inspectorCfgFooterBtn
                      : {
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(148, 163, 184, 0.28)",
                          background: "rgba(15, 23, 42, 0.28)",
                          color: "#e2e8f0",
                          fontWeight: 700,
                          fontSize: 13,
                        }),
                    cursor: "pointer",
                  }}
                  onClick={() => void handleDuplicate()}
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  style={
                    cfgMapUi
                      ? { ...inspectorCfgFooterDelete, cursor: "pointer" }
                      : btnDanger
                  }
                  onClick={() => void handleDelete()}
                >
                  Eliminar
                </button>
              </div>
            </div>
            </div>
            </>
            )
          ) : cfgMapUi && roomsAssistantGuideVisible ? (
            <ConfigMapInspectorGuide
              tableCount={
                visibleElements.filter((element) => element.type === "table")
                  .length
              }
              zoneCount={visibleZones.length}
              onDismiss={() => {
                dismissRoomsAssistantGuide();
                setRoomsAssistantGuideVisible(false);
              }}
            />
          ) : cfgMapUi ? (
            <ConfigMapInspectorIdleHint />
          ) : (
            <div style={sideEmptyStyle}>
              <div>Selecciona un elemento</div>
              <div style={{ color: "#64748b", fontWeight: 500, fontSize: 13 }}>
                o añade uno nuevo al plano
              </div>
            </div>
          )}
            </>
          )}
        </aside>
        ) : null}
        </div>
      </div>
    </ModulePageShell>
  );
}
