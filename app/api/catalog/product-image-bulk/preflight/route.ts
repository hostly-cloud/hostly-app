import {
  handleCatalogImageBulkPreflightRequest,
  handleCatalogImageBulkRequestSafe,
} from "@/lib/server/product-images/handle-catalog-image-bulk-request";

export async function POST(req: Request) {
  return handleCatalogImageBulkRequestSafe("preflight", () =>
    handleCatalogImageBulkPreflightRequest(req),
  );
}
