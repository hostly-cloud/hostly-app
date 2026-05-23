"use client";

import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";
import type { CartOrderLineSelectedModifier } from "@/lib/modifiers/cart-order-modifiers";

export type TpvInlineMixerGroup = {
  group: ModifierGroupDocument;
  options: ModifierGroupDocument["options"];
};

export function resolveSimpleMixerGroup(
  groups: readonly ModifierGroupDocument[],
): TpvInlineMixerGroup | null {
  const mixerGroup =
    groups.find((g) => g.active && g.type === "mixer") ??
    groups.find(
      (g) =>
        g.active &&
        /mixer|refresco|mezcla/i.test(`${g.name} ${g.normalizedName}`),
    );
  if (!mixerGroup) return null;
  if (mixerGroup.maxSelected > 1 && mixerGroup.minSelected > 1) return null;

  const options = mixerGroup.options.filter((o) => o.active).slice(0, 6);
  if (options.length === 0) return null;

  return { group: mixerGroup, options };
}

type TpvInlineMixerChipsProps = {
  selectedOptionId?: string | null;
  mixer: TpvInlineMixerGroup;
  onSelect: (option: ModifierGroupDocument["options"][number]) => void;
};

export function TpvInlineMixerChips({
  selectedOptionId,
  mixer,
  onSelect,
}: TpvInlineMixerChipsProps) {
  return (
    <div
      className="hostly-tpv-inline-mixer"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {mixer.options.map((option) => {
        const active = selectedOptionId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className={`hostly-tpv-inline-mixer-chip${active ? " is-active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(option);
            }}
          >
            {option.name}
          </button>
        );
      })}
    </div>
  );
}

export function buildMixerSelectionForLine(
  lineModifiers: readonly CartOrderLineSelectedModifier[] | undefined,
  mixer: TpvInlineMixerGroup,
  option: ModifierGroupDocument["options"][number],
): CartOrderLineSelectedModifier[] {
  const withoutMixer = (lineModifiers ?? []).filter(
    (m) => m.groupId !== mixer.group.id,
  );
  return [
    ...withoutMixer,
    {
      groupId: mixer.group.id,
      groupName: mixer.group.name,
      optionId: option.id,
      optionName: option.name,
      priceDelta: Number.isFinite(option.priceDelta) ? option.priceDelta : 0,
      ...(option.inventoryProductId
        ? { inventoryProductId: option.inventoryProductId }
        : {}),
      ...(option.inventoryProductName
        ? { inventoryProductName: option.inventoryProductName }
        : {}),
      ...(option.inventoryQuantity != null
        ? { inventoryQuantity: option.inventoryQuantity }
        : {}),
      ...(option.inventoryUnit ? { inventoryUnit: option.inventoryUnit } : {}),
    },
  ];
}
