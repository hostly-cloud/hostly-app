/**
 * Instancia colocada de un OperationalElement (OSE · Fase 2).
 * Independiente del catálogo de tipos.
 */

import type {
  OperationalElementMetadata,
  OperationalElementPosition,
  OperationalElementState,
  OperationalElementType,
} from "@/lib/sala-editor/ose/operational-element";
import { DEFAULT_OPERATIONAL_ELEMENT_STATE } from "@/lib/sala-editor/ose/operational-element";

export type OperationalElementInstanceId = string;

export type OperationalElementInstance = {
  id: OperationalElementInstanceId;
  spaceId: string;
  zoneId: string | null;
  elementType: OperationalElementType;
  name: string;
  position: OperationalElementPosition;
  rotation: number;
  capacity: number;
  visible: boolean;
  enabled: boolean;
  metadata: OperationalElementMetadata;
  state: OperationalElementState;
};

export type OperationalElementInstanceDraft = Omit<
  OperationalElementInstance,
  "id"
>;

export function createOperationalElementInstance(
  draft: OperationalElementInstanceDraft,
): OperationalElementInstance {
  return {
    id: `op-inst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...draft,
  };
}

export type BuildOperationalElementInstanceInput = {
  spaceId: string;
  elementType: OperationalElementType;
  name: string;
  position: OperationalElementPosition;
  capacity: number;
  zoneId?: string | null;
  rotation?: number;
  visible?: boolean;
  enabled?: boolean;
  metadata?: OperationalElementMetadata;
  state?: OperationalElementState;
};

export function buildOperationalElementInstance(
  input: BuildOperationalElementInstanceInput,
): OperationalElementInstance {
  return createOperationalElementInstance({
    spaceId: input.spaceId,
    zoneId: input.zoneId ?? null,
    elementType: input.elementType,
    name: input.name,
    position: input.position,
    rotation: input.rotation ?? 0,
    capacity: input.capacity,
    visible: input.visible ?? true,
    enabled: input.enabled ?? true,
    metadata: input.metadata ?? {},
    state: input.state ?? DEFAULT_OPERATIONAL_ELEMENT_STATE,
  });
}
