"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDndContext,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableAttributes,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CartaCategoria } from "@/lib/carta-categorias/types";

const categoriasReorderMobileStyles = `
@media (max-width: 767px) {
  .hostly-carta-categorias-sortable-root .hostly-carta-category-drag-handle {
    width: 42px !important;
    height: 42px !important;
    min-width: 42px !important;
    flex: 0 0 42px !important;
    border-radius: 10px !important;
    border-color: rgba(49, 95, 125, 0.16) !important;
    background: var(--hostly-surface-page-soft) !important;
    color: var(--hostly-accent) !important;
    box-shadow: none !important;
    touch-action: none;
  }

  .hostly-carta-categorias-sortable-root .hostly-carta-category-drag-handle:active {
    background: var(--hostly-accent-soft) !important;
    transform: scale(0.97);
  }

  .hostly-carta-category-sortable-mobile {
    position: relative;
    border-radius: 10px;
    transition:
      opacity 140ms ease,
      transform 170ms cubic-bezier(0.2, 0, 0, 1),
      background-color 140ms ease;
  }

  .hostly-carta-category-sortable-mobile.is-sortable-dragging {
    opacity: 0.3 !important;
    background: var(--hostly-surface-page-soft) !important;
  }

  .hostly-carta-category-sortable-mobile.is-sortable-over::before {
    content: "";
    position: absolute;
    z-index: 3;
    left: 8px;
    right: 8px;
    top: -3px;
    height: 3px;
    border-radius: 999px;
    background: var(--hostly-accent);
    box-shadow: 0 0 0 2px rgba(49, 95, 125, 0.09);
    pointer-events: none;
  }

  .hostly-carta-categorias-sortable-root.is-sortable-active
    .hostly-carta-category-sortable-mobile:not(.is-sortable-dragging) {
    opacity: 0.78;
  }

  .hostly-carta-category-drag-overlay {
    width: calc(100vw - 20px) !important;
    max-width: calc(100vw - 20px) !important;
    pointer-events: none;
  }

  .hostly-carta-category-drag-preview {
    min-height: 52px !important;
    padding: 6px 8px !important;
    border-radius: 11px !important;
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.16) !important;
  }
}
`;

export function useCategoriasCartaMobileLayout(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return mobile;
}

type SortableDragProps = {
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
};

/** Patrón Hostly: mantener pulsado (touch) / arrastrar (ratón) → soltar → un write al final. */
const HOSTLY_SORTABLE_POINTER = { distance: 6 } as const;
const HOSTLY_SORTABLE_TOUCH = { delay: 220, tolerance: 8 } as const;

type CategoriasCartaSortableContextValue = {
  localItems: CartaCategoria[];
  disabled?: boolean;
  dragHandleLabel: string;
};

const CategoriasCartaSortableContext = createContext<CategoriasCartaSortableContextValue | null>(null);

function useCategoriasCartaSortableContext() {
  const ctx = useContext(CategoriasCartaSortableContext);
  if (!ctx) {
    throw new Error("CategoriasCartaSortable components must be used within CategoriasCartaSortableRoot");
  }
  return ctx;
}

export function CategoriasCartaDragHandle({
  disabled,
  label,
  setActivatorNodeRef,
  attributes,
  listeners,
}: {
  disabled?: boolean;
  label: string;
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
}) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className="hostly-carta-category-drag-handle"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      {...(attributes ?? {})}
      {...(listeners ?? {})}
    >
      <GripVertical size={16} strokeWidth={2.25} aria-hidden />
    </button>
  );
}

export function CategoriasCartaSortableDragHandle() {
  const { disabled, dragHandleLabel } = useCategoriasCartaSortableContext();
  return <SortableDragHandleSlot disabled={disabled} label={dragHandleLabel} />;
}

function SortableDragHandleSlot({
  disabled,
  label,
}: {
  disabled?: boolean;
  label: string;
}) {
  const { setActivatorNodeRef, attributes, listeners } = useSortableItemDrag();
  return (
    <CategoriasCartaDragHandle
      disabled={disabled}
      label={label}
      setActivatorNodeRef={setActivatorNodeRef}
      attributes={attributes}
      listeners={listeners}
    />
  );
}

const SortableItemDragContext = createContext<SortableDragProps | null>(null);

function useSortableItemDrag(): SortableDragProps {
  const ctx = useContext(SortableItemDragContext);
  if (!ctx) {
    throw new Error("Sortable drag handle must be used within a sortable row");
  }
  return ctx;
}

type SortableItemShellProps = {
  id: string;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
};

function SortableItemShell({ id, disabled, className, onClick, children }: SortableItemShellProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  const { active, over } = useDndContext();
  const isInsertTarget = !isDragging && over?.id === id && active?.id !== id;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragProps: SortableDragProps = {
    setActivatorNodeRef,
    attributes,
    listeners: disabled ? undefined : listeners,
  };

  return (
    <SortableItemDragContext.Provider value={dragProps}>
      <div
        ref={setNodeRef}
        style={style}
        role={className?.includes("hostly-data-table-row") ? "row" : undefined}
        className={[
          className,
          isDragging && "is-sortable-dragging",
          isInsertTarget && "is-sortable-over",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onClick}
      >
        {children}
      </div>
    </SortableItemDragContext.Provider>
  );
}

export function CategoriasCartaSortableDesktopRow({
  item,
  onClick,
  children,
}: {
  item: CartaCategoria;
  onClick?: () => void;
  children: ReactNode;
}) {
  const { disabled } = useCategoriasCartaSortableContext();
  return (
    <SortableItemShell
      id={item.id}
      disabled={disabled}
      className="hostly-data-table-row is-clickable hostly-carta-category-sortable-row"
      onClick={onClick}
    >
      {children}
    </SortableItemShell>
  );
}

export function CategoriasCartaSortableMobileItem({
  item,
  onClick,
  children,
}: {
  item: CartaCategoria;
  onClick?: () => void;
  children: ReactNode;
}) {
  const { disabled } = useCategoriasCartaSortableContext();
  return (
    <SortableItemShell
      id={item.id}
      disabled={disabled}
      className="hostly-carta-category-sortable-mobile"
      onClick={onClick}
    >
      {children}
    </SortableItemShell>
  );
}

export type CategoriasCartaSortableRootProps = {
  items: CartaCategoria[];
  disabled?: boolean;
  dragHandleLabel: string;
  onReorder: (orderedIds: string[]) => void;
  children: (ctx: { localItems: CartaCategoria[]; isMobile: boolean }) => ReactNode;
  renderDragPreview?: (item: CartaCategoria) => ReactNode;
};

export function CategoriasCartaSortableRoot({
  items,
  disabled,
  dragHandleLabel,
  onReorder,
  children,
  renderDragPreview,
}: CategoriasCartaSortableRootProps) {
  const isMobile = useCategoriasCartaMobileLayout();
  const [localItems, setLocalItems] = useState(items);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const itemIds = useMemo(() => localItems.map((c) => c.id), [localItems]);
  const activeItem = activeId ? localItems.find((c) => c.id === activeId) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: HOSTLY_SORTABLE_POINTER,
    }),
    useSensor(TouchSensor, {
      activationConstraint: HOSTLY_SORTABLE_TOUCH,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localItems.findIndex((c) => c.id === active.id);
    const newIndex = localItems.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const next = [...localItems];
    const [moved] = next.splice(oldIndex, 1);
    if (!moved) return;
    next.splice(newIndex, 0, moved);
    setLocalItems(next);
    onReorder(next.map((c) => c.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  const contextValue = useMemo(
    () => ({ localItems, disabled, dragHandleLabel }),
    [localItems, disabled, dragHandleLabel],
  );

  return (
    <CategoriasCartaSortableContext.Provider value={contextValue}>
      <style>{categoriasReorderMobileStyles}</style>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          className={[
            "hostly-carta-categorias-sortable-root",
            activeId ? "is-sortable-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {children({ localItems, isMobile })}
          </SortableContext>
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
          {activeItem && renderDragPreview ? (
            <div className="hostly-carta-category-drag-overlay">{renderDragPreview(activeItem)}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </CategoriasCartaSortableContext.Provider>
  );
}
