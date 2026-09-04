export type HostlyHealthSnapshot = {
  status: "ok";
  service: "hostly-app";
  environment: string;
  release: {
    commit: string | null;
  };
  timestamp: string;
};

type HealthEnvironment = Record<string, string | undefined>;

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveEnvironment(env: HealthEnvironment): string {
  return clean(env.VERCEL_ENV) ?? clean(env.NODE_ENV) ?? "unknown";
}

function shortCommit(value: string | undefined): string | null {
  const commit = clean(value);
  return commit ? commit.slice(0, 12) : null;
}

export function buildHostlyHealthSnapshot(params?: {
  env?: HealthEnvironment;
  now?: Date;
}): HostlyHealthSnapshot {
  const env = params?.env ?? process.env;
  const now = params?.now ?? new Date();

  return {
    status: "ok",
    service: "hostly-app",
    environment: resolveEnvironment(env),
    release: {
      commit: shortCommit(env.VERCEL_GIT_COMMIT_SHA),
    },
    timestamp: now.toISOString(),
  };
}
