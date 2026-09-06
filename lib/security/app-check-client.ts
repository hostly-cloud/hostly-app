export const HOSTLY_APP_CHECK_HEADER = "X-Firebase-AppCheck";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type TokenGetter = () => Promise<string | null>;

function resolveRequestUrl(
  input: RequestInfo | URL,
  origin: string,
): URL | null {
  try {
    const raw = input instanceof Request ? input.url : String(input);
    return new URL(raw, origin);
  } catch {
    return null;
  }
}

function effectiveHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
): Headers {
  if (init?.headers !== undefined) return new Headers(init.headers);
  if (input instanceof Request) return new Headers(input.headers);
  return new Headers();
}

export function isHostlyBrowserApiRequest(
  input: RequestInfo | URL,
  origin: string,
): boolean {
  const url = resolveRequestUrl(input, origin);
  if (!url) return false;
  return url.origin === origin && url.pathname.startsWith("/api/");
}

/**
 * Adds Firebase App Check only to Hostly-owned same-origin API requests.
 * External providers (Stripe, Firebase, Google, etc.) never receive the token.
 */
export function createHostlyAppCheckFetch(
  originalFetch: FetchLike,
  getToken: TokenGetter,
  origin: string,
): FetchLike {
  return async (input, init) => {
    if (!isHostlyBrowserApiRequest(input, origin)) {
      return originalFetch(input, init);
    }

    const currentHeaders = effectiveHeaders(input, init);
    if (currentHeaders.has(HOSTLY_APP_CHECK_HEADER)) {
      return originalFetch(input, init);
    }

    const token = await getToken();
    if (!token) {
      return originalFetch(input, init);
    }

    currentHeaders.set(HOSTLY_APP_CHECK_HEADER, token);

    if (input instanceof Request) {
      const requestWithInit = new Request(input, init);
      const protectedRequest = new Request(requestWithInit, {
        headers: currentHeaders,
      });
      return originalFetch(protectedRequest);
    }

    return originalFetch(input, {
      ...init,
      headers: currentHeaders,
    });
  };
}
