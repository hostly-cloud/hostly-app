"use client";

import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type { HostlySubscriptionAccess } from "@/lib/subscription/hostly-subscription-access";

type SubscriptionAccessResponse =
  | { ok: true; access: HostlySubscriptionAccess }
  | { ok: false; error?: string; details?: string };

export class HostlySubscriptionAccessApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "HostlySubscriptionAccessApiError";
    this.code = code;
    this.status = status;
  }
}

export async function fetchHostlySubscriptionAccess(): Promise<HostlySubscriptionAccess> {
  const response = await authenticatedApiFetch("/api/subscription/access");
  let body: SubscriptionAccessResponse | null = null;
  try {
    body = (await response.json()) as SubscriptionAccessResponse;
  } catch {
    body = null;
  }

  if (!response.ok || !body?.ok) {
    const code = body && !body.ok ? body.error?.trim() : "";
    const details = body && !body.ok ? body.details?.trim() : "";
    throw new HostlySubscriptionAccessApiError(
      code || "SUBSCRIPTION_ACCESS_FAILED",
      details || code || "No se pudo consultar el plan de Hostly",
      response.status,
    );
  }

  return body.access;
}
