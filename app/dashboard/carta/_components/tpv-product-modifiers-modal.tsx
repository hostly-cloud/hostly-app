"use client";

import { useMemo, useState } from "react";
import { HostlyButton } from "@/components/ui/hostly";
import {
  buildCartLineDisplayName,
  buildSelectedModifiersFromDraft,
  filterVisibleModifierGroupsForSelection,
  isTpvModifierModalConfirmValid,
  partitionVisibleModifierGroupsForTpv,
  selectionHasChosenMixer,
  selectionRequiresMixerStep,
  sumSelectedModifiersTotal,
  type CartOrderLineSelectedModifier,
  type ModifierSelectionByGroup,
} from "@/lib/modifiers/cart-order-modifiers";
import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";
import {
  getStockWarningShortLabel,
  mergeStockWarningLevel,
  resolveModifierOptionStockWarning,
  stockWarningBadgeClassName,
  type StockWarningLevel,
  type TpvInventoryProductsById,
} from "@/lib/inventory/tpv-stock-warnings";
import type { Product } from "@/types/product";

type TpvProductModifiersModalProps = {
  product: Product;
  groups: ModifierGroupDocument[];
  inventoryProductsById?: TpvInventoryProductsById;
  onCancel: () => void;
  onConfirm: (payload: {
    selectedModifiers: CartOrderLineSelectedModifier[];
    modifierTotal: number;
    displayName: string;
  }) => void;
};

function formatEuro(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function toggleSingleSelection(
  prev: ModifierSelectionByGroup,
  group: ModifierGroupDocument,
  optionId: string,
): ModifierSelectionByGroup {
  const current = prev[group.id] ?? [];
  const max = group.maxSelected > 0 ? group.maxSelected : 1;
  const isSelected = current.includes(optionId);
  if (max <= 1) {
    return {
      ...prev,
      [group.id]: isSelected ? [] : [optionId],
    };
  }
  if (isSelected) {
    return {
      ...prev,
      [group.id]: current.filter((id) => id !== optionId),
    };
  }
  if (current.length >= max) {
    return {
      ...prev,
      [group.id]: [...current.slice(1), optionId],
    };
  }
  return {
    ...prev,
    [group.id]: [...current, optionId],
  };
}

function pruneSelectionForVisibleGroups(
  groups: readonly ModifierGroupDocument[],
  next: ModifierSelectionByGroup,
): ModifierSelectionByGroup {
  const nextVisible = filterVisibleModifierGroupsForSelection(groups, next);
  const hiddenIds = new Set(
    groups.filter((g) => !nextVisible.some((v) => v.id === g.id)).map((g) => g.id),
  );
  if (hiddenIds.size === 0) return next;
  const cleaned = { ...next };
  for (const id of hiddenIds) delete cleaned[id];
  return cleaned;
}

const EMPTY_INVENTORY_LOOKUP: TpvInventoryProductsById = new Map();

function ModifierOptionButton({
  option,
  active,
  inventoryProductsById,
  onSelect,
}: {
  option: ModifierGroupDocument["options"][number];
  active: boolean;
  inventoryProductsById: TpvInventoryProductsById;
  onSelect: () => void;
}) {
  const delta = Number(option.priceDelta);
  const optionStockWarning = resolveModifierOptionStockWarning(
    option,
    inventoryProductsById,
  );
  const optionStockLabel = getStockWarningShortLabel(optionStockWarning);

  return (
    <HostlyButton
      variant="chip"
      size="touch"
      active={active}
      className={
        active
          ? "carta-modifiers-option carta-modifiers-option--active"
          : "carta-modifiers-option"
      }
      onClick={onSelect}
    >
      <span className="carta-modifiers-option-name">
        {option.name}
        {optionStockLabel ? (
          <span
            className={`carta-modifiers-option-stock ${stockWarningBadgeClassName(optionStockWarning)}`}
          >
            {optionStockLabel}
          </span>
        ) : null}
      </span>
      {Number.isFinite(delta) && delta !== 0 ? (
        <span className="carta-modifiers-option-delta">
          {delta > 0 ? "+" : ""}
          {formatEuro(delta)}
        </span>
      ) : null}
    </HostlyButton>
  );
}

function ModifierGroupSection({
  group,
  selection,
  inventoryProductsById,
  onToggleOption,
  stepLabel,
  stepTitle,
}: {
  group: ModifierGroupDocument;
  selection: ModifierSelectionByGroup;
  inventoryProductsById: TpvInventoryProductsById;
  onToggleOption: (group: ModifierGroupDocument, optionId: string) => void;
  stepLabel?: string;
  stepTitle?: string;
}) {
  const selectedIds = selection[group.id] ?? [];
  const minHint = group.required ? Math.max(1, group.minSelected) : group.minSelected;
  const maxHint = group.maxSelected > 0 ? group.maxSelected : undefined;

  return (
    <section key={group.id} className="carta-modifiers-modal-group">
      {stepLabel ? (
        <p className="hostly-tpv-modifiers-step-kicker">{stepLabel}</p>
      ) : null}
      <div className="carta-modifiers-modal-group-head">
        <div className="carta-line-editor-label">{stepTitle ?? group.name}</div>
        <div className="carta-modifiers-modal-group-meta">
          {group.required ? "Elige una opción" : "Opcional"}
          {minHint > 0 || maxHint ? ` · ${minHint}${maxHint ? `-${maxHint}` : "+"}` : ""}
        </div>
      </div>
      <div className="carta-modifiers-modal-options">
        {group.options.map((option) => (
          <ModifierOptionButton
            key={option.id}
            option={option}
            active={selectedIds.includes(option.id)}
            inventoryProductsById={inventoryProductsById}
            onSelect={() => onToggleOption(group, option.id)}
          />
        ))}
      </div>
    </section>
  );
}

function buildInitialSelection(
  groups: readonly ModifierGroupDocument[],
): ModifierSelectionByGroup {
  const initial: ModifierSelectionByGroup = {};
  for (const group of groups) {
    if (group.required && group.options.length === 1) {
      initial[group.id] = [group.options[0]!.id];
    }
  }
  return initial;
}

export function TpvProductModifiersModal(
  props: TpvProductModifiersModalProps,
) {
  const groupsKey = props.groups
    .map((group) =>
      `${group.id}:${group.required ? "1" : "0"}:${group.options
        .map((option) => option.id)
        .join(",")}`,
    )
    .join("|");
  return (
    <TpvProductModifiersModalContent
      key={`${props.product.id}:${groupsKey}`}
      {...props}
    />
  );
}

function TpvProductModifiersModalContent({
  product,
  groups,
  inventoryProductsById = EMPTY_INVENTORY_LOOKUP,
  onCancel,
  onConfirm,
}: TpvProductModifiersModalProps) {
  const [selection, setSelection] = useState<ModifierSelectionByGroup>(() =>
    buildInitialSelection(groups),
  );

  const { formatGroups, mixerGroups, showMixerStep } = useMemo(
    () => partitionVisibleModifierGroupsForTpv(groups, selection),
    [groups, selection],
  );

  const visibleGroups = useMemo(
    () => filterVisibleModifierGroupsForSelection(groups, selection),
    [groups, selection],
  );

  const selectedModifiers = useMemo(
    () => buildSelectedModifiersFromDraft(visibleGroups, selection),
    [visibleGroups, selection],
  );

  const modifierTotal = useMemo(
    () => sumSelectedModifiersTotal(selectedModifiers),
    [selectedModifiers],
  );

  const selectedStockWarning = useMemo(() => {
    let worst: StockWarningLevel = "none";
    for (const group of visibleGroups) {
      const selectedIds = selection[group.id] ?? [];
      for (const optionId of selectedIds) {
        const option = group.options.find((opt) => opt.id === optionId);
        if (!option) continue;
        worst = mergeStockWarningLevel(
          worst,
          resolveModifierOptionStockWarning(option, inventoryProductsById),
        );
      }
    }
    return worst;
  }, [inventoryProductsById, selection, visibleGroups]);

  const basePrice = Number(product.precio);
  const unitPrice = (Number.isFinite(basePrice) ? basePrice : 0) + modifierTotal;
  const displayName = buildCartLineDisplayName(product.nombre, selectedModifiers);
  const canConfirm = isTpvModifierModalConfirmValid(groups, selection);
  const awaitingMixerChoice =
    showMixerStep &&
    selectionRequiresMixerStep(groups, selection) &&
    !selectionHasChosenMixer(groups, selection);

  function handleToggleOption(group: ModifierGroupDocument, optionId: string) {
    setSelection((prev) =>
      pruneSelectionForVisibleGroups(
        groups,
        toggleSingleSelection(prev, group, optionId),
      ),
    );
  }

  const hasFormatStep = formatGroups.length > 0;

  return (
    <div
      className="carta-line-editor-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Opciones de ${product.nombre}`}
        className="carta-line-editor-panel carta-modifiers-modal-panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="carta-line-editor-title">{product.nombre}</div>
        <div className="carta-line-editor-sub">
          Primero el formato del servicio; después el refresco, si aplica.
        </div>

        <div className="carta-modifiers-modal-groups">
          {hasFormatStep
            ? formatGroups.map((group) => (
                <ModifierGroupSection
                  key={group.id}
                  group={group}
                  selection={selection}
                  inventoryProductsById={inventoryProductsById}
                  onToggleOption={handleToggleOption}
                  stepLabel={formatGroups.length > 0 && showMixerStep ? "Paso 1" : undefined}
                  stepTitle="¿Cómo lo sirves?"
                />
              ))
            : null}

          {showMixerStep ? (
            <>
              {mixerGroups.map((group) => (
                <ModifierGroupSection
                  key={group.id}
                  group={group}
                  selection={selection}
                  inventoryProductsById={inventoryProductsById}
                  onToggleOption={handleToggleOption}
                  stepLabel="Paso 2"
                  stepTitle="¿Con qué refresco?"
                />
              ))}
              {awaitingMixerChoice ? (
                <p className="carta-modifiers-stock-hint" role="status">
                  Selecciona un refresco para continuar.
                </p>
              ) : null}
            </>
          ) : null}

          {!hasFormatStep && !showMixerStep
            ? visibleGroups.map((group) => (
                <ModifierGroupSection
                  key={group.id}
                  group={group}
                  selection={selection}
                  inventoryProductsById={inventoryProductsById}
                  onToggleOption={handleToggleOption}
                />
              ))
            : null}
        </div>

        {selectedStockWarning === "out" ? (
          <p className="carta-modifiers-stock-hint" role="status">
            Algún refresco está sin stock; puedes continuar si lo necesitas.
          </p>
        ) : null}

        <div className="carta-modifiers-modal-summary">
          <div>
            <div className="carta-modifiers-modal-summary-label">En comanda</div>
            <div className="carta-modifiers-modal-summary-value">{displayName}</div>
          </div>
          <div>
            <div className="carta-modifiers-modal-summary-label">Precio unitario</div>
            <div className="carta-modifiers-modal-summary-value">{formatEuro(unitPrice)}</div>
          </div>
        </div>

        <div className="carta-line-editor-actions">
          <HostlyButton
            variant="ghost"
            size="touch"
            className="carta-line-editor-btn carta-line-editor-btn--ghost"
            onClick={onCancel}
          >
            Cancelar
          </HostlyButton>
          <HostlyButton
            variant="primary"
            size="touch"
            className="carta-line-editor-btn carta-line-editor-btn--primary"
            disabled={!canConfirm}
            title={awaitingMixerChoice ? "Selecciona un refresco para continuar." : undefined}
            onClick={() =>
              onConfirm({
                selectedModifiers,
                modifierTotal,
                displayName,
              })
            }
          >
            Añadir
          </HostlyButton>
        </div>
      </div>
    </div>
  );
}
