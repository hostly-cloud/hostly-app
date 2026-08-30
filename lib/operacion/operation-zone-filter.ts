export function operationZoneFilterId(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
  return normalized ? `zone-name:${normalized}` : "";
}
