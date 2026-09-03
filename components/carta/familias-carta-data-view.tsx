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
import { HostlyButton } from "@/components/ui/hostly";
import { HostlyStatusBadge } from "@/components/ui/hostly/data-table";
import { formatCartaFamiliaListSummary } from "@/lib/carta-categorias/familia-operational-config";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";

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
      <div className="hostly-carta-familia-list-wrap">
        <div className="hostly-carta-config-list-loading">Cargando…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
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
              <HostlyButton variant="primary" size="compact" onClick={onCreateNew}>
                Nueva familia de menú
              </HostlyButton>
            ) : null}
            <Link href="/dashboard/configuracion/carta/categorias" className="hostly-button-secondary hostly-button-compact">
              Categorías de carta
            </Link>
          </div>
        </div>
      </div>
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
      <div className="hostly-carta-familia-list-wrap">
        {listContent(items, false, false)}
      </div>
    );
  }

  return (
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
  );
}
