/**
 * Componentes declarativos del design Hostly dashboard (desktop + táctiles).
 *
 * Preferir `globals.css`:
 * - Variables `--hostly-*` agrupadas al inicio de `:root` (ver tabla de índice allí).
 * - Clases `.hostly-surface-flat|soft|ice|elevated` generadas desde `HostlySurface`.
 */

export { hostlyCx } from "./hostly-cx";
export type { HostlySurfaceVariant } from "./hostly-surface-types";
export { HostlySurface } from "./HostlySurface";
export type { HostlySurfaceProps } from "./HostlySurface";
export { HostlySection } from "./HostlySection";
export type { HostlySectionProps, HostlySectionStack } from "./HostlySection";
export { HostlySectionHeader } from "./HostlySectionHeader";
export type { HostlySectionHeaderProps } from "./HostlySectionHeader";
export { HostlyKpiCard } from "./HostlyKpiCard";
export type { HostlyKpiCardProps } from "./HostlyKpiCard";
