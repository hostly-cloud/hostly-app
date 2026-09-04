import { auth } from "@/lib/firebase/client";
import type {
  ClockAction,
  EmployeeOperationsSnapshot,
} from "@/lib/employees/types";

async function authHeaders(json = true): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("UNAUTHORIZED");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

async function operation(body: Record<string, unknown>) {
  const response = await fetch("/api/employees/operations", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; id?: string }
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "EMPLOYEE_OPERATION_FAILED");
  }
  return payload;
}

export async function requestEmployeeOperations(from: string, to: string) {
  const response = await fetch(
    `/api/employees/operations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { headers: await authHeaders(false), cache: "no-store" },
  );
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; snapshot?: EmployeeOperationsSnapshot }
    | null;
  if (!response.ok || !payload?.ok || !payload.snapshot) {
    throw new Error(payload?.error || "EMPLOYEE_OPERATIONS_LIST_FAILED");
  }
  return payload.snapshot;
}

export function requestEmployeeProfileSave(input: Record<string, unknown>) {
  return operation({ action: "profile.save", ...input });
}

export function requestEmployeeShiftSave(input: Record<string, unknown>) {
  return operation({ action: "shift.save", ...input });
}

export function requestEmployeeShiftDelete(id: string) {
  return operation({ action: "shift.delete", id });
}

export function requestEmployeeClock(input: {
  employeeId: string;
  clockAction: ClockAction;
}) {
  return operation({ action: "time.clock", ...input });
}

export function requestEmployeeTimeCorrection(input: Record<string, unknown>) {
  return operation({ action: "time.correct", ...input });
}

export async function requestEmployeeDocumentUpload(input: {
  employeeId: string;
  category: string;
  file: File;
}) {
  const form = new FormData();
  form.set("employeeId", input.employeeId);
  form.set("category", input.category);
  form.set("file", input.file);
  const response = await fetch("/api/employees/documents", {
    method: "POST",
    headers: await authHeaders(false),
    body: form,
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; id?: string }
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "EMPLOYEE_DOCUMENT_UPLOAD_FAILED");
  }
  return payload.id || "";
}

export async function requestEmployeeDocumentStatus(id: string, status: string) {
  const response = await fetch("/api/employees/documents", {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify({ id, status }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "EMPLOYEE_DOCUMENT_UPDATE_FAILED");
  }
}

export async function requestEmployeeDocumentDelete(id: string) {
  const response = await fetch(`/api/employees/documents?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await authHeaders(false),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "EMPLOYEE_DOCUMENT_DELETE_FAILED");
  }
}

export async function downloadEmployeeDocument(id: string, fileName: string) {
  const response = await fetch(`/api/employees/documents?id=${encodeURIComponent(id)}`, {
    headers: await authHeaders(false),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "EMPLOYEE_DOCUMENT_DOWNLOAD_FAILED");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "documento";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
