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
  touchRowDrag: boolean;
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
  const { disabled, dragHandleLabel, touchRowDrag } = useCategoriasCartaSortableContext();
  return (
    <SortableDragHandleSlot
      disabled={disabled}
      label={dragHandleLabel}
      visualOnly={touchRowDrag}
    />
  );
}

function SortableDragHandleSlot({
  disabled,
  label,
  visualOnly,
}: {
  disabled?: boolean;
  label: string;
  visualOnly?: boolean;
}) {
  const { setActivatorNodeRef, attributes, listeners } = useSortableItemDrag();
  return (
    <CategoriasCartaDragHandle
      disabled={disabled}
      label={label}
      setActivatorNodeRef={visualOnly ? undefined : setActivatorNodeRef}
      attributes={visualOnly ? undefined : attributes}
      listeners={visualOnly ? undefined : listeners}
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
  const { touchRowDrag } = useCategoriasCartaSortableContext();
  const isMobileShell = Boolean(className?.includes("hostly-carta-category-sortable-mobile"));
  const rowTouchDrag = touchRowDrag && isMobileShell && !disabled;
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
          rowTouchDrag && isDragging && "is-sortable-active-touch",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onClick}
        {...(rowTouchDrag && listeners ? listeners : {})}
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
    () => ({ localItems, disabled, dragHandleLabel, touchRowDrag: isMobile }),
    [localItems, disabled, dragHandleLabel, isMobile],
  );

  return (
    <CategoriasCartaSortableContext.Provider value={contextValue}>
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
