export type LegacyRouteSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function buildLegacyRouteDestination(
  pathname: string,
  searchParams: LegacyRouteSearchParams,
  forcedParams?: Record<string, string>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(forcedParams ?? {})) {
    query.set(key, value);
  }
  const suffix = query.toString();
  return `${pathname}${suffix ? `?${suffix}` : ""}`;
}
