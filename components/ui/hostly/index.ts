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
export { HostlyButton } from "./HostlyButton";
export type { HostlyButtonProps, HostlyButtonSize, HostlyButtonVariant } from "./HostlyButton";
export type { HostlyPlanIdentityProps } from "./HostlyPlanIdentityBase";
export { HostlyCard } from "./HostlyCard";
export type { HostlyCardProps, HostlyCardFamily } from "./HostlyCard";
export { HostlyField, HostlyInput, HostlySelect, HostlyTextarea, HostlyCheckbox } from "./HostlyField";
export { HostlyFormToggle } from "./HostlyFormToggle";
export type { HostlyFormToggleProps } from "./HostlyFormToggle";
export { HostlyAlert } from "./HostlyAlert";
export type { HostlyAlertProps, HostlyAlertTone } from "./HostlyAlert";
export { HostlyLoadingState, HostlyPermissionState } from "./HostlyState";
export { HostlyDrawer } from "./HostlyDrawer";
export type { HostlyDrawerProps } from "./HostlyDrawer";
export { HostlySection } from "./HostlySection";
export type { HostlySectionProps, HostlySectionStack } from "./HostlySection";
export { HostlySectionHeader } from "./HostlySectionHeader";
export type { HostlySectionHeaderProps } from "./HostlySectionHeader";
export { HostlyKpiCard } from "./HostlyKpiCard";
export type { HostlyKpiCardProps } from "./HostlyKpiCard";
export { HostlyFilterCard } from "./HostlyFilterCard";
export type {
  HostlyFilterCardProps,
  HostlyFilterCardTone,
} from "./HostlyFilterCard";
export { HostlyOperationalEmptyState } from "./HostlyOperationalEmptyState";
export type {
  HostlyOperationalEmptyAction,
  HostlyOperationalEmptyStateProps,
} from "./HostlyOperationalEmptyState";
export {
  HostlySegmentedButton,
  HostlySegmentedControl,
  hostlySegmentPillClassName,
  hostlySegmentTabClassName,
} from "./HostlySegmentedControl";
export type {
  HostlySegmentedButtonProps,
  HostlySegmentedControlProps,
} from "./HostlySegmentedControl";
export {
  HostlyDataTable,
  HostlyDataTableScroll,
  HostlyDataTableHead,
  HostlyDataTableBody,
  HostlyDataRow,
  HostlyDataCell,
  HostlyDataGroupBar,
  HostlyMobileList,
  HostlyMobileListGroup,
  HostlyMobileListItem,
  HostlyRowActions,
  HostlyRowActionButton,
  HostlyStatusBadge,
  HostlyTableToolbar,
  HostlyTableBulkBar,
} from "./data-table";
export type {
  HostlyDataTableProps,
  HostlyDataTableVariant,
  HostlyDataRowProps,
  HostlyDataCellProps,
  HostlyMobileListItemProps,
  HostlyRowActionsProps,
  HostlyRowActionButtonProps,
  HostlyRowActionTone,
  HostlyStatusBadgeProps,
  HostlyStatusBadgeTone,
  HostlyTableToolbarProps,
} from "./data-table";
