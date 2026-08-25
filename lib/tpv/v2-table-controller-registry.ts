"use client";

export type TpvV2TableController = {
  joinEnabled: boolean;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  onClick: () => void;
};

const controllers = new Map<string, TpvV2TableController>();
const listeners = new Set<() => void>();
let revision = 0;

function normalizeTableId(tableId: string): string {
  return String(tableId ?? "").trim();
}

function emitRegistryChange() {
  revision += 1;
  for (const listener of listeners) listener();
}

export function registerTpvV2TableController(
  tableId: string,
  controller: TpvV2TableController,
): () => void {
  const id = normalizeTableId(tableId);
  if (!id) return () => undefined;

  controllers.set(id, controller);
  emitRegistryChange();

  return () => {
    if (controllers.get(id) !== controller) return;
    controllers.delete(id);
    emitRegistryChange();
  };
}

export function getTpvV2TableController(
  tableId: string,
): TpvV2TableController | null {
  const id = normalizeTableId(tableId);
  if (!id) return null;
  return controllers.get(id) ?? null;
}

export function hasTpvV2TableController(tableId: string): boolean {
  return getTpvV2TableController(tableId) != null;
}

export function subscribeTpvV2TableControllerRegistry(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTpvV2TableControllerRegistryRevision(): number {
  return revision;
}
