import { NextResponse } from "next/server";
import {
  handleListRestaurantUserRosterRequest,
} from "@/lib/server/users/handle-list-restaurant-user-roster-request";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  try {
    return await handleListRestaurantUserRosterRequest(req);
  } catch {
    return jsonError(500, "USER_ROSTER_FAILED");
  }
}
