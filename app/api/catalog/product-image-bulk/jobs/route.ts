import {
  handleCatalogImageBulkRequestSafe,
  handleCreateCatalogImageBulkJobRequest,
  handleLatestCatalogImageBulkJobRequest,
} from "@/lib/server/product-images/handle-catalog-image-bulk-request";

export async function GET(req: Request) {
  return handleCatalogImageBulkRequestSafe("jobs/latest", () =>
    handleLatestCatalogImageBulkJobRequest(req),
  );
}

export async function POST(req: Request) {
  return handleCatalogImageBulkRequestSafe("jobs/create", () =>
    handleCreateCatalogImageBulkJobRequest(req),
  );
}
