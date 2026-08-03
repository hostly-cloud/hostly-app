import { handleUpdateMenuImportReviewRequest } from "@/lib/server/menu-imports/handle-update-menu-import-review-request";

export async function POST(req: Request) {
  return handleUpdateMenuImportReviewRequest(req);
}
