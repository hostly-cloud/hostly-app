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
import { HostlyButton } from "@/components/ui/hostly";
import type { CartaFamilia } from "@/lib/carta-categorias/types";

export function useFamiliasCartaMobileLayout(): boolean {
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

type FamiliasCartaSortableContextValue = {
  localItems: CartaFamilia[];
  disabled?: boolean;
  dragHandleLabel: string;
  touchRowDrag: boolean;
};

const FamiliasCartaSortableContext = createContext<FamiliasCartaSortableContextValue | null>(null);

function useFamiliasCartaSortableContext() {
  const ctx = useContext(FamiliasCartaSortableContext);
  if (!ctx) {
    throw new Error("FamiliasCartaSortable components must be used within FamiliasCartaSortableRoot");
  }
  return ctx;
}

export function FamiliasCartaDragHandle({
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
    <HostlyButton
      ref={setActivatorNodeRef}
      variant="icon"
      size="compact"
      icon={<GripVertical size={16} strokeWidth={2.25} />}
      iconOnlyLabel={label}
      className="hostly-carta-category-drag-handle"
      disabled={disabled}
      title={label}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      {...(attributes ?? {})}
      {...(listeners ?? {})}
    />
  );
}

export function FamiliasCartaSortableDragHandle() {
  const { disabled, dragHandleLabel, touchRowDrag } = useFamiliasCartaSortableContext();
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
    <FamiliasCartaDragHandle
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
  const { touchRowDrag } = useFamiliasCartaSortableContext();
  const isMobileShell = Boolean(className?.includes("hostly-carta-familia-sortable-mobile"));
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

export function FamiliasCartaSortableItem({
  item,
  isMobile,
  onClick,
  children,
}: {
  item: CartaFamilia;
  isMobile: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const { disabled } = useFamiliasCartaSortableContext();
  return (
    <SortableItemShell
      id={item.id}
      disabled={disabled}
      className={[
        "hostly-carta-familia-sortable-item",
        isMobile ? "hostly-carta-familia-sortable-mobile" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={isMobile ? onClick : undefined}
    >
      {children}
    </SortableItemShell>
  );
}

export type FamiliasCartaSortableRootProps = {
  items: CartaFamilia[];
  disabled?: boolean;
  dragHandleLabel: string;
  onReorder: (orderedIds: string[]) => void;
  children: (ctx: { localItems: CartaFamilia[]; isMobile: boolean }) => ReactNode;
  renderDragPreview?: (item: CartaFamilia) => ReactNode;
};

export function FamiliasCartaSortableRoot({
  items,
  disabled,
  dragHandleLabel,
  onReorder,
  children,
  renderDragPreview,
}: FamiliasCartaSortableRootProps) {
  const isMobile = useFamiliasCartaMobileLayout();
  const [localItems, setLocalItems] = useState(items);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const itemIds = useMemo(() => localItems.map((f) => f.id), [localItems]);
  const activeItem = activeId ? localItems.find((f) => f.id === activeId) : null;

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

    const oldIndex = localItems.findIndex((f) => f.id === active.id);
    const newIndex = localItems.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const next = [...localItems];
    const [moved] = next.splice(oldIndex, 1);
    if (!moved) return;
    next.splice(newIndex, 0, moved);
    setLocalItems(next);
    onReorder(next.map((f) => f.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  const contextValue = useMemo(
    () => ({ localItems, disabled, dragHandleLabel, touchRowDrag: isMobile }),
    [localItems, disabled, dragHandleLabel, isMobile],
  );

  return (
    <FamiliasCartaSortableContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          className={[
            "hostly-carta-familias-sortable-root",
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
            <div className="hostly-carta-familia-drag-overlay">{renderDragPreview(activeItem)}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </FamiliasCartaSortableContext.Provider>
  );
}
