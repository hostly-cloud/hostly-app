"use client";

import { memo } from "react";

import {
  ElementCard as LegacyElementCard,
  type ElementMapCardProps,
} from "./legacy-element-map-card";
import { TpvV2TableOperationAdapter } from "./tpv-v2-table-operation-adapter";

export type {
  ElementMapCardProps,
  HostlyMapJoinDragHoverDetail,
} from "./legacy-element-map-card";

export const ElementCard = memo(function ElementCard(
  props: ElementMapCardProps,
) {
  if (props.interactionOnly) {
    return <TpvV2TableOperationAdapter {...props} />;
  }

  return <LegacyElementCard {...props} />;
});
