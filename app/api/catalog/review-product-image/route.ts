import { handleReviewProductImageRequestSafe } from "@/lib/server/product-images/handle-review-product-image-request";

export async function POST(req: Request) {
  return handleReviewProductImageRequestSafe(req);
}
