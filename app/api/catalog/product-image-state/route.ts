import { handleProductImageStateRequestSafe } from "@/lib/server/product-images/handle-product-image-state-request";

export async function GET(req: Request) {
  return handleProductImageStateRequestSafe(req);
}
