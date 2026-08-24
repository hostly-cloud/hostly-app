"use client";

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
import {
  MODIFIER_GROUP_TYPE_LABELS,
  type ModifierGroupDocument,
} from "@/lib/modifiers/modifier-types";

const modifierGroupsMobileStyles = `
@media (max-width: 767px) {
  .hostly-modifier-form-section--create {
    padding: 8px 10px !important;
    border-radius: 10px !important;
    box-shadow: none !important;
  }

  .hostly-modifier-form-section--create .hostly-carta-config-section-title {
    margin: 0 !important;
    font-size: 13px !important;
    line-height: 1.15 !important;
  }

  .hostly-modifier-form-section--create > .hostly-carta-config-form-hint {
    margin: 2px 0 7px !important;
    font-size: 9.5px !important;
    line-height: 1.2 !important;
  }

  .hostly-modifier-form-section--create .hostly-carta-config-drawer__body {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 112px !important;
    align-items: end !important;
    gap: 6px !important;
    padding: 0 !important;
  }

  .hostly-modifier-form-section--create .hostly-carta-config-form-field {
    gap: 3px !important;
  }

  .hostly-modifier-form-section--create .hostly-carta-config-form-label {
    font-size: 9.5px !important;
    line-height: 1.1 !important;
  }

  .hostly-modifier-form-section--create .hostly-carta-config-field-input {
    min-height: 40px !important;
    padding: 7px 9px !important;
    border-radius: 9px !important;
    font-size: 12px !important;
    box-shadow: none !important;
  }

  .hostly-modifier-form-section--create button {
    grid-column: 1 / -1 !important;
    min-height: 40px !important;
    padding: 7px 10px !important;
    border-radius: 9px !important;
    font-size: 10.5px !important;
    line-height: 1.1 !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-mobile-list-shell {
    gap: 5px !important;
    padding: 0 8px 8px !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-mobile-list-item {
    padding: 8px 9px !important;
    border-radius: 10px !important;
    border-color: rgba(148, 163, 184, 0.14) !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-mobile-list-item.is-selected {
    border-color: rgba(49, 95, 125, 0.3) !important;
    background: color-mix(in srgb, var(--hostly-accent-soft) 24%, white) !important;
    box-shadow: inset 3px 0 0 var(--hostly-accent) !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-mobile-list-item__body {
    gap: 7px !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-mobile-list-item__title,
  .hostly-data-table-viewport--modificadores .hostly-mobile-list-item__name {
    font-size: 13px !important;
    font-weight: 760 !important;
    line-height: 1.15 !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-mobile-list-item__meta {
    gap: 3px !important;
    margin-top: 2px !important;
    font-size: 9.5px !important;
    line-height: 1.2 !important;
    color: var(--hostly-ink-muted) !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-mobile-list-item__aside {
    gap: 4px !important;
    align-items: flex-end !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-mobile-list-item__aside .hostly-status-badge {
    min-height: 20px !important;
    padding: 2px 6px !important;
    font-size: 8.5px !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-mobile-list-item__aside .hostly-data-table-metric {
    font-size: 11px !important;
    font-weight: 760 !important;
    color: var(--hostly-ink-strong) !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-mobile-list-item__actions {
    gap: 4px !important;
    margin-top: 5px !important;
    padding-top: 5px !important;
    border-top-color: rgba(148, 163, 184, 0.1) !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-mobile-list-item__actions button {
    min-width: 34px !important;
    min-height: 34px !important;
    padding: 5px 7px !important;
    border-radius: 8px !important;
    box-shadow: none !important;
  }

  .hostly-data-table-viewport--modificadores .hostly-carta-config-empty--compact {
    padding: 14px 12px !important;
  }
}
`;

function formatPriceDelta(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function groupPriceHint(group: ModifierGroupDocument): string {
  const deltas = group.options.map((o) => o.priceDelta).filter((n) => Number.isFinite(n) && n > 0);
  if (deltas.length === 0) return "—";
  return `+${formatPriceDelta(Math.max(...deltas))}`;
}

function GroupStatusBadge({ active }: { active: boolean }) {
  return (
    <HostlyStatusBadge tone={active ? "success" : "muted"} aria-label={active ? "Activo" : "Inactivo"}>
      {active ? "Activo" : "Inactivo"}
    </HostlyStatusBadge>
  );
}

export type ModificadoresCartaDataViewProps = {
  groups: ModifierGroupDocument[];
  loading: boolean;
  ensuringDefaults: boolean;
  expandedGroupId: string | null;
  savingId: string | null;
  onExpand: (groupId: string) => void;
  onToggleActive: (group: ModifierGroupDocument) => void;
};

export function ModificadoresCartaDataView({
  groups,
  loading,
  ensuringDefaults,
  expandedGroupId,
  savingId,
  onExpand,
  onToggleActive,
}: ModificadoresCartaDataViewProps) {
  if (loading || ensuringDefaults) {
    return (
      <>
        <style>{modifierGroupsMobileStyles}</style>
        <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--modificadores">
          <div className="hostly-carta-config-list-loading">Cargando grupos…</div>
        </div>
      </>
    );
  }

  if (groups.length === 0) {
    return (
      <>
        <style>{modifierGroupsMobileStyles}</style>
        <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--modificadores">
          <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
            <p className="hostly-carta-config-empty__title">Sin grupos de modificadores</p>
            <p className="hostly-carta-config-empty__body">
              Crea uno con el formulario superior o espera los predeterminados de bebida al conectar.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{modifierGroupsMobileStyles}</style>
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--modificadores">
        <HostlyDataTable variant="modificadores">
          <HostlyDataTableScroll>
            <HostlyDataTableHead>
              <HostlyDataCell col="name">Grupo</HostlyDataCell>
              <HostlyDataCell col="type">Tipo</HostlyDataCell>
              <HostlyDataCell align="end" col="options">
                Opciones
              </HostlyDataCell>
              <HostlyDataCell align="end" col="price">
                Suplemento
              </HostlyDataCell>
              <HostlyDataCell align="center" col="status">
                Estado
              </HostlyDataCell>
              <HostlyDataCell align="center" col="required">
                Reglas
              </HostlyDataCell>
              <HostlyDataCell align="end" col="actions">
                Acciones
              </HostlyDataCell>
            </HostlyDataTableHead>
            <HostlyDataTableBody>
              {groups.map((group) => {
                const busy = savingId === group.id;
                const selected = expandedGroupId === group.id;
                const optionsCount = group.options.length;
                const activeOptions = group.options.filter((o) => o.active).length;

                return (
                  <HostlyDataRow
                    key={group.id}
                    selected={selected}
                    onClick={() => onExpand(group.id)}
                  >
                    <HostlyDataCell col="name">
                      <div className="hostly-data-table-primary">
                        <span className="hostly-data-table-primary__name" title={group.name}>
                          {group.name}
                        </span>
                        <span className="hostly-data-table-primary__meta hostly-data-table-col--tablet-only">
                          {MODIFIER_GROUP_TYPE_LABELS[group.type]} · {activeOptions}/{optionsCount} opc.
                        </span>
                      </div>
                    </HostlyDataCell>
                    <HostlyDataCell col="type">
                      <span className="hostly-data-table-secondary">{MODIFIER_GROUP_TYPE_LABELS[group.type]}</span>
                    </HostlyDataCell>
                    <HostlyDataCell align="end" col="options">
                      <span className="hostly-data-table-metric">
                        {activeOptions}/{optionsCount}
                      </span>
                    </HostlyDataCell>
                    <HostlyDataCell align="end" col="price">
                      <span className="hostly-data-table-metric">{groupPriceHint(group)}</span>
                    </HostlyDataCell>
                    <HostlyDataCell align="center" col="status">
                      <GroupStatusBadge active={group.active} />
                    </HostlyDataCell>
                    <HostlyDataCell align="center" col="required">
                      {group.required ? (
                        <HostlyStatusBadge tone="warning">Obligatorio</HostlyStatusBadge>
                      ) : (
                        <span className="hostly-data-table-secondary">Opcional</span>
                      )}
                    </HostlyDataCell>
                    <HostlyDataCell align="end" col="actions">
                      <ConfigCartaEditToggleActions
                        isActive={group.active}
                        disabled={busy}
                        editTitle="Editar grupo"
                        toggleTitle={group.active ? "Desactivar grupo" : "Activar grupo"}
                        onEdit={() => onExpand(group.id)}
                        onToggle={() => onToggleActive(group)}
                      />
                    </HostlyDataCell>
                  </HostlyDataRow>
                );
              })}
            </HostlyDataTableBody>
          </HostlyDataTableScroll>
        </HostlyDataTable>

        <HostlyMobileList>
          {groups.map((group) => {
            const busy = savingId === group.id;
            const selected = expandedGroupId === group.id;
            const optionsCount = group.options.length;
            const activeOptions = group.options.filter((o) => o.active).length;

            return (
              <HostlyMobileListItem
                key={group.id}
                selected={selected}
                onClick={() => onExpand(group.id)}
                title={<span className="hostly-mobile-list-item__name">{group.name}</span>}
                meta={
                  <>
                    <span>{MODIFIER_GROUP_TYPE_LABELS[group.type]}</span>
                    <span className="hostly-mobile-list-item__dot" aria-hidden>
                      ·
                    </span>
                    <span>
                      {activeOptions}/{optionsCount} opciones
                    </span>
                    {group.required ? (
                      <>
                        <span className="hostly-mobile-list-item__dot" aria-hidden>
                          ·
                        </span>
                        <span>Obligatorio</span>
                      </>
                    ) : null}
                  </>
                }
                aside={
                  <>
                    <GroupStatusBadge active={group.active} />
                    <span className="hostly-data-table-metric">{groupPriceHint(group)}</span>
                  </>
                }
                actions={
                  <ConfigCartaEditToggleActions
                    isActive={group.active}
                    disabled={busy}
                    editTitle="Editar grupo"
                    toggleTitle={group.active ? "Desactivar grupo" : "Activar grupo"}
                    onEdit={() => onExpand(group.id)}
                    onToggle={() => onToggleActive(group)}
                  />
                }
              />
            );
          })}
        </HostlyMobileList>
      </div>
    </>
  );
}
