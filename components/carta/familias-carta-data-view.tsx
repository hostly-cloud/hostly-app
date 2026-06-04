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
import type { CartaFamilia } from "@/lib/carta-categorias/types";

function FamilyStatusBadge({ active }: { active: boolean }) {
  return (
    <HostlyStatusBadge tone={active ? "success" : "muted"} aria-label={active ? "Activa" : "Inactiva"}>
      {active ? "Activa" : "Inactiva"}
    </HostlyStatusBadge>
  );
}

export type FamiliasCartaDataViewProps = {
  items: CartaFamilia[];
  loading: boolean;
};

export function FamiliasCartaDataView({ items, loading }: FamiliasCartaDataViewProps) {
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
            Importa carta con IA o crea secciones en Categorías; aquí aparecerán los bloques del menú (Platos, Bebidas…).
          </p>
          <div className="hostly-carta-config-empty__actions">
            <Link href="/dashboard/configuracion/carta/importacion" className="hostly-button-primary hostly-button-compact">
              IA e importación
            </Link>
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
            <HostlyDataCell align="end" col="order">
              Orden
            </HostlyDataCell>
          </HostlyDataTableHead>
          <HostlyDataTableBody>
            {items.map((f) => (
              <HostlyDataRow key={f.id}>
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
                <HostlyDataCell align="end" col="order">
                  <span className="hostly-data-table-metric hostly-data-table-metric--muted">{f.sortOrder}</span>
                </HostlyDataCell>
              </HostlyDataRow>
            ))}
          </HostlyDataTableBody>
        </HostlyDataTableScroll>
      </HostlyDataTable>

      <HostlyMobileList>
        {items.map((f) => (
          <HostlyMobileListItem
            key={f.id}
            title={<span className="hostly-mobile-list-item__name">{f.name}</span>}
            meta={<span>Orden {f.sortOrder}</span>}
            aside={<FamilyStatusBadge active={f.isActive} />}
          />
        ))}
      </HostlyMobileList>
    </div>
  );
}
