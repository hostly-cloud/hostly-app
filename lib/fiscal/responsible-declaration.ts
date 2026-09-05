import type { FiscalResponsibleDeclaration } from "@/lib/fiscal/model";
import { HOSTLY_FISCAL_MODULE_VERSION } from "@/lib/fiscal/version";

function httpsUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function currentResponsibleDeclaration(): FiscalResponsibleDeclaration {
  const declaredFiscalModuleVersion = process.env.HOSTLY_FISCAL_DECLARATION_VERSION?.trim() || "";
  const documentUrl = httpsUrl(process.env.HOSTLY_FISCAL_DECLARATION_URL?.trim() || "");
  const producerPostalAddress = process.env.HOSTLY_FISCAL_PRODUCER_POSTAL_ADDRESS?.trim() || "";
  const signedAtRaw = process.env.HOSTLY_FISCAL_DECLARATION_SIGNED_AT?.trim() || "";
  const signedAt = /^\d{4}-\d{2}-\d{2}$/.test(signedAtRaw) ? signedAtRaw : null;
  const signedPlace = process.env.HOSTLY_FISCAL_DECLARATION_SIGNED_PLACE?.trim() || "";
  const published = declaredFiscalModuleVersion === HOSTLY_FISCAL_MODULE_VERSION
    && Boolean(documentUrl && producerPostalAddress && signedAt && signedPlace);
  return {
    status: published ? "published" : "draft",
    declaredFiscalModuleVersion,
    documentUrl,
    producerPostalAddress,
    signedAt,
    signedPlace,
  };
}

export function isResponsibleDeclarationPublishedForCurrentVersion(
  declaration: FiscalResponsibleDeclaration,
): boolean {
  return declaration.status === "published"
    && declaration.declaredFiscalModuleVersion === HOSTLY_FISCAL_MODULE_VERSION
    && Boolean(declaration.documentUrl);
}
