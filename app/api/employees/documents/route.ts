import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { getHostlyStorageBucket } from "@/lib/firebase/admin";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function safeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120) || "documento";
}

function category(value: FormDataEntryValue | null) {
  return value === "contract" || value === "payroll" || value === "certificate"
    ? value
    : "other";
}

async function requireManager(req: Request) {
  const auth = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(auth)) return auth;
  if (!auth.canManageUsers) return jsonError(403, "USERS_MANAGE_REQUIRED");
  return auth;
}

export async function POST(req: Request) {
  try {
    const auth = await requireManager(req);
    if (isAuthErrorResponse(auth)) return auth;
    const form = await req.formData();
    const employeeId = String(form.get("employeeId") || "").trim();
    const file = form.get("file");
    if (!employeeId) return jsonError(400, "EMPLOYEE_ID_REQUIRED");
    if (!(file instanceof File)) return jsonError(400, "DOCUMENT_FILE_REQUIRED");
    if (!file.size || file.size > MAX_FILE_SIZE) return jsonError(400, "DOCUMENT_SIZE_INVALID");
    if (!ALLOWED_TYPES.has(file.type)) return jsonError(400, "DOCUMENT_TYPE_INVALID");

    const employeeRef = auth.db
      .collection("restaurants")
      .doc(auth.restaurantId)
      .collection("employees")
      .doc(employeeId);
    const employee = await employeeRef.get();
    if (!employee.exists) return jsonError(404, "EMPLOYEE_NOT_FOUND");

    const bucket = getHostlyStorageBucket();
    if (!bucket) return jsonError(503, "STORAGE_NOT_CONFIGURED");
    const id = randomUUID();
    const originalName = safeName(file.name);
    const storagePath = `restaurants/${auth.restaurantId}/employee-documents/${employeeId}/${id}/${originalName}`;
    const storageFile = bucket.file(storagePath);
    const bytes = Buffer.from(await file.arrayBuffer());
    await storageFile.save(bytes, {
      resumable: false,
      metadata: {
        contentType: file.type,
        cacheControl: "private, max-age=0, no-store",
        metadata: {
          restaurantId: auth.restaurantId,
          employeeId,
          uploadedBy: auth.uid,
        },
      },
    });

    const documentRef = auth.db
      .collection("restaurants")
      .doc(auth.restaurantId)
      .collection("employeeDocuments")
      .doc(id);
    try {
      await documentRef.set({
        employeeId,
        name: file.name.slice(0, 200),
        category: category(form.get("category")),
        contentType: file.type,
        size: file.size,
        status: "delivered",
        storagePath,
        uploadedBy: auth.uid,
        uploadedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      await storageFile.delete({ ignoreNotFound: true }).catch(() => undefined);
      throw error;
    }
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[employees/documents:post]", error);
    return jsonError(500, "EMPLOYEE_DOCUMENT_UPLOAD_FAILED");
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireManager(req);
    if (isAuthErrorResponse(auth)) return auth;
    const id = new URL(req.url).searchParams.get("id")?.trim() || "";
    if (!id) return jsonError(400, "DOCUMENT_ID_REQUIRED");
    const ref = auth.db
      .collection("restaurants")
      .doc(auth.restaurantId)
      .collection("employeeDocuments")
      .doc(id);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(404, "DOCUMENT_NOT_FOUND");
    const data = snap.data() || {};
    const storagePath = typeof data.storagePath === "string" ? data.storagePath : "";
    if (!storagePath) return jsonError(404, "DOCUMENT_FILE_NOT_FOUND");
    const bucket = getHostlyStorageBucket();
    if (!bucket) return jsonError(503, "STORAGE_NOT_CONFIGURED");
    const [buffer] = await bucket.file(storagePath).download();
    const name = typeof data.name === "string" ? data.name : "documento";
    const contentType = typeof data.contentType === "string" ? data.contentType : "application/octet-stream";
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[employees/documents:get]", error);
    return jsonError(500, "EMPLOYEE_DOCUMENT_DOWNLOAD_FAILED");
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireManager(req);
    if (isAuthErrorResponse(auth)) return auth;
    const body = (await req.json().catch(() => null)) as { id?: unknown; status?: unknown } | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const status = body?.status;
    if (!id) return jsonError(400, "DOCUMENT_ID_REQUIRED");
    if (status !== "pending" && status !== "delivered" && status !== "read") {
      return jsonError(400, "DOCUMENT_STATUS_INVALID");
    }
    const ref = auth.db
      .collection("restaurants")
      .doc(auth.restaurantId)
      .collection("employeeDocuments")
      .doc(id);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(404, "DOCUMENT_NOT_FOUND");
    await ref.update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: auth.uid,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[employees/documents:patch]", error);
    return jsonError(500, "EMPLOYEE_DOCUMENT_UPDATE_FAILED");
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireManager(req);
    if (isAuthErrorResponse(auth)) return auth;
    const id = new URL(req.url).searchParams.get("id")?.trim() || "";
    if (!id) return jsonError(400, "DOCUMENT_ID_REQUIRED");
    const ref = auth.db
      .collection("restaurants")
      .doc(auth.restaurantId)
      .collection("employeeDocuments")
      .doc(id);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(404, "DOCUMENT_NOT_FOUND");
    const data = snap.data() || {};
    const storagePath = typeof data.storagePath === "string" ? data.storagePath : "";
    if (storagePath) {
      const bucket = getHostlyStorageBucket();
      if (bucket) await bucket.file(storagePath).delete({ ignoreNotFound: true });
    }
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[employees/documents:delete]", error);
    return jsonError(500, "EMPLOYEE_DOCUMENT_DELETE_FAILED");
  }
}
