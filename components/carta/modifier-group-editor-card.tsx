"use client";

import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
  ConfigCard,
} from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import { HostlyFormToggle } from "@/components/ui/hostly";
import type { ProductDocument } from "@/lib/firestore/products";
import {
  MODIFIER_GROUP_TYPES,
  MODIFIER_GROUP_TYPE_LABELS,
  MODIFIER_INVENTORY_UNITS,
  MODIFIER_INVENTORY_UNIT_LABELS,
  type ModifierGroupDocument,
  type ModifierGroupType,
  type ModifierInventoryUnit,
} from "@/lib/modifiers/modifier-types";

const modifierEditorMobileStyles = `
@media (max-width: 767px) {
  .hostly-modifier-form-section:not(.hostly-modifier-form-section--create) {
    position: fixed !important;
    inset: 0 !important;
    z-index: 60 !important;
    display: flex !important;
    flex-direction: column !important;
    width: 100vw !important;
    height: 100dvh !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    border: 0 !important;
    background: #ffffff !important;
    box-shadow: none !important;
    overflow: hidden !important;
  }

  .hostly-modifier-form-section__head {
    flex: 0 0 auto !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 8px !important;
    padding: max(9px, env(safe-area-inset-top)) 10px 8px !important;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12) !important;
    background: rgba(255, 255, 255, 0.98) !important;
  }

  .hostly-modifier-form-section__title-block {
    min-width: 0;
  }

  .hostly-modifier-form-section__title-block .hostly-carta-config-drawer__title {
    margin: 0 !important;
    font-size: 17px !important;
    font-weight: 760 !important;
    line-height: 1.1 !important;
    letter-spacing: -0.02em !important;
  }

  .hostly-modifier-form-section__title-block .hostly-carta-config-form-hint {
    margin: 2px 0 0 !important;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 9.5px !important;
    line-height: 1.1 !important;
  }

  .hostly-modifier-form-section__head-actions {
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .hostly-modifier-form-section__head-actions button {
    min-height: 36px !important;
    padding: 6px 9px !important;
    border-radius: 9px !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 10.5px !important;
  }

  .hostly-modifier-form-grid.hostly-carta-config-drawer__body {
    flex: 0 0 auto !important;
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 7px !important;
    padding: 8px 10px !important;
    background: var(--hostly-surface-page-soft) !important;
  }

  .hostly-modifier-form-grid__span-2 {
    grid-column: 1 / -1 !important;
  }

  .hostly-modifier-form-section .hostly-carta-config-form-field,
  .hostly-modifier-form-section .hostly-modifier-form-toggles {
    gap: 3px !important;
  }

  .hostly-modifier-form-section .hostly-carta-config-form-label {
    font-size: 9.5px !important;
    line-height: 1.1 !important;
  }

  .hostly-modifier-form-section .hostly-carta-config-field-input {
    min-height: 40px !important;
    padding: 7px 9px !important;
    border-radius: 9px !important;
    font-size: 12px !important;
    box-shadow: none !important;
  }

  .hostly-modifier-form-toggles {
    display: flex !important;
    grid-column: 1 / -1 !important;
    flex-wrap: wrap !important;
    gap: 6px !important;
    padding: 7px 8px !important;
    border: 1px solid rgba(148, 163, 184, 0.14) !important;
    border-radius: 9px !important;
    background: #ffffff !important;
  }

  .hostly-modifier-form-options {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    padding: 8px 10px 90px !important;
    background: #ffffff !important;
  }

  .hostly-modifier-form-options__head {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
    margin: 0 -2px 6px !important;
    padding: 3px 2px 6px !important;
    background: rgba(255, 255, 255, 0.97) !important;
  }

  .hostly-modifier-form-options__head .hostly-carta-config-section-title {
    margin: 0 !important;
    font-size: 13px !important;
    line-height: 1.1 !important;
  }

  .hostly-modifier-form-options__head button {
    min-height: 36px !important;
    padding: 6px 9px !important;
    border-radius: 9px !important;
    font-size: 10.5px !important;
    box-shadow: none !important;
  }

  .hostly-modifier-form-options__list {
    display: flex !important;
    flex-direction: column !important;
    gap: 7px !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .hostly-modifier-form-option {
    padding: 8px !important;
    border: 1px solid rgba(148, 163, 184, 0.14) !important;
    border-radius: 10px !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  .hostly-modifier-form-option__main {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 92px !important;
    align-items: end !important;
    gap: 6px !important;
  }

  .hostly-modifier-form-option__toggle {
    grid-column: 1 / -1 !important;
    min-height: 34px !important;
    padding: 5px 7px !important;
    border-radius: 8px !important;
    background: var(--hostly-surface-page-soft) !important;
  }

  .hostly-modifier-form-option__inventory {
    margin-top: 7px !important;
    padding: 7px !important;
    border: 0 !important;
    border-radius: 9px !important;
    background: var(--hostly-surface-page-soft) !important;
  }

  .hostly-modifier-form-option__inventory > .hostly-carta-config-section-title {
    margin: 0 !important;
    font-size: 10.5px !important;
    font-weight: 720 !important;
    line-height: 1.1 !important;
    color: var(--hostly-ink-muted) !important;
  }

  .hostly-modifier-form-option__inventory > .hostly-carta-config-form-hint {
    margin: 2px 0 6px !important;
    font-size: 8.5px !important;
    line-height: 1.2 !important;
  }

  .hostly-modifier-form-grid--inventory {
    display: grid !important;
    grid-template-columns: 1fr 84px !important;
    gap: 5px !important;
  }

  .hostly-modifier-form-grid--inventory .hostly-modifier-form-grid__span-2 {
    grid-column: 1 / -1 !important;
  }

  .hostly-modifier-form-option__inventory .hostly-carta-config-field-input {
    min-height: 38px !important;
    font-size: 11px !important;
  }

  .hostly-modifier-form-actions {
    position: fixed !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    z-index: 4 !important;
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 8px 10px max(8px, env(safe-area-inset-bottom)) !important;
    border-top: 1px solid rgba(148, 163, 184, 0.12) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.035) !important;
  }

  .hostly-modifier-form-actions__order,
  .hostly-modifier-form-actions__primary {
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
  }

  .hostly-modifier-form-actions__primary {
    justify-content: flex-end !important;
    min-width: 0;
  }

  .hostly-modifier-form-actions button {
    min-height: 42px !important;
    padding: 6px 9px !important;
    border-radius: 9px !important;
    font-size: 10px !important;
    line-height: 1.05 !important;
    white-space: nowrap;
  }

  .hostly-modifier-form-actions__order button {
    min-width: 38px !important;
    padding-inline: 7px !important;
    color: var(--hostly-ink-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .hostly-modifier-form-actions__primary button:first-child {
    background: transparent !important;
    box-shadow: none !important;
  }

  .hostly-modifier-form-meta {
    display: none !important;
  }
}
`;

export type OptionDraft = {
  id: string;
  name: string;
  priceDelta: string;
  active: boolean;
  sortOrder: number;
  inventoryProductId: string;
  inventoryProductName: string;
  inventoryQuantity: string;
  inventoryUnit: ModifierInventoryUnit | "";
};

export type GroupDraft = {
  name: string;
  type: ModifierGroupType;
  active: boolean;
  required: boolean;
  minSelected: string;
  maxSelected: string;
  options: OptionDraft[];
};

type ModifierGroupEditorCardProps = {
  group: ModifierGroupDocument;
  draft: GroupDraft;
  index: number;
  groupsLength: number;
  busy: boolean;
  dirty: boolean;
  inventoryProducts: ProductDocument[];
  onPatchDraft: (patch: Partial<GroupDraft>) => void;
  onPatchOption: (optionId: string, patch: Partial<OptionDraft>) => void;
  onAddOption: () => void;
  onInventoryProductChange: (optionId: string, productId: string) => void;
  onSave: () => void;
  onToggleActive: () => void;
  onMove: (direction: "up" | "down") => void;
  onClose: () => void;
};

const inputClass = "hostly-input hostly-carta-config-field-input";

export function ModifierGroupEditorCard({
  group,
  draft,
  index,
  groupsLength,
  busy,
  dirty,
  inventoryProducts,
  onPatchDraft,
  onPatchOption,
  onAddOption,
  onInventoryProductChange,
  onSave,
  onToggleActive,
  onMove,
  onClose,
}: ModifierGroupEditorCardProps) {
  return (
    <>
      <style>{modifierEditorMobileStyles}</style>
      <ConfigCard className="hostly-modifier-form-section">
        <div className="hostly-modifier-form-section__head">
          <div className="hostly-modifier-form-section__title-block">
            <h2 className="hostly-carta-config-drawer__title">Editar grupo</h2>
            <p className="hostly-carta-config-form-hint">{group.name}</p>
          </div>
          <div className="hostly-carta-config-drawer__footer hostly-modifier-form-section__head-actions">
            <ConfigBtnSecondary type="button" disabled={busy} onClick={onClose}>
              Cerrar
            </ConfigBtnSecondary>
          </div>
        </div>

        <div className="hostly-modifier-form-grid hostly-carta-config-drawer__body">
          <label className="hostly-carta-config-form-field hostly-modifier-form-grid__span-2">
            <span className="hostly-carta-config-form-label">Nombre del grupo</span>
            <input
              className={inputClass}
              value={draft.name}
              onChange={(e) => onPatchDraft({ name: e.target.value })}
            />
          </label>
          <label className="hostly-carta-config-form-field">
            <span className="hostly-carta-config-form-label">Tipo</span>
            <select
              className={inputClass}
              value={draft.type}
              onChange={(e) => onPatchDraft({ type: e.target.value as ModifierGroupType })}
            >
              {MODIFIER_GROUP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MODIFIER_GROUP_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <div className="hostly-modifier-form-toggles">
            <HostlyFormToggle
              checked={draft.active}
              onChange={(e) => onPatchDraft({ active: e.target.checked })}
              label="Activo"
            />
            <HostlyFormToggle
              checked={draft.required}
              onChange={(e) => onPatchDraft({ required: e.target.checked })}
              label="Obligatorio en TPV"
              hint="Futuro"
            />
          </div>
          <label className="hostly-carta-config-form-field">
            <span className="hostly-carta-config-form-label">Mín. selección</span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={draft.minSelected}
              onChange={(e) => onPatchDraft({ minSelected: e.target.value })}
            />
          </label>
          <label className="hostly-carta-config-form-field">
            <span className="hostly-carta-config-form-label">Máx. selección</span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={draft.maxSelected}
              onChange={(e) => onPatchDraft({ maxSelected: e.target.value })}
            />
          </label>
        </div>

        <div className="hostly-modifier-form-options">
          <div className="hostly-modifier-form-options__head">
            <h3 className="hostly-carta-config-section-title">Opciones</h3>
            <ConfigBtnSecondary type="button" disabled={busy} onClick={onAddOption}>
              Añadir opción
            </ConfigBtnSecondary>
          </div>
          {draft.options.length === 0 ? (
            <p className="hostly-carta-config-form-hint">Sin opciones. Añade chupito, copa, mixer, etc.</p>
          ) : (
            <ul className="hostly-modifier-form-options__list">
              {draft.options.map((opt) => (
                <li key={opt.id} className="hostly-modifier-form-option">
                  <div className="hostly-modifier-form-option__main">
                    <label className="hostly-carta-config-form-field">
                      <span className="hostly-carta-config-form-label">Nombre</span>
                      <input
                        className={inputClass}
                        value={opt.name}
                        onChange={(e) => onPatchOption(opt.id, { name: e.target.value })}
                        placeholder="Tónica"
                      />
                    </label>
                    <label className="hostly-carta-config-form-field">
                      <span className="hostly-carta-config-form-label">Suplemento €</span>
                      <input
                        className={inputClass}
                        value={opt.priceDelta}
                        onChange={(e) => onPatchOption(opt.id, { priceDelta: e.target.value })}
                        placeholder="0"
                      />
                    </label>
                    <HostlyFormToggle
                      checked={opt.active}
                      onChange={(e) => onPatchOption(opt.id, { active: e.target.checked })}
                      label="Activa"
                      className="hostly-modifier-form-option__toggle"
                    />
                  </div>

                  <div className="hostly-modifier-form-option__inventory">
                    <p className="hostly-carta-config-section-title">Consumo inventario</p>
                    <p className="hostly-carta-config-form-hint">
                      Artículo a descontar al vender esta opción (sin descuento automático todavía).
                    </p>
                    <div className="hostly-modifier-form-grid hostly-modifier-form-grid--inventory">
                      <label className="hostly-carta-config-form-field hostly-modifier-form-grid__span-2">
                        <span className="hostly-carta-config-form-label">Producto inventario</span>
                        <select
                          className={inputClass}
                          value={opt.inventoryProductId}
                          onChange={(e) => onInventoryProductChange(opt.id, e.target.value)}
                        >
                          <option value="">Sin consumo</option>
                          {inventoryProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="hostly-carta-config-form-field">
                        <span className="hostly-carta-config-form-label">Cantidad</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className={inputClass}
                          value={opt.inventoryQuantity}
                          disabled={!opt.inventoryProductId}
                          onChange={(e) => onPatchOption(opt.id, { inventoryQuantity: e.target.value })}
                          placeholder="1"
                        />
                      </label>
                      <label className="hostly-carta-config-form-field">
                        <span className="hostly-carta-config-form-label">Unidad</span>
                        <select
                          className={inputClass}
                          value={opt.inventoryUnit}
                          disabled={!opt.inventoryProductId}
                          onChange={(e) =>
                            onPatchOption(opt.id, {
                              inventoryUnit: e.target.value as ModifierInventoryUnit,
                            })
                          }
                        >
                          <option value="">—</option>
                          {MODIFIER_INVENTORY_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {MODIFIER_INVENTORY_UNIT_LABELS[unit]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {opt.inventoryProductId ? (
                      <p className="hostly-carta-config-form-hint">
                        Venta TPV: «{opt.name.trim() || "—"}» · Inventario:{" "}
                        {opt.inventoryProductName.trim() || opt.inventoryProductId}
                        {opt.inventoryQuantity && opt.inventoryUnit
                          ? ` · ${opt.inventoryQuantity} ${MODIFIER_INVENTORY_UNIT_LABELS[opt.inventoryUnit]}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="hostly-carta-config-drawer__footer hostly-modifier-form-actions">
          <div className="hostly-modifier-form-actions__order">
            <ConfigBtnSecondary type="button" disabled={busy || index === 0} onClick={() => onMove("up")}>
              ↑ Subir
            </ConfigBtnSecondary>
            <ConfigBtnSecondary
              type="button"
              disabled={busy || index === groupsLength - 1}
              onClick={() => onMove("down")}
            >
              ↓ Bajar
            </ConfigBtnSecondary>
          </div>
          <div className="hostly-modifier-form-actions__primary">
            <ConfigBtnSecondary type="button" disabled={busy} onClick={onToggleActive}>
              {group.active ? "Desactivar" : "Activar"}
            </ConfigBtnSecondary>
            <ConfigBtnPrimary type="button" disabled={busy || !dirty} onClick={onSave}>
              {busy ? "Guardando…" : "Guardar"}
            </ConfigBtnPrimary>
          </div>
        </div>

        <p className="hostly-modifier-form-meta">
          {group.id} · orden {group.sortOrder}
          {!group.active ? " · inactivo" : ""}
          {group.required ? " · obligatorio" : ""}
        </p>
      </ConfigCard>
    </>
  );
}
