"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { SalaEspacio, SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import { salaEspacioTypeIcon } from "@/lib/sala-editor/catalog/espacio-types";

export type SalaEspacioDragHandleProps = {
  setActivatorNodeRef: (node: HTMLButtonElement | null) => void;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  disabled?: boolean;
};

export type SalaEspacioCardProps = {
  espacio: SalaEspacio;
  espacios: SalaEspacio[];
  selected: boolean;
  dragActive?: boolean;
  dragHandleProps?: SalaEspacioDragHandleProps;
  elementCount: number;
  onSelect: () => void;
  onUpdateEspacio?: (patch: Partial<SalaEspacioDraft>) => void;
  onDuplicateEspacio?: () => void;
};

function normalizeEspacioNameForComparison(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

export function SalaEspacioCard({
  espacio,
  espacios,
  selected,
  dragActive = false,
  dragHandleProps,
  elementCount,
  onSelect,
  onUpdateEspacio,
  onDuplicateEspacio,
}: SalaEspacioCardProps) {
  const icon = salaEspacioTypeIcon(espacio.tipo);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(espacio.name);
  const [renameError, setRenameError] = useState<string | null>(null);

  const normalizedSiblingNames = useMemo(() => {
    return new Set(
      espacios
        .filter((item) => item.id !== espacio.id)
        .map((item) => normalizeEspacioNameForComparison(item.name))
        .filter(Boolean),
    );
  }, [espacio.id, espacios]);

  useEffect(() => {
    if (!selected) return;
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  useEffect(() => {
    if (!renaming) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renaming]);

  const closeMenu = useCallback(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, []);

  const handleMenuToggle = useCallback((event: MouseEvent) => {
    event.stopPropagation();
  }, []);

  const handleToggleVisible = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onUpdateEspacio?.({ visible: !espacio.visible });
      closeMenu();
    },
    [closeMenu, espacio.visible, onUpdateEspacio],
  );

  const handleToggleActive = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onUpdateEspacio?.({ active: !espacio.active });
      closeMenu();
    },
    [closeMenu, espacio.active, onUpdateEspacio],
  );

  const startRenaming = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      if (!selected || !onUpdateEspacio) return;
      setDraftName(espacio.name);
      setRenameError(null);
      setRenaming(true);
      closeMenu();
      onSelect();
    },
    [closeMenu, espacio.name, onSelect, onUpdateEspacio, selected],
  );

  const cancelRenaming = useCallback(() => {
    setDraftName(espacio.name);
    setRenameError(null);
    setRenaming(false);
  }, [espacio.name]);

  const validateRename = useCallback(() => {
    const trimmedName = draftName.trim();
    const normalizedName = normalizeEspacioNameForComparison(trimmedName);
    if (!normalizedName) {
      return {
        ok: false as const,
        message: "El nombre del espacio no puede estar vacío.",
      };
    }
    if (normalizedSiblingNames.has(normalizedName)) {
      return {
        ok: false as const,
        message: "Ya existe un espacio con ese nombre.",
      };
    }
    return { ok: true as const, name: trimmedName };
  }, [draftName, normalizedSiblingNames]);

  const keepRenameFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const commitRenaming = useCallback(() => {
    const result = validateRename();
    if (!result.ok) {
      setRenameError(result.message);
      keepRenameFocus();
      return false;
    }

    const currentNormalizedName = normalizeEspacioNameForComparison(espacio.name);
    const nextNormalizedName = normalizeEspacioNameForComparison(result.name);
    setRenameError(null);
    setRenaming(false);
    setDraftName(result.name);

    if (nextNormalizedName !== currentNormalizedName || result.name !== espacio.name) {
      // Solo el nombre pertenece a esta acción; enlaces legacy/floorPlan quedan intactos.
      onUpdateEspacio?.({ name: result.name });
    }
    return true;
  }, [espacio.name, keepRenameFocus, onUpdateEspacio, validateRename]);

  const handleRenameSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();
      commitRenaming();
    },
    [commitRenaming],
  );

  const handleRenameBlur = useCallback(
    () => {
      commitRenaming();
    },
    [commitRenaming],
  );

  const handleRenameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelRenaming();
      }
    },
    [cancelRenaming],
  );

  const handleDuplicate = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onDuplicateEspacio?.();
      closeMenu();
    },
    [closeMenu, onDuplicateEspacio],
  );

  const dragHandle = dragHandleProps
    ? {
        attributes: dragHandleProps.attributes,
        listeners: dragHandleProps.listeners,
        disabled: dragHandleProps.disabled,
      }
    : null;
  const setDragActivatorNode = useCallback(
    (node: HTMLButtonElement | null) => {
      dragHandleProps?.setActivatorNodeRef(node);
    },
    [dragHandleProps],
  );

  return (
    <div
      ref={rootRef}
      className={[
        "hostly-sala-editor-space-chip",
        selected ? "is-selected" : "",
        !espacio.active ? "is-inactive" : "",
        dragActive ? "is-dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--espacio-accent": espacio.color } as CSSProperties}
    >
      {dragHandle ? (
        <button
          ref={setDragActivatorNode}
          type="button"
          className="hostly-sala-editor-space-chip__drag-handle"
          aria-label={`Reordenar espacio ${espacio.name}`}
          disabled={dragHandle.disabled}
          {...dragHandle.attributes}
          {...dragHandle.listeners}
        >
          <span aria-hidden>⋮⋮</span>
        </button>
      ) : null}
      {selected && renaming ? (
        <form
          className="hostly-sala-editor-space-chip__main hostly-sala-editor-space-chip__rename-form"
          onSubmit={handleRenameSubmit}
          onClick={(event) => event.stopPropagation()}
          title={espacio.name}
        >
          <span
            className="hostly-sala-editor-space-chip__icon"
            style={{ backgroundColor: `${espacio.color}28`, color: espacio.color }}
            aria-hidden
          >
            {icon}
          </span>
          <label className="hostly-sala-editor-space-chip__rename-label" htmlFor={`${errorId}-input`}>
            Renombrar espacio
          </label>
          <input
            ref={inputRef}
            id={`${errorId}-input`}
            className="hostly-sala-editor-space-chip__rename-input"
            value={draftName}
            onChange={(event) => {
              setDraftName(event.target.value);
              if (renameError) setRenameError(null);
            }}
            onBlur={handleRenameBlur}
            onKeyDown={handleRenameKeyDown}
            aria-invalid={renameError ? "true" : undefined}
            aria-describedby={renameError ? errorId : undefined}
          />
          <span className="hostly-sala-editor-space-chip__count">{elementCount}</span>
        </form>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          className="hostly-sala-editor-space-chip__main"
          title={espacio.name}
          aria-label={`Seleccionar espacio ${espacio.name}`}
        >
          <span
            className="hostly-sala-editor-space-chip__icon"
            style={{ backgroundColor: `${espacio.color}28`, color: espacio.color }}
            aria-hidden
          >
            {icon}
          </span>
          {selected ? (
            <span className="hostly-sala-editor-space-chip__name">{espacio.name}</span>
          ) : null}
          <span className="hostly-sala-editor-space-chip__count">{elementCount}</span>
        </button>
      )}
      {selected && renameError ? (
        <p id={errorId} className="hostly-sala-editor-space-chip__rename-error">
          {renameError}
        </p>
      ) : null}

      {onUpdateEspacio ? (
        <details
          ref={menuRef}
          className="hostly-sala-editor-space-chip__menu"
          onClick={handleMenuToggle}
        >
          <summary className="hostly-sala-editor-space-chip__menu-trigger" aria-label="Opciones">
            ⋮
          </summary>
          <div className="hostly-sala-editor-layer__menu-panel" role="menu">
            {selected ? (
              <button type="button" role="menuitem" className="hostly-sala-editor-layer__menu-item" onClick={startRenaming}>
                Renombrar espacio
              </button>
            ) : null}
            <button type="button" role="menuitem" className="hostly-sala-editor-layer__menu-item" onClick={handleToggleVisible}>
              {espacio.visible ? "Ocultar" : "Mostrar"}
            </button>
            <button type="button" role="menuitem" className="hostly-sala-editor-layer__menu-item" onClick={handleToggleActive}>
              {espacio.active ? "Desactivar" : "Activar"}
            </button>
            {onDuplicateEspacio ? (
              <button type="button" role="menuitem" className="hostly-sala-editor-layer__menu-item" onClick={handleDuplicate}>
                Duplicar espacio
              </button>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
