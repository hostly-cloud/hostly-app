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
import type { PlatoCarta } from "@/lib/carta/product-sale-contract";

export function useProductosCartaMobileLayout(): boolean {
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

type ProductosCartaSortableContextValue = {
  localItems: PlatoCarta[];
  disabled?: boolean;
  dragHandleLabel: string;
};

const ProductosCartaSortableContext = createContext<ProductosCartaSortableContextValue | null>(null);

function useProductosCartaSortableContext() {
  const ctx = useContext(ProductosCartaSortableContext);
  if (!ctx) {
    throw new Error("ProductosCartaSortable components must be used within ProductosCartaSortableRoot");
  }
  return ctx;
}

export function ProductosCartaDragHandle({
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

export function ProductosCartaSortableDragHandle() {
  const { disabled, dragHandleLabel } = useProductosCartaSortableContext();
  return <SortableDragHandleSlot disabled={disabled} label={dragHandleLabel} />;
}

function SortableDragHandleSlot({ disabled, label }: { disabled?: boolean; label: string }) {
  const { setActivatorNodeRef, attributes, listeners } = useSortableItemDrag();
  return (
    <ProductosCartaDragHandle
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

function SortableItemShell({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  const { active, over } = useDndContext();
  const isReorderFocusItem = Boolean(className?.includes("hostly-reorder-mode__item"));
  const isInsertTarget =
    isReorderFocusItem && !isDragging && over?.id === id && active?.id !== id;

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
      >
        {children}
      </div>
    </SortableItemDragContext.Provider>
  );
}

export function ProductosCartaSortableDesktopRow({
  item,
  children,
}: {
  item: PlatoCarta;
  children: ReactNode;
}) {
  const { disabled } = useProductosCartaSortableContext();
  return (
    <SortableItemShell
      id={item.id}
      disabled={disabled}
      className="hostly-data-table-row hostly-productos-carta-sortable-row"
    >
      {children}
    </SortableItemShell>
  );
}

export function ProductosCartaSortableMobileItem({
  item,
  children,
}: {
  item: PlatoCarta;
  children: ReactNode;
}) {
  const { disabled } = useProductosCartaSortableContext();
  return (
    <SortableItemShell id={item.id} disabled={disabled} className="hostly-productos-carta-sortable-mobile">
      {children}
    </SortableItemShell>
  );
}

export function ProductosCartaSortableFocusItem({
  item,
  children,
}: {
  item: PlatoCarta;
  children: ReactNode;
}) {
  const { disabled } = useProductosCartaSortableContext();
  return (
    <SortableItemShell id={item.id} disabled={disabled} className="hostly-reorder-mode__item">
      {children}
    </SortableItemShell>
  );
}

export type ProductosCartaSortableRootProps = {
  items: PlatoCarta[];
  disabled?: boolean;
  dragHandleLabel: string;
  onReorder: (orderedIds: string[]) => void;
  children: (ctx: { localItems: PlatoCarta[]; isMobile: boolean }) => ReactNode;
  renderDragPreview?: (item: PlatoCarta) => ReactNode;
};

export function ProductosCartaSortableRoot({
  items,
  disabled,
  dragHandleLabel,
  onReorder,
  children,
  renderDragPreview,
}: ProductosCartaSortableRootProps) {
  const isMobile = useProductosCartaMobileLayout();
  const [localItems, setLocalItems] = useState(items);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const itemIds = useMemo(() => localItems.map((p) => p.id), [localItems]);
  const activeItem = activeId ? localItems.find((p) => p.id === activeId) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
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

    const oldIndex = localItems.findIndex((p) => p.id === active.id);
    const newIndex = localItems.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const next = [...localItems];
    const [moved] = next.splice(oldIndex, 1);
    if (!moved) return;
    next.splice(newIndex, 0, moved);
    setLocalItems(next);
    onReorder(next.map((p) => p.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  const contextValue = useMemo(
    () => ({ localItems, disabled, dragHandleLabel }),
    [localItems, disabled, dragHandleLabel],
  );

  return (
    <ProductosCartaSortableContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          className={[
            "hostly-productos-carta-sortable-root",
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
            <div className="hostly-productos-carta-drag-overlay">{renderDragPreview(activeItem)}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </ProductosCartaSortableContext.Provider>
  );
}
