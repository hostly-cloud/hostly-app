"use client";

import { memo } from "react";

import {
  ElementCard as LegacyElementCard,
  type ElementMapCardProps,
} from "./legacy-element-map-card";
import { TpvLegacyTableInteractionController } from "./tpv-legacy-table-interaction-controller";

export type {
  ElementMapCardProps,
  HostlyMapJoinDragHoverDetail,
} from "./legacy-element-map-card";

export const ElementCard = memo(function ElementCard(
  props: ElementMapCardProps,
) {
  if (props.interactionOnly) {
    return <TpvLegacyTableInteractionController {...props} />;
  }

  return <LegacyElementCard {...props} />;
});
