"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableAttributes,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SalaEspacio, SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import { sortSalaEspacios } from "@/lib/sala-editor/types/espacio";
import { salaEspacioTypeIcon } from "@/lib/sala-editor/catalog/espacio-types";
import { SalaEspacioCard } from "@/components/sala-editor/panels/sala-espacio-card";
import { SalaEspaciosEmptyState } from "@/components/sala-editor/panels/sala-espacios-empty-state";

const HOSTLY_SPACE_REORDER_POINTER = { distance: 6 } as const;
const HOSTLY_SPACE_REORDER_TOUCH = { delay: 220, tolerance: 8 } as const;

export type SalaEspaciosSidebarProps = {
  espacios: SalaEspacio[];
  selectedEspacioId: string | null;
  elementCountByEspacioId: Record<string, number>;
  onSelectEspacio: (espacioId: string) => void;
  onRequestAddEspacio: () => void;
  onUpdateEspacio?: (espacioId: string, patch: Partial<SalaEspacioDraft>) => void;
  onDuplicateEspacio?: (espacioId: string) => void;
  onReorderEspacios?: (orderedEspacioIds: string[]) => void;
  /** primary = fase Espacios · switcher = selector compacto en Estructura/Operación */
  mode?: "primary" | "switcher";
};

type SpaceDragHandleProps = {
  setActivatorNodeRef: (node: HTMLButtonElement | null) => void;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  disabled?: boolean;
};

type SortableSpaceListItemProps = {
  espacio: SalaEspacio;
  espacios: SalaEspacio[];
  selected: boolean;
  elementCount: number;
  reorderDisabled: boolean;
  onSelect: () => void;
  onUpdateEspacio?: (patch: Partial<SalaEspacioDraft>) => void;
  onDuplicateEspacio?: () => void;
};

function SortableSpaceListItem({
  espacio,
  espacios,
  selected,
  elementCount,
  reorderDisabled,
  onSelect,
  onUpdateEspacio,
  onDuplicateEspacio,
}: SortableSpaceListItemProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: espacio.id, disabled: reorderDisabled });

  const dragHandleProps: SpaceDragHandleProps | undefined = reorderDisabled
    ? undefined
    : {
        setActivatorNodeRef,
        attributes,
        listeners,
        disabled: reorderDisabled,
      };

  return (
    <li
      ref={setNodeRef}
      className={[
        "hostly-sala-editor-space-grid__item",
        isDragging ? "is-dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <SalaEspacioCard
        espacio={espacio}
        espacios={espacios}
        selected={selected}
        dragActive={isDragging}
        dragHandleProps={dragHandleProps}
        elementCount={elementCount}
        onSelect={onSelect}
        onUpdateEspacio={onUpdateEspacio}
        onDuplicateEspacio={onDuplicateEspacio}
      />
    </li>
  );
}

export function SalaEspaciosSidebar({
  espacios,
  selectedEspacioId,
  elementCountByEspacioId,
  onSelectEspacio,
  onRequestAddEspacio,
  onUpdateEspacio,
  onDuplicateEspacio,
  onReorderEspacios,
  mode = "primary",
}: SalaEspaciosSidebarProps) {
  const sorted = sortSalaEspacios(espacios);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sortedIds = useMemo(() => sorted.map((espacio) => espacio.id), [sorted]);
  const activeDragEspacio =
    activeDragId != null
      ? sorted.find((espacio) => espacio.id === activeDragId) ?? null
      : null;
  const reorderDisabled = !onReorderEspacios || sorted.length < 2;

  if (sorted.length === 0) {
    return <SalaEspaciosEmptyState onCreateEspacio={onRequestAddEspacio} compact />;
  }

  const isSwitcher = mode === "switcher";

  if (isSwitcher) {
    return (
      <div className="hostly-sala-editor-space-switcher">
        <p className="hostly-sala-editor-space-switcher__label">Espacio activo</p>
        <ul className="hostly-sala-editor-space-switcher__list">
          {sorted.map((espacio) => {
            const selected = espacio.id === selectedEspacioId;
            return (
              <li key={espacio.id}>
                <button
                  type="button"
                  className={[
                    "hostly-sala-editor-space-switcher__item",
                    selected ? "is-selected" : "",
                    !espacio.active ? "is-inactive" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ "--espacio-accent": espacio.color } as CSSProperties}
                  onClick={() => onSelectEspacio(espacio.id)}
                  title={espacio.name}
                  aria-current={selected ? "true" : undefined}
                >
                  <span
                    className="hostly-sala-editor-space-switcher__dot"
                    style={{ backgroundColor: espacio.color }}
                    aria-hidden
                  />
                  <span className="hostly-sala-editor-space-switcher__name">
                    {espacio.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="hostly-sala-editor-space-switcher__add"
          onClick={onRequestAddEspacio}
        >
          <span aria-hidden>+</span>
          Nuevo espacio
        </button>
      </div>
    );
  }

  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--spaces">
      <button
        type="button"
        onClick={onRequestAddEspacio}
        className="hostly-sala-editor-toolbox__add hostly-sala-editor-toolbox__add--icon"
        title="Añadir espacio"
      >
        <span aria-hidden>+</span>
      </button>

      <SpaceReorderDndRoot
        sortedIds={sortedIds}
        activeDragEspacio={activeDragEspacio}
        onDragStart={(event) => setActiveDragId(String(event.active.id))}
        onDragEnd={(event) => {
          setActiveDragId(null);
          const activeId = String(event.active.id);
          const overId = event.over ? String(event.over.id) : "";
          if (!overId || activeId === overId) return;
          const oldIndex = sortedIds.indexOf(activeId);
          const newIndex = sortedIds.indexOf(overId);
          if (oldIndex < 0 || newIndex < 0) return;
          const nextIds = arrayMove(sortedIds, oldIndex, newIndex);
          onReorderEspacios?.(nextIds);
        }}
        onDragCancel={() => setActiveDragId(null)}
      >
        <ul className="hostly-sala-editor-space-grid">
          {sorted.map((espacio) => (
            <SortableSpaceListItem
              key={espacio.id}
              espacio={espacio}
              espacios={espacios}
              selected={espacio.id === selectedEspacioId}
              elementCount={elementCountByEspacioId[espacio.id] ?? 0}
              reorderDisabled={reorderDisabled}
              onSelect={() => onSelectEspacio(espacio.id)}
              onUpdateEspacio={
                onUpdateEspacio
                  ? (patch) => onUpdateEspacio(espacio.id, patch)
                  : undefined
              }
              onDuplicateEspacio={
                onDuplicateEspacio && espacio.id === selectedEspacioId
                  ? () => onDuplicateEspacio(espacio.id)
                  : undefined
              }
            />
          ))}
        </ul>
      </SpaceReorderDndRoot>
    </div>
  );
}

function SpaceReorderDndRoot({
  sortedIds,
  activeDragEspacio,
  onDragStart,
  onDragEnd,
  onDragCancel,
  children,
}: {
  sortedIds: string[];
  activeDragEspacio: SalaEspacio | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
  children: ReactNode;
}) {
  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: HOSTLY_SPACE_REORDER_POINTER,
    }),
    useSensor(TouchSensor, {
      activationConstraint: HOSTLY_SPACE_REORDER_TOUCH,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <DndContext
      sensors={dndSensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
        {activeDragEspacio ? (
          <div
            className="hostly-sala-editor-space-drag-overlay"
            style={{ "--espacio-accent": activeDragEspacio.color } as CSSProperties}
          >
            <span
              className="hostly-sala-editor-space-drag-overlay__icon"
              style={{
                backgroundColor: `${activeDragEspacio.color}28`,
                color: activeDragEspacio.color,
              }}
              aria-hidden
            >
              {salaEspacioTypeIcon(activeDragEspacio.tipo)}
            </span>
            <span className="hostly-sala-editor-space-drag-overlay__name">
              {activeDragEspacio.name}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
