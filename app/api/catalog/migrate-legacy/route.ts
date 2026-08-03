import { handleMigrateLegacyRequestSafe } from "@/lib/server/catalog/handle-migrate-legacy-request";

export async function POST(req: Request) {
  return handleMigrateLegacyRequestSafe(req);
}
