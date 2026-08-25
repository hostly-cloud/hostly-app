import { handleAttachCatalogProductImageRequestSafe } from "@/lib/server/product-images/handle-attach-catalog-product-image-request";

export async function POST(req: Request) {
  return handleAttachCatalogProductImageRequestSafe(req);
}
