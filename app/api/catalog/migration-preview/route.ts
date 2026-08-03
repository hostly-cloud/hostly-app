import { handleMigrationPreviewRequestSafe } from "@/lib/server/catalog/handle-migration-preview-request";

export async function POST(req: Request) {
  return handleMigrationPreviewRequestSafe(req);
}
