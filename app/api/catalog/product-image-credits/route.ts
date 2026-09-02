import {
  handleCatalogImageCreditReconciliationRequest,
  handleCatalogImageCreditRequestSafe,
  handleCatalogImageCreditSummaryRequest,
} from "@/lib/server/product-images/handle-catalog-image-credit-request";

export async function GET(req: Request) {
  return handleCatalogImageCreditRequestSafe("summary", () =>
    handleCatalogImageCreditSummaryRequest(req),
  );
}

export async function POST(req: Request) {
  return handleCatalogImageCreditRequestSafe("reconcile", () =>
    handleCatalogImageCreditReconciliationRequest(req),
  );
}
