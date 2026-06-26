"use client";

import {
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Armchair,
  ArrowRight,
  Copy,
  DoorOpen,
  GlassWater,
  LayoutGrid,
  Move,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import type { FloorElement } from "@/lib/firestore/tables";
import { isDecorativePlanElementType } from "@/lib/firestore/tables";
import {
  isTableLikePlanElement,
  planTypeLabelEs,
  resolvePlanElementDisplayName,
} from "@/lib/map/plan-element-labels";
import type { Zone } from "@/lib/firestore/zones";
import type { ScreenRect } from "@/components/map/MapFloatingQuickActions";
import {
  HostlyButton,
  HostlyOperationalEmptyState,
} from "@/components/ui/hostly";

const SEAT_OPTIONS = [2, 4, 6, 8] as const;
const HUD_VIEWPORT_PAD = 10;
const HUD_MAP_PAD = 6;

type ConfigMapAssistantPlanoBannerProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function ConfigMapAssistantPlanoBanner({
  visible,
  onDismiss,
}: ConfigMapAssistantPlanoBannerProps) {
  if (!visible) return null;

  return (
    <div className="hostly-floor-editor-assistant-banner" role="status">
      <div className="hostly-floor-editor-assistant-banner__copy">
        <p className="hostly-floor-editor-assistant-banner__title">
          Plano listo desde el Asistente de Salas
        </p>
        <p className="hostly-floor-editor-assistant-banner__hint">
          Mueve mesas, cambia nombres y capacidad. Cuando termines, pulsa Guardar.
        </p>
      </div>
      <HostlyButton
        variant="secondary"
        className="hostly-floor-editor-assistant-banner__action"
        onClick={onDismiss}
      >
        Entendido
      </HostlyButton>
    </div>
  );
}

type ConfigMapInspectorGuideProps = {
  tableCount: number;
  zoneCount: number;
  onDismiss: () => void;
};

export function ConfigMapInspectorGuide({
  tableCount,
  zoneCount,
  onDismiss,
}: ConfigMapInspectorGuideProps) {
  return (
    <div className="hostly-floor-editor-guide hostly-floor-editor-guide--onboarding">
      <button
        type="button"
        className="hostly-floor-editor-guide__close"
        aria-label="Cerrar guía"
        onClick={onDismiss}
      >
        <X className="hostly-icon-sm" aria-hidden />
      </button>
      <p className="hostly-floor-editor-guide__eyebrow">Primeros pasos</p>
      <h2 className="hostly-floor-editor-guide__title">Ajusta tu sala</h2>
      <p className="hostly-floor-editor-guide__summary">
        {tableCount} mesas · {zoneCount} {zoneCount === 1 ? "zona" : "zonas"}
      </p>
      <ul className="hostly-floor-editor-guide__steps">
        <li>
          <Move className="hostly-icon-sm" aria-hidden />
          Toca y arrastra para mover
        </li>
        <li>
          <Utensils className="hostly-icon-sm" aria-hidden />
          Cambia nombre y comensales en el panel
        </li>
      </ul>
      <HostlyButton
        variant="primary"
        className="hostly-floor-editor-guide__cta"
        onClick={onDismiss}
      >
        Empezar
        <ArrowRight className="hostly-icon-sm" aria-hidden />
      </HostlyButton>
    </div>
  );
}

type ConfigMapEditorEmptyStateProps = {
  hasAssistantDraft?: boolean;
  onStartManualPlacement?: () => void;
};

export function ConfigMapEditorEmptyState({
  hasAssistantDraft = false,
  onStartManualPlacement,
}: ConfigMapEditorEmptyStateProps) {
  const hints = hasAssistantDraft
    ? [
        "Tienes un borrador del Asistente: vuelve atrás para regenerar el plano.",
        "O elige una mesa en el panel izquierdo y tócala aquí.",
      ]
    : [
        "Usa el Asistente de Salas para generar un plano en minutos.",
        "O elige una mesa en el panel izquierdo y tócala aquí.",
      ];

  return (
    <div className="hostly-floor-editor-empty" aria-live="polite">
      <HostlyOperationalEmptyState
        className="hostly-floor-editor-empty-card"
        icon={
          <span className="hostly-floor-editor-empty__icon" aria-hidden>
            <LayoutGrid className="hostly-icon-lg" />
          </span>
        }
        title="Todavía no hay plano"
        text="Coloca mesas, barra o zonas para montar tu sala."
        hints={hints}
        primaryAction={
          onStartManualPlacement
            ? {
                label: "Colocar mesa",
                onClick: onStartManualPlacement,
              }
            : undefined
        }
      />
    </div>
  );
}

type ConfigMapActionFeedbackProps = {
  message: string | null;
};

export function ConfigMapActionFeedback({ message }: ConfigMapActionFeedbackProps) {
  if (!message) return null;

  return (
    <div
      className="hostly-floor-editor-action-feedback"
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

function renderTypeIcon(type: FloorElement["type"]) {
  const className = "hostly-icon-lg";
  if (type === "bar") return <GlassWater className={className} aria-hidden />;
  if (type === "door") return <DoorOpen className={className} aria-hidden />;
  if (type === "table") return <Utensils className={className} aria-hidden />;
  return <Armchair className={className} aria-hidden />;
}

type ConfigMapElementContextPanelProps = {
  element: FloorElement;
  visibleZones: Zone[];
  nameDraft: string;
  dimDraft: { w: string; h: string; x: string; y: string };
  showAdvancedLayout: boolean;
  actionFeedback?: string | null;
  onToggleAdvancedLayout: () => void;
  onNameChange: (value: string) => void;
  onNameBlur: () => void;
  onZoneChange: (zoneId: string) => void;
  onSeatsChange: (seats: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDimChange: (key: "w" | "h" | "x" | "y", value: string) => void;
  onDimBlur: () => void;
  minSize: { w: number; h: number };
  footerActions?: ReactNode;
};

export function ConfigMapElementContextPanel({
  element,
  visibleZones,
  nameDraft,
  dimDraft,
  showAdvancedLayout,
  actionFeedback,
  onToggleAdvancedLayout,
  onNameChange,
  onNameBlur,
  onZoneChange,
  onSeatsChange,
  onDuplicate,
  onDelete,
  onDimChange,
  onDimBlur,
  minSize,
  footerActions,
}: ConfigMapElementContextPanelProps) {
  const zoneName =
    visibleZones.find((zone) => zone.id === element.zoneId)?.name ??
    element.zoneName ??
    "Sin zona";
  const isTable = isTableLikePlanElement(element.type);
  const seats = element.seats ?? 4;

  return (
    <div className="hostly-floor-editor-context">
      <ConfigMapActionFeedback message={actionFeedback ?? null} />

      <div className="hostly-floor-editor-context__hero">
        <span className="hostly-floor-editor-context__icon" aria-hidden>
          {renderTypeIcon(element.type)}
        </span>
        <div className="hostly-floor-editor-context__heading">
          <span className="hostly-floor-editor-context__type">
            {planTypeLabelEs(element.type)}
          </span>
          <strong className="hostly-floor-editor-context__name">
            {nameDraft.trim() || resolvePlanElementDisplayName(element)}
          </strong>
          <span className="hostly-floor-editor-context__meta">
            {zoneName}
            {isTable && !isDecorativePlanElementType(element.type)
              ? ` · ${seats} comensales`
              : null}
          </span>
        </div>
      </div>

      <div className="hostly-floor-editor-context__actions">
        <HostlyButton
          variant="secondary"
          className="hostly-floor-editor-context__action"
          onClick={onDuplicate}
        >
          <Copy className="hostly-icon-sm" aria-hidden />
          Duplicar
        </HostlyButton>
        <HostlyButton
          variant="secondary"
          className="hostly-floor-editor-context__action hostly-floor-editor-context__action--danger"
          onClick={onDelete}
        >
          <Trash2 className="hostly-icon-sm" aria-hidden />
          Eliminar
        </HostlyButton>
      </div>

      <label className="hostly-floor-editor-context__field" htmlFor="cfg-el-nombre">
        <span>Nombre en sala</span>
        <input
          id="cfg-el-nombre"
          className="hostly-floor-editor-context__input"
          value={nameDraft}
          onChange={(event) => onNameChange(event.target.value)}
          onBlur={onNameBlur}
        />
      </label>

      {isTable && !isDecorativePlanElementType(element.type) ? (
        <div className="hostly-floor-editor-context__field">
          <span>Comensales</span>
          <div
            className="hostly-floor-editor-context__seat-row"
            role="group"
            aria-label="Comensales de la mesa"
          >
            {SEAT_OPTIONS.map((option) => {
              const active = seats === option;
              return (
                <button
                  key={option}
                  type="button"
                  className={`hostly-floor-editor-context__seat-chip${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => onSeatsChange(option)}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <label className="hostly-floor-editor-context__field" htmlFor="cfg-el-zona">
        <span>Zona</span>
        <select
          id="cfg-el-zona"
          className="hostly-floor-editor-context__input"
          value={element.zoneId ?? ""}
          onChange={(event) => onZoneChange(event.target.value)}
        >
          <option value="">Sin zona</option>
          {visibleZones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="hostly-floor-editor-context__advanced-toggle"
        aria-expanded={showAdvancedLayout}
        onClick={onToggleAdvancedLayout}
      >
        {showAdvancedLayout ? "Ocultar tamaño" : "Tamaño y posición"}
      </button>

      {showAdvancedLayout ? (
        <div className="hostly-floor-editor-context__advanced">
          <div className="hostly-floor-editor-context__grid">
            <label htmlFor="cfg-el-x">
              <span>X</span>
              <input
                id="cfg-el-x"
                type="number"
                className="hostly-floor-editor-context__input"
                value={dimDraft.x}
                onChange={(event) => onDimChange("x", event.target.value)}
                onBlur={onDimBlur}
              />
            </label>
            <label htmlFor="cfg-el-y">
              <span>Y</span>
              <input
                id="cfg-el-y"
                type="number"
                className="hostly-floor-editor-context__input"
                value={dimDraft.y}
                onChange={(event) => onDimChange("y", event.target.value)}
                onBlur={onDimBlur}
              />
            </label>
            <label htmlFor="cfg-el-w">
              <span>Ancho</span>
              <input
                id="cfg-el-w"
                type="number"
                min={minSize.w}
                className="hostly-floor-editor-context__input"
                value={dimDraft.w}
                onChange={(event) => onDimChange("w", event.target.value)}
                onBlur={onDimBlur}
              />
            </label>
            <label htmlFor="cfg-el-h">
              <span>Alto</span>
              <input
                id="cfg-el-h"
                type="number"
                min={minSize.h}
                className="hostly-floor-editor-context__input"
                value={dimDraft.h}
                onChange={(event) => onDimChange("h", event.target.value)}
                onBlur={onDimBlur}
              />
            </label>
          </div>
        </div>
      ) : null}

      {footerActions ? (
        <div className="hostly-floor-editor-context__footer">{footerActions}</div>
      ) : null}
    </div>
  );
}

export const configMapSelectionHudStyle: CSSProperties = {
  position: "fixed",
  zIndex: 55,
  pointerEvents: "none",
  padding: "6px 12px",
  borderRadius: 10,
  border: "1px solid color-mix(in srgb, var(--hostly-accent) 32%, var(--hostly-line))",
  background: "rgba(255, 255, 255, 0.96)",
  boxShadow: "var(--hostly-shadow-card)",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--hostly-ink-strong)",
  maxWidth: "min(280px, calc(100vw - 24px))",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function resolveHudBounds(bounds?: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): { left: number; top: number; right: number; bottom: number } {
  if (bounds) return bounds;

  if (typeof window === "undefined") {
    return {
      left: HUD_VIEWPORT_PAD,
      top: HUD_VIEWPORT_PAD,
      right: 1000,
      bottom: 800,
    };
  }

  return {
    left: HUD_VIEWPORT_PAD,
    top: HUD_VIEWPORT_PAD,
    right: window.innerWidth - HUD_VIEWPORT_PAD,
    bottom: window.innerHeight - HUD_VIEWPORT_PAD,
  };
}

export function computeConfigMapSelectionHudStyle(
  anchor: ScreenRect,
  hudSize: { width: number; height: number },
  boundsOverride?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  },
): CSSProperties {
  const bounds = resolveHudBounds(boundsOverride);
  const centerX = anchor.left + anchor.width / 2;
  const spaceAbove = anchor.top - bounds.top;
  const spaceBelow = bounds.bottom - (anchor.top + anchor.height);
  const placeBelow =
    spaceAbove < hudSize.height + 12 && spaceBelow > spaceAbove;

  let top = placeBelow
    ? anchor.top + anchor.height + 8
    : anchor.top - 8;
  const transform = placeBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)";

  if (placeBelow) {
    const maxTop = bounds.bottom - hudSize.height;
    top = Math.min(top, maxTop);
  } else {
    const minTop = bounds.top + hudSize.height;
    top = Math.max(top, minTop);
  }

  const halfW = hudSize.width / 2;
  const minLeft = bounds.left + halfW;
  const maxLeft = bounds.right - halfW;
  const left = Math.max(minLeft, Math.min(maxLeft, centerX));

  return {
    ...configMapSelectionHudStyle,
    left,
    top,
    transform,
  };
}

type ConfigMapSelectionHudProps = {
  anchor: ScreenRect;
  element: FloorElement;
  mapBounds?: ScreenRect | null;
};

function screenRectToHudBounds(rect: ScreenRect) {
  return {
    left: rect.left + HUD_MAP_PAD,
    top: rect.top + HUD_MAP_PAD,
    right: rect.left + rect.width - HUD_MAP_PAD,
    bottom: rect.top + rect.height - HUD_MAP_PAD,
  };
}

export function ConfigMapSelectionHud({
  anchor,
  element,
  mapBounds = null,
}: ConfigMapSelectionHudProps) {
  const style = useMemo(
    () =>
      computeConfigMapSelectionHudStyle(
        anchor,
        { width: 220, height: 32 },
        mapBounds ? screenRectToHudBounds(mapBounds) : undefined,
      ),
    [anchor, mapBounds, element.id],
  );

  const zoneLabel = element.zoneName ? ` · ${element.zoneName}` : "";
  const seatsLabel =
    element.type === "table" ? ` · ${element.seats ?? 4} comensales` : "";

  return (
    <div
      className="hostly-floor-editor-selection-hud"
      role="status"
      aria-live="polite"
      style={style}
    >
      <strong>{resolvePlanElementDisplayName(element)}</strong>
      <span className="hostly-floor-editor-selection-hud__meta">
        {" "}
        · {planTypeLabelEs(element.type)}
        {zoneLabel}
        {seatsLabel}
      </span>
    </div>
  );
}

export function ConfigMapInspectorIdleHint() {
  return (
    <div className="hostly-floor-editor-guide hostly-floor-editor-guide--compact">
      <p className="hostly-floor-editor-guide__eyebrow">Plano editable</p>
      <h2 className="hostly-floor-editor-guide__title">Selecciona algo</h2>
      <p className="hostly-floor-editor-guide__summary">
        Toca una mesa, la barra o una puerta para ver sus opciones.
      </p>
    </div>
  );
}
