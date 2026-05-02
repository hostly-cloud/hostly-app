export { AnalysisSectionEnd } from "./AnalysisSectionEnd"
export { AnalysisHeader } from "./AnalysisHeader"
export { AnalysisStatLine } from "./AnalysisStatLine"
export { AnalysisBlock } from "./AnalysisBlock"

export { AnalysisTabContent } from "./AnalysisTabContent"
export type { AnalysisTabContentProps } from "./AnalysisTabContent"

export { ComensalesAnalyticsSection } from "./ComensalesAnalyticsSection"
export type { ComensalesAnalyticsSectionProps } from "./ComensalesAnalyticsSection"

export { ComensalesHeaderBlock } from "./ComensalesHeaderBlock"
export type { ComensalesHeaderBlockProps } from "./ComensalesHeaderBlock"

export { ComensalesContentBlock } from "./ComensalesContentBlock"

export { ComensalesKpiBlock } from "./ComensalesKpiBlock"

export { ComensalesChartsBlock } from "./ComensalesChartsBlock"

export { ZonasAnalyticsSection } from "./ZonasAnalyticsSection"
export type { ZonasAnalyticsSectionProps } from "./ZonasAnalyticsSection"

export { ZonasActions } from "./ZonasActions"

export { ZonasKpiBlock } from "./ZonasKpiBlock"

export { ZonasTable } from "./ZonasTable"

export { ZonasViewState } from "./ZonasViewState"

export { VentasAnalyticsSection } from "./VentasAnalyticsSection"
export type { VentasAnalyticsSectionProps } from "./VentasAnalyticsSection"

export { VentasKpiBlock } from "./VentasKpiBlock"
export type { VentasKpiBlockProps } from "./VentasKpiBlock"

export { VentasChartsBlock } from "./VentasChartsBlock"
export type { VentasChartsBlockProps } from "./VentasChartsBlock"

export { VentasTableBlock } from "./VentasTableBlock"
export type { VentasTableBlockProps } from "./VentasTableBlock"

export { VentasInsightsBlock } from "./VentasInsightsBlock"
export type { VentasInsightsBlockProps } from "./VentasInsightsBlock"

export { VentasActions } from "./VentasActions"
export type { VentasActionsData, VentasActionsProps } from "./VentasActions"

export { VentasHeaderBlock } from "./VentasHeaderBlock"
export type { VentasHeaderBlockProps } from "./VentasHeaderBlock"

export { VentasContentBlock } from "./VentasContentBlock"
export type { VentasContentBlockProps } from "./VentasContentBlock"

export { VentasEmptyState } from "./VentasEmptyState"
export type { VentasEmptyStateProps } from "./VentasEmptyState"

export { VentasViewState } from "./VentasViewState"
export type { VentasViewStateProps } from "./VentasViewState"

export { HorasAnalyticsSection } from "./HorasAnalyticsSection"
export type { HorasAnalyticsSectionProps } from "./HorasAnalyticsSection"

export { ProductosAnalyticsSection } from "./ProductosAnalyticsSection"
export type { ProductosAnalyticsSectionProps } from "./ProductosAnalyticsSection"

export { useZonasData } from "./hooks/useZonasData"

export { useZonasAnalytics } from "./hooks/useZonasAnalytics"
export type { ColumnasZonasPrefs, ZonaExportMetric } from "./hooks/useZonasAnalytics"

export { useZonasSelectors } from "./hooks/useZonasSelectors"
export type {
  UseZonasSelectorsResult,
  ZonasSelectorsExportsData,
  ZonasSelectorsInsights,
  ZonasSelectorsKpis,
  ZonasSelectorsTable,
} from "./hooks/useZonasSelectors"

export { useComensalesSelectors } from "./hooks/useComensalesSelectors"
export type {
  ComensalesDailyAttendanceRow,
  ComensalesDailyReservationsRow,
  ComensalesKpisSnapshot,
  ComensalesSelectorsCharts,
  ComensalesSelectorsKpis,
  ComensalesSelectorsViewState,
  UseComensalesSelectorsInput,
  UseComensalesSelectorsResult,
} from "./hooks/useComensalesSelectors"

export { useVentasSelectors } from "./hooks/useVentasSelectors"
export type {
  UseVentasSelectorsInput,
  UseVentasSelectorsResult,
  VentasAnalyticsSnapshot,
  VentasChartsPoint,
  VentasSelectorsActionsData,
  VentasSelectorsCharts,
  VentasSelectorsInsights,
  VentasSelectorsKpis,
  VentasSelectorsTable,
  VentasTableRow,
} from "./hooks/useVentasSelectors"

export { useVentasData } from "./hooks/useVentasData"
export type {
  UseVentasDataInput,
  UseVentasDataResult,
  VentasOrderInput,
} from "./hooks/useVentasData"

export { buildVentasOrdersAdapter } from "./utils/ventas"
export type { VentasSourceLike } from "./utils/ventas"

export { buildVentasSectionProps } from "./builders/buildVentasSectionProps"
export type { BuildVentasSectionPropsInput } from "./builders/buildVentasSectionProps"

export { buildComensalesSectionProps } from "./builders/buildComensalesSectionProps"
export type { BuildComensalesSectionPropsInput } from "./builders/buildComensalesSectionProps"

export { buildAnalysisTabContentProps } from "./builders/buildAnalysisTabContentProps"
export type { BuildAnalysisTabContentPropsInput } from "./builders/buildAnalysisTabContentProps"

export * from "./types"
