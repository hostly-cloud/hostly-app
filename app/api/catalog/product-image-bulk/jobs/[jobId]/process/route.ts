import {
  handleCatalogImageBulkRequestSafe,
  handleProcessCatalogImageBulkJobRequest,
} from "@/lib/server/product-images/handle-catalog-image-bulk-request";

export const maxDuration = 120;

export async function POST(
  req: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  return handleCatalogImageBulkRequestSafe("jobs/process", () =>
    handleProcessCatalogImageBulkJobRequest(req, jobId),
  );
}
