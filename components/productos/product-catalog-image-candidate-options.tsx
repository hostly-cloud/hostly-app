import Image from "next/image";
import type { CatalogImageBulkCatalogCandidate } from "@/lib/productos/catalog-image-bulk-contract";
import styles from "./product-catalog-image-bulk-panel.module.css";

export function ProductCatalogImageCandidateOptions({
  productId,
  productName,
  candidates,
  selectedReference,
  onSelect,
}: {
  productId: string;
  productName: string;
  candidates: CatalogImageBulkCatalogCandidate[];
  selectedReference: string | undefined;
  onSelect: (externalReference: string) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <fieldset className={styles.candidateList}>
      <legend className={styles.candidateLegend}>
        Elige la coincidencia correcta
      </legend>
      {candidates.map((candidate) => {
        const selected = selectedReference === candidate.externalReference;
        const detail = [candidate.brand, candidate.quantity]
          .filter(Boolean)
          .join(" · ");
        return (
          <div
            key={candidate.externalReference}
            className={`${styles.candidateOption}${
              selected ? ` ${styles.candidateOptionSelected}` : ""
            }`}
          >
            <label className={styles.candidateChoice}>
              <input
                type="radio"
                name={`catalog-candidate-${productId}`}
                value={candidate.externalReference}
                checked={selected}
                onChange={() => onSelect(candidate.externalReference)}
                aria-label={`Usar ${candidate.productName} para ${productName}`}
              />
              <Image
                className={styles.candidateImage}
                src={candidate.thumbnailUrl}
                alt=""
                width={54}
                height={54}
                unoptimized
              />
              <span className={styles.candidateContent}>
                <strong>{candidate.productName}</strong>
                <span>{detail || candidate.externalReference}</span>
                <span>
                  {candidate.matchLevel === "strong"
                    ? "Coincidencia sólida"
                    : "Revisar coincidencia"}
                  {` · ${Math.round(candidate.confidence * 100)} %`}
                </span>
                {candidate.warnings.length > 0 ? (
                  <span className={styles.candidateWarning}>
                    {candidate.warnings.join(" ")}
                  </span>
                ) : null}
              </span>
            </label>
            <a
              className={styles.candidateSource}
              href={candidate.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Ver ficha original
            </a>
          </div>
        );
      })}
      <p className={styles.candidateAttribution}>
        {candidates[0]?.attribution} · {candidates[0]?.license}
      </p>
    </fieldset>
  );
}
