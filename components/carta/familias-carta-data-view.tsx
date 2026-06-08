"use client";

import Link from "next/link";
import { useMemo } from "react";
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
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";

function FamilyStatusBadge({ active }: { active: boolean }) {
  return (
    <HostlyStatusBadge tone={active ? "success" : "muted"} aria-label={active ? "Activa" : "Inactiva"}>
      {active ? "Activa" : "Inactiva"}
    </HostlyStatusBadge>
  );
}

function sortCategories(categorias: readonly CartaCategoria[]): CartaCategoria[] {
  return [...categorias].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  );
}

function linkedCategoriesForFamily(
  familiaId: string,
  byFamiliaId: ReadonlyMap<string, CartaCategoria[]>,
): CartaCategoria[] {
  return byFamiliaId.get(familiaId) ?? [];
}

function formatLinkedCategoriesSummary(categorias: readonly CartaCategoria[]): {
  countLabel: string;
  namesLabel: string;
  fullTitle: string;
} {
  const count = categorias.length;
  if (count === 0) {
    return {
      countLabel: "Sin categorías",
      namesLabel: "—",
      fullTitle: "Sin categorías vinculadas",
    };
  }

  const countLabel = count === 1 ? "1 categoría" : `${count} categorías`;
  const names = categorias.map((c) => c.name);
  const fullTitle = names.join(", ");
  const namesLabel =
    count <= 3 ? fullTitle : `${names.slice(0, 3).join(", ")} +${count - 3}`;

  return { countLabel, namesLabel, fullTitle };
}

function LinkedCategoriesCell({ categorias }: { categorias: readonly CartaCategoria[] }) {
  const summary = formatLinkedCategoriesSummary(categorias);

  return (
    <div className="hostly-data-table-primary min-w-0">
      <span className="hostly-data-table-metric hostly-data-table-metric--muted">{summary.countLabel}</span>
      <span
        className="hostly-data-table-primary__meta hostly-data-table-secondary truncate"
        title={summary.fullTitle}
      >
        {summary.namesLabel}
      </span>
    </div>
  );
}

export type FamiliasCartaDataViewProps = {
  items: CartaFamilia[];
  categorias: CartaCategoria[];
  loading: boolean;
  onEdit: (item: CartaFamilia) => void;
  onToggleActive: (item: CartaFamilia) => void;
  onCreateNew?: () => void;
};

export function FamiliasCartaDataView({
  items,
  categorias,
  loading,
  onEdit,
  onToggleActive,
  onCreateNew,
}: FamiliasCartaDataViewProps) {
  const categoriesByFamiliaId = useMemo(() => {
    const map = new Map<string, CartaCategoria[]>();
    for (const c of categorias) {
      const familiaId = c.cartaFamiliaId?.trim();
      if (!familiaId) continue;
      const bucket = map.get(familiaId);
      if (bucket) bucket.push(c);
      else map.set(familiaId, [c]);
    }
    for (const [id, list] of map) {
      map.set(id, sortCategories(list));
    }
    return map;
  }, [categorias]);

  if (loading) {
    return (
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--familias">
        <div className="hostly-carta-config-list-loading">Cargando…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--familias">
        <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
          <span className="hostly-carta-config-empty__icon" aria-hidden>
            FM
          </span>
          <p className="hostly-carta-config-empty__title">Sin familias de menú todavía</p>
          <p className="hostly-carta-config-empty__body">
            Crea bloques como Platos o Bebidas y asígnalos a tus categorías desde Categorías.
          </p>
          <div className="hostly-carta-config-empty__actions">
            {onCreateNew ? (
              <button type="button" onClick={onCreateNew} className="hostly-button-primary hostly-button-compact">
                Nueva familia
              </button>
            ) : null}
            <Link href="/dashboard/configuracion/carta/categorias" className="hostly-button-secondary hostly-button-compact">
              Categorías
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--familias">
      <HostlyDataTable variant="familias">
        <HostlyDataTableScroll>
          <HostlyDataTableHead>
            <HostlyDataCell col="name">Nombre</HostlyDataCell>
            <HostlyDataCell align="center" col="status">
              Estado
            </HostlyDataCell>
            <HostlyDataCell col="categories">Categorías</HostlyDataCell>
            <HostlyDataCell align="end" col="order">
              Orden
            </HostlyDataCell>
            <HostlyDataCell align="end" col="actions">
              Acciones
            </HostlyDataCell>
          </HostlyDataTableHead>
          <HostlyDataTableBody>
            {items.map((f) => {
              const linked = linkedCategoriesForFamily(f.id, categoriesByFamiliaId);

              return (
              <HostlyDataRow key={f.id} onClick={() => onEdit(f)}>
                <HostlyDataCell col="name">
                  <div className="hostly-data-table-primary">
                    <span className="hostly-data-table-primary__name" title={f.name}>
                      {f.name}
                    </span>
                    <span className="hostly-data-table-primary__meta hostly-data-table-col--tablet-only">
                      Orden {f.sortOrder}
                    </span>
                  </div>
                </HostlyDataCell>
                <HostlyDataCell align="center" col="status">
                  <FamilyStatusBadge active={f.isActive} />
                </HostlyDataCell>
                <HostlyDataCell col="categories">
                  <LinkedCategoriesCell categorias={linked} />
                </HostlyDataCell>
                <HostlyDataCell align="end" col="order">
                  <span className="hostly-data-table-metric hostly-data-table-metric--muted">{f.sortOrder}</span>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="actions">
                  <ConfigCartaEditToggleActions
                    isActive={f.isActive}
                    editTitle="Editar familia de menú"
                    toggleTitle={f.isActive ? "Desactivar familia" : "Activar familia"}
                    onEdit={() => onEdit(f)}
                    onToggle={() => onToggleActive(f)}
                  />
                </HostlyDataCell>
              </HostlyDataRow>
              );
            })}
          </HostlyDataTableBody>
        </HostlyDataTableScroll>
      </HostlyDataTable>

      <HostlyMobileList>
        {items.map((f) => {
          const linked = linkedCategoriesForFamily(f.id, categoriesByFamiliaId);
          const summary = formatLinkedCategoriesSummary(linked);

          return (
          <HostlyMobileListItem
            key={f.id}
            onClick={() => onEdit(f)}
            title={<span className="hostly-mobile-list-item__name">{f.name}</span>}
            meta={
              <>
                <span>{summary.countLabel}</span>
                {linked.length > 0 ? (
                  <>
                    <span className="hostly-mobile-list-item__dot" aria-hidden>
                      ·
                    </span>
                    <span title={summary.fullTitle}>{summary.namesLabel}</span>
                  </>
                ) : null}
                <span className="hostly-mobile-list-item__dot" aria-hidden>
                  ·
                </span>
                <span>Orden {f.sortOrder}</span>
              </>
            }
            aside={<FamilyStatusBadge active={f.isActive} />}
            actions={
              <ConfigCartaEditToggleActions
                isActive={f.isActive}
                editTitle="Editar familia de menú"
                toggleTitle={f.isActive ? "Desactivar familia" : "Activar familia"}
                onEdit={() => onEdit(f)}
                onToggle={() => onToggleActive(f)}
              />
            }
          />
          );
        })}
      </HostlyMobileList>
    </div>
  );
}
