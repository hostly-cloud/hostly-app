import { handleGenerateImportedProductImageRequestSafe } from "@/lib/server/product-images/handle-generate-imported-product-image-request";

export const maxDuration = 120;

export async function POST(req: Request) {
  return handleGenerateImportedProductImageRequestSafe(req);
}
