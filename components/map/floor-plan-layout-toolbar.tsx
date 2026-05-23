"use client";

import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HostlySurface } from "@/components/ui/hostly";
import type { FloorPlanSnapshotSummary } from "@/lib/firestore/floor-plan-snapshots";
import type { ActiveFloorPlanLayoutEntry } from "@/lib/firestore/floor-plan-layouts";
import type {
  FloorPlanLayoutActivatePrecheck,
  FloorPlanLayoutBusyAction,
  FloorPlanLayoutFeedback,
} from "@/hooks/useFloorPlanLayouts";

type OpenPanel = "save" | "activate" | "archive" | null;

const selectStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
  fontSize: 11,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--hostly-line)",
  background: "rgba(255, 255, 255, 0.92)",
  color: "#334155",
  cursor: "pointer",
};

const btnPrimary: CSSProperties = {
  fontSize: 11,
  fontWeight: 650,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid rgba(63, 100, 120, 0.35)",
  background: "rgba(63, 100, 120, 0.1)",
  color: "#1e3a4a",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnGhost: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: "5px 8px",
  borderRadius: 8,
  border: "1px solid var(--hostly-line)",
  background: "rgba(255, 255, 255, 0.65)",
  color: "#475569",
  cursor: "pointer",
};

const microLabel: CSSProperties = {
  fontSize: 9,
  fontWeight: 650,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "#64748b",
  margin: 0,
};

const statusText: CSSProperties = {
  fontSize: 10,
  color: "#64748b",
  lineHeight: 1.35,
  margin: 0,
};

const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 9,
  fontWeight: 650,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 4,
};

const fieldInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 11,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--hostly-line)",
  background: "rgba(255, 255, 255, 0.95)",
  color: "#334155",
  outline: "none",
};

const panelActions: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  justifyContent: "flex-end",
  marginTop: 4,
};

export type FloorPlanLayoutToolbarProps = {
  presets: FloorPlanSnapshotSummary[];
  activeLayout: ActiveFloorPlanLayoutEntry | null;
  loading: boolean;
  error: string | null;
  busyAction: FloorPlanLayoutBusyAction;
  feedback: FloorPlanLayoutFeedback | null;
  hasUnsavedChanges?: boolean;
  disabled?: boolean;
  activatePrecheck?: FloorPlanLayoutActivatePrecheck;
  activatePrecheckHint?: string;
  onPresetSelectionChange?: (snapshotId: string) => void;
  onRefreshActivatePrecheck?: (snapshotId: string) => void;
  onSavePreset: (name: string, description?: string) => Promise<void>;
  onActivatePreset: (snapshotId: string) => Promise<void>;
  onDuplicatePreset: (snapshotId: string) => Promise<void>;
  onArchivePreset: (snapshotId: string) => Promise<void>;
};

export default function FloorPlanLayoutToolbar({
  presets,
  activeLayout,
  loading,
  error,
  busyAction,
  feedback,
  hasUnsavedChanges = false,
  disabled = false,
  activatePrecheck,
  activatePrecheckHint,
  onPresetSelectionChange,
  onRefreshActivatePrecheck,
  onSavePreset,
  onActivatePreset,
  onDuplicatePreset,
  onArchivePreset,
}: FloorPlanLayoutToolbarProps) {
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveNameError, setSaveNameError] = useState<string | null>(null);

  const isBusy = busyAction !== null;

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  );

  const activeLabel = useMemo(() => {
    if (!activeLayout?.snapshotName?.trim()) return "Sin layout activo";
    return activeLayout.snapshotName.trim();
  }, [activeLayout]);

  const suggestedSaveName = useMemo(
    () =>
      selectedPreset?.name?.trim() ||
      activeLayout?.snapshotName?.trim() ||
      "Nuevo layout",
    [activeLayout?.snapshotName, selectedPreset?.name],
  );

  const closePanel = useCallback(() => {
    setOpenPanel(null);
    setSaveNameError(null);
  }, []);

  useEffect(() => {
    if (!openPanel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePanel, openPanel]);

  useEffect(() => {
    if (disabled || isBusy) closePanel();
  }, [closePanel, disabled, isBusy]);

  const openSavePanel = useCallback(() => {
    setSaveName(suggestedSaveName);
    setSaveDescription("");
    setSaveNameError(null);
    setOpenPanel("save");
  }, [suggestedSaveName]);

  const submitSave = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = saveName.trim();
      if (!name) {
        setSaveNameError("El nombre es obligatorio");
        return;
      }
      setSaveNameError(null);
      try {
        const description = saveDescription.trim();
        await onSavePreset(name, description || undefined);
        closePanel();
      } catch {
        // feedback del hook
      }
    },
    [closePanel, onSavePreset, saveDescription, saveName],
  );

  const handleDuplicate = useCallback(async () => {
    if (!selectedPresetId) return;
    closePanel();
    await onDuplicatePreset(selectedPresetId);
  }, [closePanel, onDuplicatePreset, selectedPresetId]);

  const precheckForSelection =
    activatePrecheck?.snapshotId === selectedPresetId ? activatePrecheck : null;
  const activateBlockedByService = precheckForSelection?.blocked === true;
  const activatePrecheckLoading =
    Boolean(selectedPresetId) && precheckForSelection?.loading === true;

  const actionDisabled =
    disabled || loading || isBusy || !selectedPresetId;

  const activateDisabled =
    actionDisabled || activateBlockedByService || activatePrecheckLoading;

  const showPrecheckRefresh =
    Boolean(selectedPresetId) &&
    precheckForSelection != null &&
    !activatePrecheckLoading &&
    (precheckForSelection.blocked === true ||
      precheckForSelection.blocked === null);

  const confirmActivate = useCallback(async () => {
    if (!selectedPresetId || activateDisabled) return;
    try {
      await onActivatePreset(selectedPresetId);
      closePanel();
    } catch {
      // feedback del hook
    }
  }, [activateDisabled, closePanel, onActivatePreset, selectedPresetId]);

  const confirmArchive = useCallback(async () => {
    if (!selectedPresetId) return;
    try {
      await onArchivePreset(selectedPresetId);
      setSelectedPresetId("");
      onPresetSelectionChange?.("");
      closePanel();
    } catch {
      // feedback del hook
    }
  }, [closePanel, onArchivePreset, onPresetSelectionChange, selectedPresetId]);

  const panelBusy = isBusy;

  return (
    <HostlySurface
      variant="ice"
      className="hostly-floor-layout-toolbar"
      style={{
        padding: 8,
        marginBottom: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <p style={microLabel}>Layout del plano</p>

      <select
        id="hostly-floor-layout-select"
        aria-label="Layout guardado"
        value={selectedPresetId}
        onChange={(e) => {
          const nextId = e.target.value;
          setSelectedPresetId(nextId);
          onPresetSelectionChange?.(nextId);
          closePanel();
        }}
        disabled={disabled || loading || isBusy}
        style={selectStyle}
      >
        <option value="">
          {loading ? "Cargando layouts…" : "Elegir layout…"}
        </option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
            {typeof preset.tableCount === "number" ? ` · ${preset.tableCount} mesas` : ""}
          </option>
        ))}
      </select>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          type="button"
          style={{
            ...btnPrimary,
            flex: "1 1 auto",
            opacity: disabled || isBusy ? 0.45 : 1,
            cursor: disabled || isBusy ? "not-allowed" : "pointer",
          }}
          disabled={disabled || isBusy}
          onClick={openSavePanel}
        >
          {busyAction === "save" ? "Guardando…" : "Guardar layout"}
        </button>
        <button
          type="button"
          style={{
            ...btnGhost,
            opacity: activateDisabled ? 0.45 : 1,
            cursor: activateDisabled ? "not-allowed" : "pointer",
          }}
          disabled={activateDisabled}
          title={
            activateBlockedByService && activatePrecheckHint
              ? activatePrecheckHint
              : undefined
          }
          onClick={() => setOpenPanel("activate")}
        >
          {busyAction === "activate"
            ? "Activando…"
            : activatePrecheckLoading
              ? "Comprobando…"
              : "Activar"}
        </button>
      </div>

      {openPanel === "save" ? (
        <HostlySurface
          variant="soft"
          style={{
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            border: "1px solid var(--hostly-line)",
          }}
        >
          <p style={{ ...microLabel, marginBottom: 0 }}>Guardar layout</p>
          <form onSubmit={(event) => void submitSave(event)} noValidate>
            <label htmlFor="hostly-layout-save-name" style={fieldLabel}>
              Nombre
            </label>
            <input
              id="hostly-layout-save-name"
              type="text"
              value={saveName}
              onChange={(e) => {
                setSaveName(e.target.value);
                if (saveNameError) setSaveNameError(null);
              }}
              disabled={panelBusy}
              autoFocus
              style={fieldInput}
              aria-invalid={saveNameError != null}
            />
            {saveNameError ? (
              <p style={{ ...statusText, color: "#b91c1c", marginTop: 4 }} role="alert">
                {saveNameError}
              </p>
            ) : null}
            <label
              htmlFor="hostly-layout-save-description"
              style={{ ...fieldLabel, marginTop: 8 }}
            >
              Descripción <span className="hostly-muted">(opcional)</span>
            </label>
            <textarea
              id="hostly-layout-save-description"
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              disabled={panelBusy}
              rows={2}
              style={{ ...fieldInput, resize: "vertical", minHeight: 52 }}
            />
            <div style={panelActions}>
              <button
                type="button"
                className="hostly-button-secondary"
                style={{ fontSize: 11, padding: "5px 10px", minHeight: 28 }}
                disabled={panelBusy}
                onClick={closePanel}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="hostly-button-primary"
                style={{ fontSize: 11, padding: "5px 10px", minHeight: 28 }}
                disabled={panelBusy || !saveName.trim()}
              >
                {busyAction === "save" ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </HostlySurface>
      ) : null}

      {openPanel === "activate" && selectedPreset ? (
        <HostlySurface
          variant="soft"
          style={{
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            border: "1px solid var(--hostly-line)",
          }}
        >
          <p style={{ ...microLabel, marginBottom: 0 }}>Activar layout</p>
          <p className="hostly-muted" style={statusText}>
            Activar «{selectedPreset.name}» restaurará la distribución del plano.
          </p>
          {hasUnsavedChanges ? (
            <p style={{ ...statusText, color: "#b45309" }}>
              Tienes cambios locales sin guardar en el editor.
            </p>
          ) : null}
          <div style={panelActions}>
            <button
              type="button"
              className="hostly-button-secondary"
              style={{ fontSize: 11, padding: "5px 10px", minHeight: 28 }}
              disabled={panelBusy}
              onClick={closePanel}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="hostly-button-primary"
              style={{ fontSize: 11, padding: "5px 10px", minHeight: 28 }}
              disabled={panelBusy || activateDisabled}
              onClick={() => void confirmActivate()}
            >
              {busyAction === "activate" ? "Activando…" : "Activar"}
            </button>
          </div>
        </HostlySurface>
      ) : null}

      {openPanel === "archive" && selectedPreset ? (
        <HostlySurface
          variant="soft"
          style={{
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            border: "1px solid var(--hostly-line)",
          }}
        >
          <p style={{ ...microLabel, marginBottom: 0 }}>Archivar layout</p>
          <p className="hostly-muted" style={statusText}>
            ¿Archivar «{selectedPreset.name}»? El layout se ocultará de la lista, pero no
            afectará al TPV.
          </p>
          <div style={panelActions}>
            <button
              type="button"
              className="hostly-button-secondary"
              style={{ fontSize: 11, padding: "5px 10px", minHeight: 28 }}
              disabled={panelBusy}
              onClick={closePanel}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="hostly-button-primary"
              style={{ fontSize: 11, padding: "5px 10px", minHeight: 28 }}
              disabled={panelBusy || actionDisabled}
              onClick={() => void confirmArchive()}
            >
              {busyAction === "archive" ? "Archivando…" : "Archivar"}
            </button>
          </div>
        </HostlySurface>
      ) : null}

      {showPrecheckRefresh ? (
        <div
          style={{
            margin: "-2px 0 0",
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid var(--hostly-line)",
            background: "rgba(255, 255, 255, 0.72)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {activateBlockedByService && activatePrecheckHint ? (
            <p
              className="hostly-muted"
              style={{
                ...statusText,
                margin: 0,
                color: "#92400e",
              }}
              role="status"
            >
              {activatePrecheckHint}
            </p>
          ) : precheckForSelection?.blocked === null ? (
            <p className="hostly-muted" style={{ ...statusText, margin: 0 }}>
              No se pudo comprobar el servicio activo.
            </p>
          ) : null}
          <button
            type="button"
            className="hostly-muted"
            style={{
              alignSelf: "flex-start",
              padding: "2px 0",
              border: "none",
              background: "transparent",
              fontSize: 10,
              fontWeight: 650,
              color: "#475569",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              cursor:
                disabled || isBusy || activatePrecheckLoading
                  ? "not-allowed"
                  : "pointer",
              opacity: disabled || isBusy || activatePrecheckLoading ? 0.45 : 1,
            }}
            disabled={disabled || isBusy || activatePrecheckLoading}
            onClick={() => onRefreshActivatePrecheck?.(selectedPresetId)}
          >
            Recomprobar
          </button>
        </div>
      ) : null}

      {activatePrecheckLoading ? (
        <p className="hostly-muted" style={{ ...statusText, margin: "-2px 0 0" }}>
          Comprobando servicio activo…
        </p>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <button
          type="button"
          style={{
            ...btnGhost,
            opacity: actionDisabled ? 0.45 : 1,
            cursor: actionDisabled ? "not-allowed" : "pointer",
          }}
          disabled={actionDisabled}
          onClick={() => void handleDuplicate()}
        >
          {busyAction === "duplicate" ? "…" : "Duplicar"}
        </button>
        <button
          type="button"
          style={{
            ...btnGhost,
            opacity: actionDisabled ? 0.45 : 1,
            cursor: actionDisabled ? "not-allowed" : "pointer",
          }}
          disabled={actionDisabled}
          onClick={() => setOpenPanel("archive")}
        >
          {busyAction === "archive" ? "…" : "Archivar"}
        </button>
      </div>

      <p style={statusText}>
        Activo: <strong style={{ color: "#334155", fontWeight: 650 }}>{activeLabel}</strong>
        {hasUnsavedChanges ? (
          <span style={{ color: "#b45309" }}> · cambios sin guardar</span>
        ) : null}
      </p>

      {error ? (
        <p style={{ ...statusText, color: "#b91c1c" }} role="alert">
          {error}
        </p>
      ) : null}

      {feedback ? (
        <p
          style={{
            ...statusText,
            color:
              feedback.type === "error"
                ? "#b91c1c"
                : feedback.type === "success"
                  ? "#166534"
                  : "#475569",
          }}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}
    </HostlySurface>
  );
}
