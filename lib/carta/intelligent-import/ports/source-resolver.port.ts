import type {
  MenuImportJobInput,
  ResolvedMenuImportSource,
} from "../types/source.types";

/** Etapa resolve_source: unifica QR→URL, archivo Storage, texto pegado. */
export interface MenuImportSourceResolverPort {
  readonly resolverId: string;
  resolve(input: MenuImportJobInput): Promise<ResolvedMenuImportSource>;
}
