import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantContext,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  hasCatalogImageCapability,
  type CatalogImageAccess,
} from "@/lib/productos/catalog-image-plan";
import {
  analyzeCatalogImageBulk,
  controlCatalogImageBulkJob,
  createCatalogImageBulkJob,
  processNextCatalogImageBulkItem,
  readCatalogImageBulkJob,
  readLatestCatalogImageBulkJob,
} from "@/lib/server/product-images/catalog-image-bulk";
import { resolveCatalogImageAccess } from "@/lib/server/product-images/resolve-catalog-image-access";

type Authenticate = (
  req: Request,
) => Promise<AuthenticatedRestaurantContext | NextResponse>;

type ResolveAccess = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
}) => Promise<CatalogImageAccess>;

type AuthorizedBulkContext = {
  auth: AuthenticatedRestaurantContext;
  access: CatalogImageAccess;
};

export type CatalogImageBulkRequestDependencies = {
  authenticate?: Authenticate;
  resolveAccess?: ResolveAccess;
  analyze?: typeof analyzeCatalogImageBulk;
  createJob?: typeof createCatalogImageBulkJob;
  readJob?: typeof readCatalogImageBulkJob;
  readLatestJob?: typeof readLatestCatalogImageBulkJob;
  processNext?: typeof processNextCatalogImageBulkItem;
  controlJob?: typeof controlCatalogImageBulkJob;
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false as const, error, details: details ?? null },
    { status },
  );
}

async function authorizeBulk(
  req: Request,
  dependencies?: CatalogImageBulkRequestDependencies,
): Promise<AuthorizedBulkContext | NextResponse> {
  const authenticate =
    dependencies?.authenticate ??
    ((request: Request) => requireAuthenticatedRestaurant(request));
  const auth = await authenticate(req);
  if (isAuthErrorResponse(auth)) return auth;
  if (!serverRoleHasCapability(auth.role, "settings.manage")) {
    return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
  }
  const resolveAccess = dependencies?.resolveAccess ?? resolveCatalogImageAccess;
  const access = await resolveAccess({
    db: auth.db,
    restaurantId: auth.restaurantId,
  });
  if (!hasCatalogImageCapability(access, "catalog.image.ai.bulk")) {
    return jsonError(
      403,
      "CATALOG_IMAGE_AI_BULK_PLAN_REQUIRED",
      "Completar imágenes del catálogo está disponible en el plan Ultra",
    );
  }
  return { auth, access };
}

function rejectsClientRestaurantId(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "restaurantId" in value &&
      (value as Record<string, unknown>).restaurantId != null,
  );
}

export async function handleCatalogImageBulkPreflightRequest(
  req: Request,
  dependencies?: CatalogImageBulkRequestDependencies,
) {
  const context = await authorizeBulk(req, dependencies);
  if (isAuthErrorResponse(context)) return context;
  const body = await req.json().catch(() => ({}));
  if (rejectsClientRestaurantId(body)) {
    return jsonError(
      400,
      "RESTAURANT_ID_NOT_ALLOWED",
      "restaurantId se resuelve en servidor",
    );
  }
  const analyze = dependencies?.analyze ?? analyzeCatalogImageBulk;
  const result = await analyze({
    db: context.auth.db,
    restaurantId: context.auth.restaurantId,
    access: context.access,
  });
  return NextResponse.json({
    ok: true as const,
    preflight: {
      summary: result.summary,
      estimate: result.estimate,
      access: result.access,
    },
  });
}

export async function handleCreateCatalogImageBulkJobRequest(
  req: Request,
  dependencies?: CatalogImageBulkRequestDependencies,
) {
  const context = await authorizeBulk(req, dependencies);
  if (isAuthErrorResponse(context)) return context;
  const body = (await req.json().catch(() => null)) as {
    idempotencyKey?: unknown;
    confirmBulkGeneration?: unknown;
    restaurantId?: unknown;
  } | null;
  if (!body) return jsonError(400, "INVALID_JSON");
  if (rejectsClientRestaurantId(body)) {
    return jsonError(
      400,
      "RESTAURANT_ID_NOT_ALLOWED",
      "restaurantId se resuelve en servidor",
    );
  }
  if (body.confirmBulkGeneration !== true) {
    return jsonError(
      400,
      "BULK_GENERATION_CONFIRMATION_REQUIRED",
      "Confirma el resumen antes de iniciar operaciones que pueden consumir créditos",
    );
  }
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!idempotencyKey) {
    return jsonError(400, "MISSING_BULK_IDEMPOTENCY_KEY");
  }
  const createJob = dependencies?.createJob ?? createCatalogImageBulkJob;
  const job = await createJob({
    db: context.auth.db,
    restaurantId: context.auth.restaurantId,
    userId: context.auth.uid,
    idempotencyKey,
    access: context.access,
  });
  return NextResponse.json({ ok: true as const, job, access: context.access });
}

export async function handleLatestCatalogImageBulkJobRequest(
  req: Request,
  dependencies?: CatalogImageBulkRequestDependencies,
) {
  const context = await authorizeBulk(req, dependencies);
  if (isAuthErrorResponse(context)) return context;
  const readLatest = dependencies?.readLatestJob ?? readLatestCatalogImageBulkJob;
  const result = await readLatest({
    db: context.auth.db,
    restaurantId: context.auth.restaurantId,
  });
  return NextResponse.json({
    ok: true as const,
    job: result?.job ?? null,
    items: result?.items ?? [],
    access: context.access,
  });
}

export async function handleCatalogImageBulkJobRequest(
  req: Request,
  jobId: string,
  dependencies?: CatalogImageBulkRequestDependencies,
) {
  const context = await authorizeBulk(req, dependencies);
  if (isAuthErrorResponse(context)) return context;
  const readJob = dependencies?.readJob ?? readCatalogImageBulkJob;
  const result = await readJob({
    db: context.auth.db,
    restaurantId: context.auth.restaurantId,
    jobId,
  });
  return NextResponse.json({
    ok: true as const,
    job: result.job,
    items: result.items,
    access: context.access,
  });
}

export async function handleProcessCatalogImageBulkJobRequest(
  req: Request,
  jobId: string,
  dependencies?: CatalogImageBulkRequestDependencies,
) {
  const context = await authorizeBulk(req, dependencies);
  if (isAuthErrorResponse(context)) return context;
  const body = await req.json().catch(() => ({}));
  if (rejectsClientRestaurantId(body)) {
    return jsonError(
      400,
      "RESTAURANT_ID_NOT_ALLOWED",
      "restaurantId se resuelve en servidor",
    );
  }
  const processNext = dependencies?.processNext ?? processNextCatalogImageBulkItem;
  const result = await processNext({
    db: context.auth.db,
    restaurantId: context.auth.restaurantId,
    jobId,
    userId: context.auth.uid,
    access: context.access,
  });
  return NextResponse.json({ ok: true as const, ...result });
}

export async function handleControlCatalogImageBulkJobRequest(
  req: Request,
  jobId: string,
  dependencies?: CatalogImageBulkRequestDependencies,
) {
  const context = await authorizeBulk(req, dependencies);
  if (isAuthErrorResponse(context)) return context;
  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    restaurantId?: unknown;
  } | null;
  if (!body) return jsonError(400, "INVALID_JSON");
  if (rejectsClientRestaurantId(body)) {
    return jsonError(
      400,
      "RESTAURANT_ID_NOT_ALLOWED",
      "restaurantId se resuelve en servidor",
    );
  }
  const action = body.action;
  if (
    action !== "pause" &&
    action !== "resume" &&
    action !== "retry_failed" &&
    action !== "cancel"
  ) {
    return jsonError(400, "INVALID_BULK_JOB_ACTION");
  }
  const controlJob = dependencies?.controlJob ?? controlCatalogImageBulkJob;
  const job = await controlJob({
    db: context.auth.db,
    restaurantId: context.auth.restaurantId,
    jobId,
    action,
  });
  return NextResponse.json({ ok: true as const, job });
}

export async function handleCatalogImageBulkRequestSafe(
  label: string,
  handler: () => Promise<NextResponse>,
) {
  try {
    return await handler();
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "CATALOG_IMAGE_BULK_FAILED";
    const httpStatus =
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      typeof error.httpStatus === "number"
        ? error.httpStatus
        : 500;
    const message =
      error instanceof Error ? error.message : "CATALOG_IMAGE_BULK_FAILED";
    if (httpStatus >= 500) {
      console.error(`[api/catalog/product-image-bulk/${label}]`, {
        code,
        message,
      });
    }
    return jsonError(httpStatus, code, message);
  }
}
