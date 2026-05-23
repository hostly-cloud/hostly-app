"use client";



import { useEffect, useMemo, useState } from "react";

import {

  buildCartLineDisplayName,

  buildSelectedModifiersFromDraft,

  filterVisibleModifierGroupsForSelection,

  isModifierSelectionValid,

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



const EMPTY_INVENTORY_LOOKUP: TpvInventoryProductsById = new Map();



export function TpvProductModifiersModal({

  product,

  groups,

  inventoryProductsById = EMPTY_INVENTORY_LOOKUP,

  onCancel,

  onConfirm,

}: TpvProductModifiersModalProps) {

  const [selection, setSelection] = useState<ModifierSelectionByGroup>({});



  useEffect(() => {

    const initial: ModifierSelectionByGroup = {};

    for (const group of groups) {

      if (group.required && group.options.length === 1) {

        initial[group.id] = [group.options[0]!.id];

      }

    }

    setSelection(initial);

  }, [product.id, groups]);



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

  const unitPrice =

    (Number.isFinite(basePrice) ? basePrice : 0) + modifierTotal;

  const displayName = buildCartLineDisplayName(product.nombre, selectedModifiers);

  const canConfirm = isModifierSelectionValid(visibleGroups, selection);



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

        aria-label={`Modificadores de ${product.nombre}`}

        className="carta-line-editor-panel carta-modifiers-modal-panel"

        onMouseDown={(e) => e.stopPropagation()}

      >

        <div className="carta-line-editor-title">{product.nombre}</div>

        <div className="carta-line-editor-sub">

          Elige opciones antes de añadir a la comanda

        </div>



        <div className="carta-modifiers-modal-groups">

          {visibleGroups.map((group) => {

            const selectedIds = selection[group.id] ?? [];

            const minHint = group.required

              ? Math.max(1, group.minSelected)

              : group.minSelected;

            const maxHint =

              group.maxSelected > 0 ? group.maxSelected : undefined;

            return (

              <section key={group.id} className="carta-modifiers-modal-group">

                <div className="carta-modifiers-modal-group-head">

                  <div className="carta-line-editor-label">{group.name}</div>

                  <div className="carta-modifiers-modal-group-meta">

                    {group.required ? "Obligatorio" : "Opcional"}

                    {minHint > 0 || maxHint

                      ? ` · ${minHint}${maxHint ? `-${maxHint}` : "+"}`

                      : ""}

                  </div>

                </div>

                <div className="carta-modifiers-modal-options">

                  {group.options.map((option) => {

                    const active = selectedIds.includes(option.id);

                    const delta = Number(option.priceDelta);

                    const optionStockWarning = resolveModifierOptionStockWarning(

                      option,

                      inventoryProductsById,

                    );

                    const optionStockLabel =

                      getStockWarningShortLabel(optionStockWarning);

                    return (

                      <button

                        key={option.id}

                        type="button"

                        className={

                          active

                            ? "carta-modifiers-option carta-modifiers-option--active"

                            : "carta-modifiers-option"

                        }

                        aria-pressed={active}

                        onClick={() =>

                          setSelection((prev) => {

                            const next = toggleSingleSelection(

                              prev,

                              group,

                              option.id,

                            );

                            const nextVisible = filterVisibleModifierGroupsForSelection(

                              groups,

                              next,

                            );

                            const hiddenMixerIds = new Set(

                              groups

                                .filter(

                                  (g) =>

                                    !nextVisible.some((v) => v.id === g.id),

                                )

                                .map((g) => g.id),

                            );

                            if (hiddenMixerIds.size === 0) return next;

                            const cleaned = { ...next };

                            for (const id of hiddenMixerIds) delete cleaned[id];

                            return cleaned;

                          })

                        }

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

                      </button>

                    );

                  })}

                </div>

              </section>

            );

          })}

        </div>



        {selectedStockWarning === "out" ? (

          <p className="carta-modifiers-stock-hint" role="status">

            Este mixer está sin stock, pero puedes continuar.

          </p>

        ) : null}



        <div className="carta-modifiers-modal-summary">

          <div>

            <div className="carta-modifiers-modal-summary-label">Nombre</div>

            <div className="carta-modifiers-modal-summary-value">{displayName}</div>

          </div>

          <div>

            <div className="carta-modifiers-modal-summary-label">Precio unitario</div>

            <div className="carta-modifiers-modal-summary-value">

              {formatEuro(unitPrice)}

            </div>

          </div>

        </div>



        <div className="carta-line-editor-actions">

          <button

            type="button"

            className="carta-line-editor-btn carta-line-editor-btn--ghost"

            onClick={onCancel}

          >

            Cancelar

          </button>

          <button

            type="button"

            className="carta-line-editor-btn carta-line-editor-btn--primary"

            disabled={!canConfirm}

            onClick={() =>

              onConfirm({

                selectedModifiers,

                modifierTotal,

                displayName,

              })

            }

          >

            Añadir

          </button>

        </div>

      </div>

    </div>

  );

}


