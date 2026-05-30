"use client";

import Link from "next/link";
import {
  HostlyDataCell,
  HostlyDataRow,
  HostlyDataTable,
  HostlyDataTableBody,
  HostlyDataTableHead,
  HostlyDataTableScroll,
  HostlyMobileList,
  HostlyMobileListItem,
  HostlyStatusBadge,
} from "@/components/ui/hostly/data-table";
import { ConfigCartaEditToggleActions } from "@/components/carta/config-carta-row-actions";
import type { CartaCategoria, CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { resolveCategoryProductFamilyLabel } from "@/lib/carta/category-product-family";
import { resolveEffectiveModifierGroupLabels } from "@/lib/modifiers/effective-product-modifiers";
import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";

function tipoLabel(t: CartaCategoriaTipo): string {
  if (t === "food") return "Comida";
  if (t === "drink") return "Bebida";
  return "General";
}

function CategoryStatusBadge({ active }: { active: boolean }) {
  return (
    <HostlyStatusBadge tone={active ? "success" : "muted"} aria-label={active ? "Activa" : "Inactiva"}>
      {active ? "Activa" : "Inactiva"}
    </HostlyStatusBadge>
  );
}

export type CategoriasCartaDataViewProps = {
  items: CartaCategoria[];
  loading: boolean;
  countsByCatId: Map<string, number>;
  productFamilies: ProductFamilyDocument[];
  modifierGroups: ModifierGroupDocument[];
  onEdit: (item: CartaCategoria) => void;
  onToggleActive: (item: CartaCategoria) => void;
  onCreateNew?: () => void;
};

function renderCategoryCells(args: {
  c: CartaCategoria;
  countsByCatId: Map<string, number>;
  productFamilies: ProductFamilyDocument[];
  modifierGroups: ModifierGroupDocument[];
  onEdit: (item: CartaCategoria) => void;
  onToggleActive: (item: CartaCategoria) => void;
}) {
  const { c, countsByCatId, productFamilies, modifierGroups, onEdit, onToggleActive } = args;
  const productCount = countsByCatId.get(c.id) ?? 0;
  const familyLabel = resolveCategoryProductFamilyLabel(c, productFamilies);
  const modifierLabels = resolveEffectiveModifierGroupLabels(null, c, modifierGroups);
  const modifiersText = modifierLabels.length > 0 ? modifierLabels.join(", ") : "—";

  return (
    <>
      <HostlyDataCell col="name">
        <div className="hostly-data-table-primary">
          <span className="hostly-data-table-primary__name" title={c.name}>
            {c.name}
          </span>
          <span className="hostly-data-table-primary__meta hostly-data-table-col--tablet-only">
            {familyLabel} · {tipoLabel(c.type)}
          </span>
        </div>
      </HostlyDataCell>
      <HostlyDataCell align="center" col="status">
        <CategoryStatusBadge active={c.isActive} />
      </HostlyDataCell>
      <HostlyDataCell col="family">
        <span className="hostly-data-table-secondary" title={familyLabel}>
          {familyLabel}
        </span>
      </HostlyDataCell>
      <HostlyDataCell align="end" col="products">
        <span className="hostly-data-table-metric">{productCount}</span>
      </HostlyDataCell>
      <HostlyDataCell col="type">
        <span className="hostly-data-table-secondary">{tipoLabel(c.type)}</span>
      </HostlyDataCell>
      <HostlyDataCell col="modifiers">
        <span className="hostly-data-table-secondary" title={modifiersText}>
          {modifiersText}
        </span>
      </HostlyDataCell>
      <HostlyDataCell align="end" col="order">
        <span className="hostly-data-table-metric hostly-data-table-metric--muted">{c.sortOrder}</span>
      </HostlyDataCell>
      <HostlyDataCell align="end" col="actions">
        <ConfigCartaEditToggleActions
          isActive={c.isActive}
          editTitle="Editar categoría"
          toggleTitle={c.isActive ? "Desactivar categoría" : "Activar categoría"}
          onEdit={() => onEdit(c)}
          onToggle={() => onToggleActive(c)}
        />
      </HostlyDataCell>
    </>
  );
}

export function CategoriasCartaDataView({
  items,
  loading,
  countsByCatId,
  productFamilies,
  modifierGroups,
  onEdit,
  onToggleActive,
  onCreateNew,
}: CategoriasCartaDataViewProps) {
  if (loading) {
    return (
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded">
        <div className="hostly-carta-config-list-loading">Cargando categorías…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded">
        <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
          <p className="hostly-carta-config-empty__title">Aún no hay categorías registradas</p>
          <p className="hostly-carta-config-empty__body">
            Crea la primera con el botón superior o importa una carta con IA.
          </p>
          <div className="hostly-carta-config-empty__actions">
            {onCreateNew ? (
              <button type="button" onClick={onCreateNew} className="hostly-button-primary hostly-button-compact">
                Nueva categoría
              </button>
            ) : null}
            <Link href="/dashboard/configuracion/carta/importacion" className="hostly-button-secondary hostly-button-compact">
              IA e importación
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded">
      <HostlyDataTable variant="categorias">
        <HostlyDataTableScroll>
          <HostlyDataTableHead>
            <HostlyDataCell col="name">Nombre</HostlyDataCell>
            <HostlyDataCell align="center" col="status">
              Estado
            </HostlyDataCell>
            <HostlyDataCell col="family">Familia</HostlyDataCell>
            <HostlyDataCell align="end" col="products">
              Productos
            </HostlyDataCell>
            <HostlyDataCell col="type">Tipo</HostlyDataCell>
            <HostlyDataCell col="modifiers">Modificadores</HostlyDataCell>
            <HostlyDataCell align="end" col="order">
              Orden
            </HostlyDataCell>
            <HostlyDataCell align="end" col="actions">
              Acciones
            </HostlyDataCell>
          </HostlyDataTableHead>
          <HostlyDataTableBody>
            {items.map((c) => (
              <HostlyDataRow key={c.id} onClick={() => onEdit(c)}>
                {renderCategoryCells({
                  c,
                  countsByCatId,
                  productFamilies,
                  modifierGroups,
                  onEdit,
                  onToggleActive,
                })}
              </HostlyDataRow>
            ))}
          </HostlyDataTableBody>
        </HostlyDataTableScroll>
      </HostlyDataTable>

      <HostlyMobileList>
        {items.map((c) => {
          const productCount = countsByCatId.get(c.id) ?? 0;
          const familyLabel = resolveCategoryProductFamilyLabel(c, productFamilies);
          const modifierLabels = resolveEffectiveModifierGroupLabels(null, c, modifierGroups);

          return (
            <HostlyMobileListItem
              key={c.id}
              onClick={() => onEdit(c)}
              title={<span className="hostly-mobile-list-item__name">{c.name}</span>}
              meta={
                <>
                  <span>{familyLabel}</span>
                  <span className="hostly-mobile-list-item__dot" aria-hidden>
                    ·
                  </span>
                  <span>{tipoLabel(c.type)}</span>
                  {modifierLabels.length > 0 ? (
                    <>
                      <span className="hostly-mobile-list-item__dot" aria-hidden>
                        ·
                      </span>
                      <span>{modifierLabels.length} mod.</span>
                    </>
                  ) : null}
                </>
              }
              aside={
                <>
                  <CategoryStatusBadge active={c.isActive} />
                  <span className="hostly-data-table-metric">{productCount} prod.</span>
                </>
              }
              actions={
                <ConfigCartaEditToggleActions
                  isActive={c.isActive}
                  editTitle="Editar categoría"
                  toggleTitle={c.isActive ? "Desactivar categoría" : "Activar categoría"}
                  onEdit={() => onEdit(c)}
                  onToggle={() => onToggleActive(c)}
                />
              }
            />
          );
        })}
      </HostlyMobileList>
    </div>
  );
}
