export const HOSTLY_PUBLIC_SITE_URL = "https://hostlyapp.app";

export function getHostlyPublicSiteUrl(
  configuredUrl = process.env.NEXT_PUBLIC_SITE_URL,
): URL {
  const candidate = configuredUrl?.trim();

  if (candidate) {
    try {
      return new URL(candidate);
    } catch {
      // Fall back to the canonical production origin when the build-time value is invalid.
    }
  }

  return new URL(HOSTLY_PUBLIC_SITE_URL);
}
