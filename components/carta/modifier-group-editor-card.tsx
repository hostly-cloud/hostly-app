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

    </ConfigCard>
  );
}
