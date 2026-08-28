"use client";

import {
  Fragment,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { getDefaultSizeForPlanElementType } from "@/lib/firestore/tables";
import type { EditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";
import { TpvV2OperationalParityProvider } from "@/lib/tpv/v2-operational-parity-context";
import { evaluateTpvV2LegacyResidualCoverage } from "@/lib/tpv/v2-legacy-residual-coverage";
import {
  hasCachedTpvPublishedMapRuntime,
  matchCachedTpvPublishedReadonlyContract,
} from "@/lib/tpv/published-map-runtime";
import { SalaEditorReadonlyMap } from "@/components/sala-editor/readonly/sala-editor-readonly-map";
import type { SalaEditorReadonlyTpvOperationalState } from "@/components/sala-editor/readonly/sala-editor-readonly-operational-layer";
import type { EditableFloorMapProps } from "./editable-floor-map-contract";
import { TpvV2ReadonlyViewport } from "./tpv-v2-readonly-viewport";

export * from "./editable-floor-map-contract";
export * from "./plan-element-base-visual-style";

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readEditorV2ContractFromUnderlay(
  readonlyUnderlay: ReactNode,
): EditorTpvReadonlyVisualContract | null {
  if (!isValidElement(readonlyUnderlay)) return null;

  const candidate = (readonlyUnderlay.props as { contract?: unknown }).contract;
  if (typeof candidate !== "object" || candidate === null) return null;

  const contract = candidate as Partial<EditorTpvReadonlyVisualContract>;
  if (
    !Array.isArray(contract.surfaces) ||
    !Array.isArray(contract.zones) ||
    !Array.isArray(contract.walls) ||
    !Array.isArray(contract.wallAttachments) ||
    !Array.isArray(contract.structuralElements) ||
    !Array.isArray(contract.landscapeElements) ||
    !Array.isArray(contract.operationalElementInstances)
  ) {
    return null;
  }

  return candidate as EditorTpvReadonlyVisualContract;
}

function readPayloadRestaurantId(props: EditableFloorMapProps): string | null {
  const ids = new Set<string>();
  for (const element of props.elements) {
    const rid = normalizeId(element.restaurantId);
    if (rid) ids.add(rid);
  }
  for (const zone of props.zones ?? []) {
    const rid = normalizeId((zone as { restaurantId?: unknown }).restaurantId);
    if (rid) ids.add(rid);
  }
  return ids.size === 1 ? [...ids][0]! : null;
}

function visiblePublishedInstanceIds(
  contract: EditorTpvReadonlyVisualContract,
  props: EditableFloorMapProps,
): string[] {
  const visibleTableIds = new Set(
    props.elements.map((element) => normalizeId(element.id)).filter(Boolean),
  );
  return contract.operationalElementInstances
    .filter((instance) => {
      const tableId = normalizeId(instance.metadata.legacyTableId);
      return tableId !== "" && visibleTableIds.has(tableId);
    })
    .map((instance) => instance.id);
}

function basicPublishedOperationalStateByTableId(
  props: EditableFloorMapProps,
): Record<string, SalaEditorReadonlyTpvOperationalState> {
  const stateByTableId: Record<string, SalaEditorReadonlyTpvOperationalState> = {};
  for (const element of props.elements) {
    const id = normalizeId(element.id);
    if (!id) continue;
    if (element.status === "occupied") stateByTableId[id] = "ocupada";
    else if (element.status === "reserved") stateByTableId[id] = "reservada";
    else stateByTableId[id] = "libre";
  }
  return stateByTableId;
}

function buildPublishedReadonlyUnderlay(
  props: EditableFloorMapProps,
  contract: EditorTpvReadonlyVisualContract,
): ReactNode {
  const operationalVisibleInstanceIds = visiblePublishedInstanceIds(contract, props);

  if (isValidElement(props.readonlyUnderlay)) {
    return cloneElement(
      props.readonlyUnderlay as ReactElement<Record<string, unknown>>,
      {
        contract,
        operationalVisibleInstanceIds,
      },
    );
  }

  return (
    <SalaEditorReadonlyMap
      contract={contract}
      mode="logical-underlay"
      operationalMode="tpv"
      operationalStateByTableId={basicPublishedOperationalStateByTableId(props)}
      operationalVisibleInstanceIds={operationalVisibleInstanceIds}
      coordinateScale={1}
    />
  );
}

function renderDetachedOperationalController(
  props: EditableFloorMapProps,
  element: EditableFloorMapProps["elements"][number],
): ReactNode {
  if (!props.renderElement) return null;

  const elementId = String(element.id ?? "").trim();
  if (!elementId) return null;
  const defaults = getDefaultSizeForPlanElementType(element.type);
  const mapTileWidth =
    typeof element.width === "number" && Number.isFinite(element.width)
      ? element.width
      : defaults.width;
  const mapTileHeight =
    typeof element.height === "number" && Number.isFinite(element.height)
      ? element.height
      : defaults.height;

  return props.renderElement({
    element,
    elementId,
    mapLayoutX:
      typeof element.x === "number" && Number.isFinite(element.x) ? element.x : 0,
    mapLayoutY:
      typeof element.y === "number" && Number.isFinite(element.y) ? element.y : 0,
    mapTileWidth,
    mapTileHeight,
  });
}

/**
 * Fachada TPV V2 fail-closed.
 *
 * En TPV, el contrato visual se resuelve desde la proyección operativa publicada
 * (floorPlans/tables/zones) precargada por el gate. Un draft del Editor puede
 * seguir llegando como prop de compatibilidad desde consumidores antiguos, pero
 * nunca gana frente al runtime publicado y no se usa si el runtime ya está cargado.
 */
export function EditableFloorMap(props: EditableFloorMapProps) {
  const payloadRestaurantId = readPayloadRestaurantId(props);
  const publishedRuntimeLoaded =
    payloadRestaurantId != null &&
    hasCachedTpvPublishedMapRuntime(payloadRestaurantId);
  const publishedContract = publishedRuntimeLoaded
    ? matchCachedTpvPublishedReadonlyContract({
        elements: props.elements,
        zones: props.zones,
      })
    : null;
  const compatibilityUnderlayContract = props.readonlyUnderlay
    ? readEditorV2ContractFromUnderlay(props.readonlyUnderlay)
    : null;
  const contract = publishedRuntimeLoaded
    ? publishedContract
    : compatibilityUnderlayContract;

  if (props.editable || !contract) {
    return (
      <div
        hidden
        data-hostly-v2-floor-map="blocked-non-v2-consumer"
        data-hostly-v2-floor-map-editable={props.editable ? "true" : "false"}
        data-hostly-v2-floor-map-source={
          publishedRuntimeLoaded ? "published-runtime-unmatched" : "no-v2-contract"
        }
      />
    );
  }

  const coverage = evaluateTpvV2LegacyResidualCoverage({
    contract,
    elements: props.elements,
    zones: props.zones,
  });
  const readonlyUnderlay = publishedContract
    ? buildPublishedReadonlyUnderlay(props, publishedContract)
    : props.readonlyUnderlay;

  return (
    <TpvV2OperationalParityProvider
      operationalIds={coverage.linkedOperationalIds}
    >
      {coverage.linkedOperationalElements.map((element) => (
        <Fragment key={`v2-controller-${element.id}`}>
          {renderDetachedOperationalController(props, element)}
        </Fragment>
      ))}

      <span
        hidden
        data-hostly-v2-coverage={coverage.fullyCovered ? "complete" : "incomplete"}
        data-hostly-v2-residual-elements={coverage.residualLegacyElements.length}
        data-hostly-v2-residual-zones={coverage.residualLegacyZones?.length ?? 0}
        data-hostly-v2-contract-source={
          publishedContract ? "published-operational" : "compatibility-underlay"
        }
      />

      <TpvV2ReadonlyViewport
        {...props}
        readonlyUnderlay={readonlyUnderlay}
        className={[props.className, "hostly-v2-native-viewport"]
          .filter(Boolean)
          .join(" ")}
      />
    </TpvV2OperationalParityProvider>
  );
}
