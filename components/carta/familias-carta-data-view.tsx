"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ConfigCartaEditToggleActions } from "@/components/carta/config-carta-row-actions";
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
    );
  }

  return (
    <div className="hostly-carta-familia-list-wrap">
      <ul className="hostly-carta-familia-list" role="list">
        {items.map((f) => {
          const summary = formatCartaFamiliaListSummary(f);
          const catCount = linkedCategoryCount(f.id, categoriesByFamiliaId);

          return (
            <li key={f.id}>
              <div className="hostly-carta-familia-card">
                <button
                  type="button"
                  className="hostly-carta-familia-card__main"
                  onClick={() => onEdit(f)}
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
