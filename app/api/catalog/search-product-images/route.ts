import { handleSearchCatalogProductImagesRequestSafe } from "@/lib/server/product-images/handle-search-catalog-product-images-request";

export async function POST(req: Request) {
  return handleSearchCatalogProductImagesRequestSafe(req);
}
