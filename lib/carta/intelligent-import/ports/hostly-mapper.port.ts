import type { HostlyMenuImportCandidates } from "../types/hostly-product.types";
import type { ValidatedMenuImport } from "../types/normalized.types";
import type { MenuImportCartaKind } from "../types/source.types";

export type HostlyMenuMapParams = {
  validated: ValidatedMenuImport;
  cartaKind: MenuImportCartaKind;
  restaurantId: string;
};

/** Etapa map_to_hostly: transformación a candidatos producto Hostly. */
export interface HostlyMenuMapperPort {
  readonly mapperId: string;
  map(params: HostlyMenuMapParams): Promise<HostlyMenuImportCandidates>;
}
