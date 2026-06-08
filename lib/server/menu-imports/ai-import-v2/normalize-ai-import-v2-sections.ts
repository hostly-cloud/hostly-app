import { canonicalizeMenuImportSectionHeader } from "../normalize-menu-import-section";
import type { AiImportV2Extraction } from "./types";

/**
 * Aplica sectionName canónico Hostly a la extracción V2 antes de validar/comparar.
 */
export function normalizeAiImportV2SectionNames(extraction: AiImportV2Extraction): AiImportV2Extraction {
  return {
    sections: extraction.sections.map((section) => {
      const canonical = canonicalizeMenuImportSectionHeader(section.name);
      return {
        ...section,
        name: canonical.sectionName,
      };
    }),
  };
}
