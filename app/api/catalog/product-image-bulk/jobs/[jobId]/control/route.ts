import {
  handleCatalogImageBulkRequestSafe,
  handleControlCatalogImageBulkJobRequest,
} from "@/lib/server/product-images/handle-catalog-image-bulk-request";

export async function POST(
  req: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  return handleCatalogImageBulkRequestSafe("jobs/control", () =>
    handleControlCatalogImageBulkJobRequest(req, jobId),
  );
}
