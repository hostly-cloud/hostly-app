export type HostlyHealthSnapshot = {
  status: "ok";
  service: "hostly-app";
  environment: string;
  release: {
    commit: string | null;
    deploymentId: string | null;
    region: string | null;
  };
  runtime: {
    node: string;
    uptimeSeconds: number;
  };
  timestamp: string;
};

type HealthEnvironment = Record<string, string | undefined>;

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveEnvironment(env: HealthEnvironment): string {
  return (
    clean(env.VERCEL_ENV) ??
    clean(env.NODE_ENV) ??
    "unknown"
  );
}

export function buildHostlyHealthSnapshot(params?: {
  env?: HealthEnvironment;
  now?: Date;
  uptimeSeconds?: number;
  nodeVersion?: string;
}): HostlyHealthSnapshot {
  const env = params?.env ?? process.env;
  const now = params?.now ?? new Date();
  const uptimeSeconds =
    params?.uptimeSeconds ?? Math.max(0, Math.floor(process.uptime()));
  const nodeVersion = params?.nodeVersion ?? process.version;

  return {
    status: "ok",
    service: "hostly-app",
    environment: resolveEnvironment(env),
    release: {
      commit: clean(env.VERCEL_GIT_COMMIT_SHA),
      deploymentId: clean(env.VERCEL_DEPLOYMENT_ID),
      region: clean(env.VERCEL_REGION),
    },
    runtime: {
      node: nodeVersion,
      uptimeSeconds,
    },
    timestamp: now.toISOString(),
  };
}
