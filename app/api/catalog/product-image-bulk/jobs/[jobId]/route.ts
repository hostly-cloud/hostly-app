import {
  handleCatalogImageBulkJobRequest,
  handleCatalogImageBulkRequestSafe,
} from "@/lib/server/product-images/handle-catalog-image-bulk-request";

export async function GET(
  req: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  return handleCatalogImageBulkRequestSafe("jobs/read", () =>
    handleCatalogImageBulkJobRequest(req, jobId),
  );
}
