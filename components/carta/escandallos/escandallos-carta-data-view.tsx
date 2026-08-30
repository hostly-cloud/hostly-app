"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  HostlyDataCell,
  HostlyDataRow,
  HostlyDataTable,
  HostlyDataTableBody,
  HostlyDataTableHead,
  HostlyDataTableScroll,
  HostlyMobileList,
  HostlyMobileListItem,
  HostlyRowActionButton,
  HostlyRowActions,
  HostlyStatusBadge,
} from "@/components/ui/hostly/data-table";
import { ConfigBtnPrimary } from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import {
  EscandalloMarginStatusBadge,
  EscandalloRecipeStateBadge,
  HostlyCostBadge,
  HostlyMarginBadge,
} from "./escandallo-badges";
import {
  escandalloRecipeQuickActionLabel,
  type EscandalloVisualState,
} from "./escandallo-row-visual-state";
import type { ProductProfitabilityResult } from "./product-profitability-utils";
import {
  formatMoney2,
  getDraftForItem,
  resolveEscandalloRowEconomics,
  type EscandalloDraftById,
  type EscandalloListRow,
  type EscandalloListStats,
} from "./escandallo-display-utils";

const inputClass = "hostly-input hostly-carta-config-field-input hostly-recipe-editor__money-input";

function formatCostCellValue(costeN: number | null): string {
  if (costeN == null) return "—";
  return formatMoney2(costeN);
}

function formatSaleCellValue(ventaN: number | null): string {
  if (ventaN == null) return "—";
  return formatMoney2(ventaN);
}

function IconRecipe() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  );
}

function openRecipeFromRow(
  router: ReturnType<typeof useRouter>,
  recipeHref: (id: string | number) => string,
  productId: string | number,
) {
  router.push(recipeHref(productId));
}

export type EscandallosCartaDataViewProps = {
  items: EscandalloListRow[];
  drafts: EscandalloDraftById;
  savingById: Record<string, boolean>;
  listStats: EscandalloListStats;
  loading?: boolean;
  recipeHref: (id: string | number) => string;
  recipeLinkTitle?: string;
  onUpdateDraft: (id: string | number, field: "coste_total" | "precio_venta", value: string) => void;
  onSave: (id: string | number) => void;
  /** Oculta la acción Guardar cuando coste/venta proceden del catálogo canónico. */
  showSaveAction?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyCtaHref?: string;
  emptyCtaLabel?: string;
  noResultsLabel?: string;
  showFilteredEmpty?: boolean;
  /** Mapa id → estado visual de escandallo (Config → Carta → Escandallos). */
  visualStateById?: Readonly<Record<string, EscandalloVisualState>>;
  /** Catálogo central: coste/margen desde computeProductProfitability (solo lectura en tabla). */
  profitabilityById?: Readonly<Record<string, ProductProfitabilityResult>>;
};

export function EscandallosCartaDataView({
  items,
  drafts,
  savingById,
  listStats,
  loading = false,
  recipeHref,
  recipeLinkTitle = "Editar escandallo en la ficha del producto",
  onUpdateDraft,
  onSave,
  showSaveAction = true,
  emptyTitle = "Sin escandallos vinculados",
  emptyBody = "Vincula productos activos con escandallo desde Productos o crea recetas en el catálogo.",
  emptyCtaHref = "/dashboard/configuracion/carta/productos",
  emptyCtaLabel = "Ir a Productos",
  noResultsLabel = "Ningún resultado con estos filtros.",
  showFilteredEmpty = false,
  visualStateById,
  profitabilityById,
}: EscandallosCartaDataViewProps) {
  const router = useRouter();
  const showEscandalloState = visualStateById != null;

  if (loading) {
    return (
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--escandallos">
        <div className="hostly-carta-config-list-loading">Cargando escandallos…</div>
      </div>
    );
  }

  if (items.length === 0 && !showFilteredEmpty) {
    return (
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--escandallos">
        <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
          <p className="hostly-carta-config-empty__title">{emptyTitle}</p>
          <p className="hostly-carta-config-empty__body">{emptyBody}</p>
          {emptyCtaHref ? (
            <div className="hostly-carta-config-empty__actions">
              <Link href={emptyCtaHref} className="hostly-button-primary hostly-button-compact">
                {emptyCtaLabel}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (items.length === 0 && showFilteredEmpty) {
    return (
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--escandallos">
        <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
          <p className="hostly-carta-config-empty__title">{noResultsLabel}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--escandallos">
      <HostlyDataTable variant="escandallos">
        <HostlyDataTableScroll>
          <HostlyDataTableHead>
            <HostlyDataCell col="name">Producto</HostlyDataCell>
            <HostlyDataCell align="end" col="cost">
              Coste
            </HostlyDataCell>
            <HostlyDataCell align="end" col="sale">
              Venta
            </HostlyDataCell>
            <HostlyDataCell align="end" col="margin">
              Margen
            </HostlyDataCell>
            {showEscandalloState ? (
              <HostlyDataCell align="center" col="escandallo">
                Escandallo
              </HostlyDataCell>
            ) : null}
            <HostlyDataCell align="center" col="status">
              Nivel de margen
            </HostlyDataCell>
            <HostlyDataCell align="end" col="actions">
              Acciones
            </HostlyDataCell>
          </HostlyDataTableHead>
          <HostlyDataTableBody>
            {items.map((item) => {
              const key = String(item.id);
              const draft = getDraftForItem(item, drafts);
              const escandalloState = visualStateById?.[key];
              const { costeN, ventaN, marginPct, marginTier, useComputedEconomics } =
                resolveEscandalloRowEconomics(
                  key,
                  draft,
                  item,
                  escandalloState,
                  profitabilityById,
                );
              const busy = Boolean(savingById[key]);
              const isBest = listStats.bestKey === key;
              const isWorst = listStats.worstKey === key;

              return (
                <HostlyDataRow key={key}>
                  <HostlyDataCell col="name">
                    <div className="hostly-data-table-primary">
                      <Link
                        href={recipeHref(item.id)}
                        className="hostly-data-table-primary__name hostly-data-table-primary__link"
                        title={recipeLinkTitle}
                      >
                        {item.nombre_plato?.trim() || "—"}
                      </Link>
                      <span className="hostly-data-table-primary__meta hostly-data-table-col--tablet-only">
                        {formatMoney2(costeN)} · {formatMoney2(ventaN)}
                      </span>
                      {(isBest || isWorst) && (
                        <span className="hostly-recipe-editor__row-flags">
                          {isBest ? (
                            <HostlyStatusBadge tone="success">Mejor margen</HostlyStatusBadge>
                          ) : null}
                          {isWorst ? (
                            <HostlyStatusBadge tone="danger">Margen bajo</HostlyStatusBadge>
                          ) : null}
                        </span>
                      )}
                    </div>
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="cost">
                    {useComputedEconomics ? (
                      <HostlyCostBadge value={formatCostCellValue(costeN)} />
                    ) : (
                      <label className="hostly-recipe-editor__inline-money">
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          className={inputClass}
                          value={draft.coste_total}
                          onChange={(e) => onUpdateDraft(item.id, "coste_total", e.target.value)}
                          aria-label={`Coste ${item.nombre_plato ?? ""}`}
                        />
                        <span className="hostly-recipe-editor__money-suffix">€</span>
                      </label>
                    )}
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="sale">
                    {useComputedEconomics ? (
                      <span className="hostly-recipe-editor__readonly-money">
                        {formatSaleCellValue(ventaN)}
                      </span>
                    ) : (
                      <label className="hostly-recipe-editor__inline-money">
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          className={inputClass}
                          value={draft.precio_venta}
                          onChange={(e) => onUpdateDraft(item.id, "precio_venta", e.target.value)}
                          aria-label={`Venta ${item.nombre_plato ?? ""}`}
                        />
                        <span className="hostly-recipe-editor__money-suffix">€</span>
                      </label>
                    )}
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="margin">
                    <HostlyMarginBadge
                      marginPct={marginPct}
                      coste={costeN}
                      venta={ventaN}
                      emphasize
                    />
                  </HostlyDataCell>
                  {showEscandalloState ? (
                    <HostlyDataCell align="center" col="escandallo">
                      {escandalloState ? (
                        <EscandalloRecipeStateBadge state={escandalloState} />
                      ) : (
                        <HostlyStatusBadge tone="muted">—</HostlyStatusBadge>
                      )}
                    </HostlyDataCell>
                  ) : null}
                  <HostlyDataCell align="center" col="status">
                    <EscandalloMarginStatusBadge tier={marginTier} />
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="actions">
                    <HostlyRowActions>
                      {escandalloState ? (
                        <HostlyRowActionButton
                          variant="text"
                          title={recipeLinkTitle}
                          aria-label={escandalloRecipeQuickActionLabel(escandalloState)}
                          onClick={(e) => {
                            e.stopPropagation();
                            openRecipeFromRow(router, recipeHref, item.id);
                          }}
                        >
                          {escandalloRecipeQuickActionLabel(escandalloState)}
                        </HostlyRowActionButton>
                      ) : (
                        <HostlyRowActionButton
                          variant="icon"
                          title={recipeLinkTitle}
                          aria-label={recipeLinkTitle}
                          onClick={(e) => {
                            e.stopPropagation();
                            openRecipeFromRow(router, recipeHref, item.id);
                          }}
                        >
                          <IconRecipe />
                        </HostlyRowActionButton>
                      )}
                      {showSaveAction ? (
                        <HostlyRowActionButton
                          variant="text"
                          tone="success"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!busy) onSave(item.id);
                          }}
                        >
                          {busy ? "…" : "Guardar"}
                        </HostlyRowActionButton>
                      ) : null}
                    </HostlyRowActions>
                  </HostlyDataCell>
                </HostlyDataRow>
              );
            })}
          </HostlyDataTableBody>
        </HostlyDataTableScroll>
      </HostlyDataTable>

      <HostlyMobileList>
        {items.map((item) => {
          const key = String(item.id);
          const draft = getDraftForItem(item, drafts);
          const escandalloState = visualStateById?.[key];
          const { costeN, ventaN, marginPct, marginTier, useComputedEconomics } =
            resolveEscandalloRowEconomics(
              key,
              draft,
              item,
              escandalloState,
              profitabilityById,
            );
          const busy = Boolean(savingById[key]);

          return (
            <HostlyMobileListItem
              key={key}
              title={
                <Link href={recipeHref(item.id)} className="hostly-mobile-list-item__name hostly-data-table-primary__link">
                  {item.nombre_plato?.trim() || "—"}
                </Link>
              }
              meta={
                <>
                  {escandalloState ? <EscandalloRecipeStateBadge state={escandalloState} /> : null}
                  {escandalloState ? (
                    <span className="hostly-mobile-list-item__dot" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <HostlyCostBadge value={formatCostCellValue(costeN)} />
                  <span className="hostly-mobile-list-item__dot" aria-hidden>
                    ·
                  </span>
                  <span>{formatSaleCellValue(ventaN)}</span>
                </>
              }
              aside={
                <>
                  <HostlyMarginBadge marginPct={marginPct} coste={costeN} venta={ventaN} emphasize />
                  <EscandalloMarginStatusBadge tier={marginTier} />
                </>
              }
              actions={
                <div className="hostly-recipe-editor__mobile-actions">
                  {showSaveAction ? (
                    <ConfigBtnPrimary type="button" disabled={busy} onClick={() => onSave(item.id)}>
                      {busy ? "Guardando…" : "Guardar"}
                    </ConfigBtnPrimary>
                  ) : null}
                  <button
                    type="button"
                    className="hostly-button-secondary hostly-button-compact"
                    title={recipeLinkTitle}
                    aria-label={
                      escandalloState
                        ? escandalloRecipeQuickActionLabel(escandalloState)
                        : recipeLinkTitle
                    }
                    onClick={() => openRecipeFromRow(router, recipeHref, item.id)}
                  >
                    {escandalloState ? escandalloRecipeQuickActionLabel(escandalloState) : "Receta"}
                  </button>
                </div>
              }
            >
              {useComputedEconomics ? (
                <div className="hostly-recipe-editor__mobile-fields hostly-recipe-editor__mobile-fields--readonly">
                  <div className="hostly-carta-config-form-field">
                    <span className="hostly-carta-config-form-label">Coste</span>
                    <span className="hostly-recipe-editor__readonly-money">
                      {formatCostCellValue(costeN)}
                    </span>
                  </div>
                  <div className="hostly-carta-config-form-field">
                    <span className="hostly-carta-config-form-label">Venta</span>
                    <span className="hostly-recipe-editor__readonly-money">
                      {formatSaleCellValue(ventaN)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="hostly-recipe-editor__mobile-fields">
                  <label className="hostly-carta-config-form-field">
                    <span className="hostly-carta-config-form-label">Coste</span>
                    <div className="hostly-recipe-editor__inline-money">
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        className={inputClass}
                        value={draft.coste_total}
                        onChange={(e) => onUpdateDraft(item.id, "coste_total", e.target.value)}
                      />
                      <span className="hostly-recipe-editor__money-suffix">€</span>
                    </div>
                  </label>
                  <label className="hostly-carta-config-form-field">
                    <span className="hostly-carta-config-form-label">Venta</span>
                    <div className="hostly-recipe-editor__inline-money">
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        className={inputClass}
                        value={draft.precio_venta}
                        onChange={(e) => onUpdateDraft(item.id, "precio_venta", e.target.value)}
                      />
                      <span className="hostly-recipe-editor__money-suffix">€</span>
                    </div>
                  </label>
                </div>
              )}
            </HostlyMobileListItem>
          );
        })}
      </HostlyMobileList>
    </div>
  );
}
