export type {
  OperationalElement,
  OperationalBarElementType,
  OperationalElementDraft,
  OperationalElementId,
  OperationalElementMetadata,
  OperationalElementPosition,
  OperationalServiceAreaElementType,
  OperationalElementState,
  OperationalElementType,
} from "@/lib/sala-editor/ose/operational-element";
export {
  DEFAULT_OPERATIONAL_ELEMENT_STATE,
  createOperationalElement,
  isOperationalBarElementType,
  isOperationalServiceAreaElementType,
} from "@/lib/sala-editor/ose/operational-element";

export type {
  ActiveOperationalElement,
  ActiveOperationalElementSelection,
} from "@/lib/sala-editor/ose/active-operational-element";
export {
  DEFAULT_ACTIVE_OPERATIONAL_ELEMENT_TYPE,
  createActiveOperationalElement,
  isOperationalElementTypeSelected,
} from "@/lib/sala-editor/ose/active-operational-element";

export type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
export {
  OPERATIONAL_ELEMENT_CATALOG,
  getDefaultOperationalElementCatalogItem,
  getOperationalElementCatalogItem,
} from "@/lib/sala-editor/ose/operational-element-catalog";

export type {
  OperationalElementInstance,
  OperationalElementInstanceDraft,
  OperationalElementInstanceId,
  BuildOperationalElementInstanceInput,
} from "@/lib/sala-editor/ose/operational-element-instance";
export {
  buildOperationalElementInstance,
  createOperationalElementInstance,
} from "@/lib/sala-editor/ose/operational-element-instance";

export {
  countOperationalElementInstancesByType,
  nextOperationalElementInstanceName,
} from "@/lib/sala-editor/ose/operational-element-naming";

export {
  selectMultiple,
  snap,
  resize,
  rotate,
} from "@/lib/sala-editor/ose/operational-element-editor-future";
