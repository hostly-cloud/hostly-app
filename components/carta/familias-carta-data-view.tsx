"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import { ConfigCartaEditToggleActions } from "@/components/carta/config-carta-row-actions";
import {
  FamiliasCartaDragHandle,
  FamiliasCartaSortableDragHandle,
  FamiliasCartaSortableItem,
  FamiliasCartaSortableRoot,
} from "@/components/carta/familias-carta-sortable";
import { HostlyStatusBadge } from "@/components/ui/hostly/data-table";
import { formatCartaFamiliaListSummary } from "@/lib/carta-categorias/familia-operational-config";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";

const familiasMobileStyles = `
@media (max-width: 767px) {
  .hostly-carta-config-kpi-strip--dense {
    display: grid !important;
    grid-auto-flow: column !important;
    grid-auto-columns: minmax(118px, 1fr) !important;
    gap: 5px !important;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px !important;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .hostly-carta-config-kpi-strip--dense::-webkit-scrollbar {
    display: none;
  }

  .hostly-carta-config-kpi-strip--dense .hostly-carta-config-kpi-pill {
    min-width: 118px !important;
    min-height: 50px !important;
    padding: 7px 8px !important;
    border-radius: 9px !important;
    box-shadow: none !important;
  }

  .hostly-carta-config-kpi-strip--dense .hostly-carta-config-kpi-pill__label {
    font-size: 8.5px !important;
    line-height: 1.15 !important;
  }

  .hostly-carta-config-kpi-strip--dense .hostly-carta-config-kpi-pill__value {
    font-size: 15px !important;
    line-height: 1 !important;
  }

  .hostly-carta-familia-list-wrap {
    padding: 0 !important;
  }

  .hostly-carta-familia-reorder-hint {
    margin: 0 8px 5px !important;
    padding: 6px 8px !important;
    border-radius: 8px !important;
    background: var(--hostly-surface-page-soft) !important;
    color: var(--hostly-ink-muted) !important;
    font-size: 9.5px !important;
    line-height: 1.25 !important;
  }

  .hostly-carta-familia-list {
    gap: 5px !important;
    padding: 0 8px 8px !important;
  }

  .hostly-carta-familia-card {
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 7px !important;
    padding: 8px 9px !important;
    min-height: 62px !important;
    border-radius: 10px !important;
    border-color: rgba(148, 163, 184, 0.14) !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  .hostly-carta-familia-card__handle {
    align-self: center !important;
  }

  .hostly-carta-familia-card__main {
    min-width: 0 !important;
    gap: 2px !important;
    padding: 0 !important;
    text-align: left !important;
  }

  .hostly-carta-familia-card__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px !important;
    font-weight: 760 !important;
    line-height: 1.15 !important;
  }

  .hostly-carta-familia-card__summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 9.5px !important;
    line-height: 1.2 !important;
    color: var(--hostly-ink-muted) !important;
  }

  .hostly-carta-familia-card__description {
    display: -webkit-box !important;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    font-size: 9px !important;
    line-height: 1.2 !important;
    color: var(--hostly-ink-faint) !important;
  }

  .hostly-carta-familia-card__meta {
    font-size: 9px !important;
    line-height: 1.15 !important;
    color: var(--hostly-ink-muted) !important;
  }

  .hostly-carta-familia-card__aside {
    gap: 4px !important;
    align-items: flex-end !important;
  }

  .hostly-carta-familia-card__aside .hostly-status-badge {
    min-height: 20px !important;
    padding: 2px 6px !important;
    font-size: 8.5px !important;
  }

  .hostly-carta-familia-card__aside .hostly-row-actions {
    gap: 3px !important;
  }

  .hostly-carta-familia-card__aside .hostly-row-actions button {
    min-width: 34px !important;
    min-height: 34px !important;
    padding: 5px !important;
    border-radius: 8px !important;
    box-shadow: none !important;
  }

  .hostly-carta-config-drawer.hostly-carta-familia-drawer {
    display: flex !important;
    flex-direction: column !important;
    width: 100vw !important;
    max-width: none !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: hidden !important;
    background: #ffffff !important;
  }

  .hostly-carta-familia-drawer > .hostly-carta-config-drawer__title {
    flex: 0 0 auto;
    margin: 0 !important;
    padding: max(10px, env(safe-area-inset-top)) 10px 8px !important;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12) !important;
    font-size: 17px !important;
    font-weight: 760 !important;
    line-height: 1.15 !important;
    letter-spacing: -0.02em !important;
  }

  .hostly-carta-familia-drawer .hostly-carta-config-drawer__body {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    gap: 8px !important;
    padding: 8px 10px 12px !important;
    overflow-y: auto !important;
    background: var(--hostly-surface-page-soft) !important;
    -webkit-overflow-scrolling: touch;
  }

  .hostly-carta-familia-drawer .hostly-carta-config-form-field,
  .hostly-carta-familia-drawer .hostly-carta-config-form-checkbox,
  .hostly-carta-familia-drawer .hostly-carta-familia-advanced {
    gap: 4px !important;
    padding: 8px 9px !important;
    border: 1px solid rgba(148, 163, 184, 0.14) !important;
    border-radius: 10px !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  .hostly-carta-familia-drawer .hostly-carta-config-form-label {
    font-size: 10.5px !important;
    line-height: 1.15 !important;
  }

  .hostly-carta-familia-drawer .hostly-carta-config-field-input,
  .hostly-carta-familia-drawer input:not([type="checkbox"]),
  .hostly-carta-familia-drawer select,
  .hostly-carta-familia-drawer textarea {
    min-height: 42px !important;
    padding: 8px 10px !important;
    border-radius: 10px !important;
    font-size: 13px !important;
    box-shadow: none !important;
  }

  .hostly-carta-familia-drawer textarea.hostly-carta-familia-description-input {
    min-height: 72px !important;
    resize: vertical !important;
  }

  .hostly-carta-familia-station-picker {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 5px !important;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px !important;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .hostly-carta-familia-station-picker::-webkit-scrollbar {
    display: none;
  }

  .hostly-carta-familia-station-picker__option {
    flex: 0 0 auto !important;
    min-width: 132px !important;
    min-height: 46px !important;
    padding: 6px 8px !important;
    border-radius: 9px !important;
    box-shadow: none !important;
  }

  .hostly-carta-familia-station-picker__label,
  .hostly-carta-familia-station-picker__name {
    font-size: 10.5px !important;
    line-height: 1.1 !important;
  }

  .hostly-carta-familia-station-picker__meta {
    font-size: 8.5px !important;
    line-height: 1.1 !important;
  }

  .hostly-carta-familia-drawer .hostly-carta-config-form-hint {
    margin: 4px 0 0 !important;
    font-size: 9.5px !important;
    line-height: 1.25 !important;
  }

  .hostly-carta-familia-drawer .hostly-carta-config-form-checkbox {
    min-height: 42px !important;
    display: flex !important;
    align-items: center !important;
  }

  .hostly-carta-familia-drawer .hostly-carta-config-form-checkbox input[type="checkbox"] {
    width: 18px !important;
    height: 18px !important;
  }

  .hostly-carta-familia-advanced > summary {
    min-height: 34px !important;
    display: flex !important;
    align-items: center !important;
    cursor: pointer;
  }

  .hostly-carta-familia-advanced[open] {
    display: grid !important;
    gap: 7px !important;
  }

  .hostly-carta-familia-drawer .hostly-carta-config-drawer__footer {
    flex: 0 0 auto !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto auto !important;
    gap: 6px !important;
    padding: 8px 10px max(8px, env(safe-area-inset-bottom)) !important;
    border-top: 1px solid rgba(148, 163, 184, 0.12) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.035) !important;
  }

  .hostly-carta-familia-drawer .hostly-carta-config-drawer__footer > button {
    min-height: 44px !important;
    padding: 7px 10px !important;
    border-radius: 10px !important;
    font-size: 11px !important;
    line-height: 1.1 !important;
  }

  .hostly-carta-familia-drawer .hostly-carta-config-drawer__footer > button:not(:first-child) {
    min-width: 74px;
    background: transparent !important;
    box-shadow: none !important;
  }
}
`;

function FamilyStatusBadge({ active }: { active: boolean }) {
  return (
    <HostlyStatusBadge tone={active ? "success" : "muted"} aria-label={active ? "Activa" : "Inactiva"}>
      {active ? "Activa" : "Inactiva"}
    </HostlyStatusBadge>
  );
}

function linkedCategoryCount(
  familiaId: string,
  byFamiliaId: ReadonlyMap<string, CartaCategoria[]>,
): number {
  return byFamiliaId.get(familiaId)?.length ?? 0;
}

export type FamiliasCartaDataViewProps = {
  items: CartaFamilia[];
  categorias: CartaCategoria[];
  loading: boolean;
  onEdit: (item: CartaFamilia) => void;
  onToggleActive: (item: CartaFamilia) => void;
  onCreateNew?: () => void;
  onReorderFamilias?: (orderedIds: string[]) => void;
  reorderBusyId?: string | null;
};

function renderFamiliaCard(args: {
  f: CartaFamilia;
  categoriesByFamiliaId: Map<string, CartaCategoria[]>;
  onEdit: (item: CartaFamilia) => void;
  onToggleActive: (item: CartaFamilia) => void;
  showDragHandle: boolean;
  isMobile: boolean;
}) {
  const { f, categoriesByFamiliaId, onEdit, onToggleActive, showDragHandle, isMobile } = args;
  const summary = formatCartaFamiliaListSummary(f);
  const catCount = linkedCategoryCount(f.id, categoriesByFamiliaId);

  return (
    <div className="hostly-carta-familia-card">
      {showDragHandle ? (
        <div className="hostly-carta-familia-card__handle">
          <FamiliasCartaSortableDragHandle />
        </div>
      ) : null}
      <button
        type="button"
        className="hostly-carta-familia-card__main"
        onClick={showDragHandle && isMobile ? undefined : () => onEdit(f)}
      >
        <span className="hostly-carta-familia-card__name">{f.name}</span>
        <span className="hostly-carta-familia-card__summary">{summary}</span>
        {f.description?.trim() ? (
          <span className="hostly-carta-familia-card__description">{f.description.trim()}</span>
        ) : null}
        {catCount > 0 ? (
          <span className="hostly-carta-familia-card__meta">
            {catCount === 1
              ? "1 categoría de carta vinculada"
              : `${catCount} categorías de carta vinculadas`}
          </span>
        ) : null}
      </button>
      <div className="hostly-carta-familia-card__aside">
        <FamilyStatusBadge active={f.isActive} />
        <ConfigCartaEditToggleActions
          isActive={f.isActive}
          editTitle="Editar familia de menú"
          toggleTitle={f.isActive ? "Desactivar familia de menú" : "Activar familia de menú"}
          onEdit={() => onEdit(f)}
          onToggle={() => onToggleActive(f)}
        />
      </div>
    </div>
  );
}

export function FamiliasCartaDataView({
  items,
  categorias,
  loading,
  onEdit,
  onToggleActive,
  onCreateNew,
  onReorderFamilias,
  reorderBusyId,
}: FamiliasCartaDataViewProps) {
  const { t } = useI18n();
  const dragHandleLabel = t("cartaCategories.menuFamilyDragHandleAria");
  const sortableEnabled = Boolean(onReorderFamilias);

  const categoriesByFamiliaId = useMemo(() => {
    const map = new Map<string, CartaCategoria[]>();
    for (const c of categorias) {
      const familiaId = c.cartaFamiliaId?.trim();
      if (!familiaId) continue;
      const bucket = map.get(familiaId);
      if (bucket) bucket.push(c);
      else map.set(familiaId, [c]);
    }
    return map;
  }, [categorias]);

  if (loading) {
    return (
      <>
        <style>{familiasMobileStyles}</style>
        <div className="hostly-carta-familia-list-wrap">
          <div className="hostly-carta-config-list-loading">Cargando…</div>
        </div>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <style>{familiasMobileStyles}</style>
        <div className="hostly-carta-familia-list-wrap">
          <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
            <span className="hostly-carta-config-empty__icon" aria-hidden>
              FM
            </span>
            <p className="hostly-carta-config-empty__title">Sin familias de menú todavía</p>
            <p className="hostly-carta-config-empty__body">
              Crea bloques como Pizzas, Entrantes o Refrescos para agrupar categorías de carta y definir
              estación, pase y comportamiento común.
            </p>
            <div className="hostly-carta-config-empty__actions">
              {onCreateNew ? (
                <button type="button" onClick={onCreateNew} className="hostly-button-primary hostly-button-compact">
                  Nueva familia de menú
                </button>
              ) : null}
              <Link href="/dashboard/configuracion/carta/categorias" className="hostly-button-secondary hostly-button-compact">
                Categorías de carta
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const renderDragPreview = (f: CartaFamilia) => (
    <div className="hostly-carta-familia-drag-preview">
      <FamiliasCartaDragHandle disabled label={dragHandleLabel} />
      <span className="hostly-carta-familia-drag-preview__name">{f.name}</span>
    </div>
  );

  const listContent = (listItems: CartaFamilia[], showDragHandle: boolean, isMobile: boolean) => (
    <ul className="hostly-carta-familia-list" role="list">
      {listItems.map((f) => {
        const card = renderFamiliaCard({
          f,
          categoriesByFamiliaId,
          onEdit,
          onToggleActive,
          showDragHandle,
          isMobile,
        });

        if (showDragHandle) {
          return (
            <li key={f.id}>
              <FamiliasCartaSortableItem item={f} isMobile={isMobile} onClick={() => onEdit(f)}>
                {card}
              </FamiliasCartaSortableItem>
            </li>
          );
        }

        return <li key={f.id}>{card}</li>;
      })}
    </ul>
  );

  if (!sortableEnabled) {
    return (
      <>
        <style>{familiasMobileStyles}</style>
        <div className="hostly-carta-familia-list-wrap">
          {listContent(items, false, false)}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{familiasMobileStyles}</style>
      <FamiliasCartaSortableRoot
        items={items}
        disabled={Boolean(reorderBusyId)}
        dragHandleLabel={dragHandleLabel}
        onReorder={onReorderFamilias!}
        renderDragPreview={renderDragPreview}
      >
        {({ localItems, isMobile }) => (
          <div className="hostly-carta-familia-list-wrap">
            <p className="hostly-carta-familia-reorder-hint" role="note">
              {t("cartaCategories.menuFamilyDragReorderHint")}
            </p>
            {listContent(localItems, true, isMobile)}
          </div>
        )}
      </FamiliasCartaSortableRoot>
    </>
  );
}
