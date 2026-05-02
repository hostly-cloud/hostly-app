export function formatPercent(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) return "0%"
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatNumber(
  value: number | null | undefined,
  decimals = 1
) {
  if (value === null || value === undefined || isNaN(value)) return "0"
  return value.toFixed(decimals)
}

export function formatDateTime(
  value: number | string | Date | null | undefined
) {
  if (!value) return "-"

  const date = new Date(value)
  if (isNaN(date.getTime())) return "-"

  return date.toLocaleString()
}

export function formatInteger(
  value: number | null | undefined
) {
  if (value === null || value === undefined || isNaN(value)) return "0"
  return Math.round(value).toString()
}

export function formatText(
  value: string | null | undefined,
  fallback = "-"
) {
  if (value === null || value === undefined) return fallback

  const text = value.trim()
  return text ? text : fallback
}

export function formatRatio(
  value: number | null | undefined,
  decimals = 2
) {
  if (value === null || value === undefined || isNaN(value)) return "0"
  return value.toFixed(decimals)
}

export function formatList(
  values: (string | null | undefined)[],
  separator = ", ",
  fallback = "-"
) {
  const filtered = values
    .filter((v) => v !== null && v !== undefined)
    .map((v) => (v as string).trim())
    .filter((v) => v.length > 0)

  if (!filtered.length) return fallback

  return filtered.join(separator)
}

export function hasItems<T>(value: T[] | null | undefined) {
  return Array.isArray(value) && value.length > 0
}

export function safeAverage(
  total: number | null | undefined,
  count: number | null | undefined
) {
  if (
    total === null ||
    total === undefined ||
    isNaN(total) ||
    count === null ||
    count === undefined ||
    isNaN(count) ||
    count === 0
  ) {
    return 0
  }

  return total / count
}

export function safeSum(values: (number | null | undefined)[]) {
  if (!Array.isArray(values)) return 0

  return values.reduce<number>((acc, v) => {
    if (v === null || v === undefined || isNaN(v)) return acc
    return acc + v
  }, 0)
}

export function safeMax(values: (number | null | undefined)[]) {
  if (!Array.isArray(values)) return 0
  const validValues = values.filter(
    (v): v is number => v !== null && v !== undefined && !isNaN(v)
  )
  if (!validValues.length) return 0
  return Math.max(...validValues)
}

export function safeMin(values: (number | null | undefined)[]) {
  if (!Array.isArray(values)) return 0
  const validValues = values.filter(
    (v): v is number => v !== null && v !== undefined && !isNaN(v)
  )
  if (!validValues.length) return 0
  return Math.min(...validValues)
}

export function safePercent(
  part: number | null | undefined,
  total: number | null | undefined
) {
  if (
    part === null ||
    part === undefined ||
    isNaN(part) ||
    total === null ||
    total === undefined ||
    isNaN(total) ||
    total === 0
  ) {
    return 0
  }

  return part / total
}

export function safeDelta(
  current: number | null | undefined,
  previous: number | null | undefined
) {
  if (
    current === null ||
    current === undefined ||
    isNaN(current) ||
    previous === null ||
    previous === undefined ||
    isNaN(previous)
  ) {
    return 0
  }

  return current - previous
}

export function clamp(
  value: number | null | undefined,
  min: number,
  max: number
) {
  if (value === null || value === undefined || isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

export function normalize(
  value: number | null | undefined,
  min: number,
  max: number
) {
  if (
    value === null ||
    value === undefined ||
    isNaN(value) ||
    isNaN(min) ||
    isNaN(max) ||
    max === min
  ) {
    return 0
  }

  return (value - min) / (max - min)
}

export function safeRound(
  value: number | null | undefined,
  decimals = 0
) {
  if (value === null || value === undefined || isNaN(value)) return 0
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export function formatCurrency(
  value: number | null | undefined,
  currency = "EUR"
) {
  if (value === null || value === undefined || isNaN(value)) return "0"

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format(value)
}

export function truncateText(
  value: string | null | undefined,
  maxLength = 20
) {
  if (!value) return ""

  const text = value.trim()
  if (text.length <= maxLength) return text

  return text.slice(0, maxLength) + "..."
}

export function capitalize(
  value: string | null | undefined
) {
  if (!value) return ""
  const text = value.trim()
  if (!text.length) return ""
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function pluralize(
  value: number | null | undefined,
  singular: string,
  plural: string
) {
  if (value === null || value === undefined || isNaN(value)) {
    return plural
  }

  return value === 1 ? singular : plural
}

export function formatCompactNumber(
  value: number | null | undefined
) {
  if (value === null || value === undefined || isNaN(value)) return "0"
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    return (value / 1_000_000).toFixed(1) + "M"
  }
  if (abs >= 1_000) {
    return (value / 1_000).toFixed(1) + "K"
  }
  return Math.round(value).toString()
}

export function toBoolean(value: unknown) {
  return value === true
}

export function withDefaultNumber(
  value: number | null | undefined,
  fallback = 0
) {
  if (value === null || value === undefined || isNaN(value)) {
    return fallback
  }

  return value
}

export function withDefaultText(
  value: string | null | undefined,
  fallback = "-"
) {
  if (value === null || value === undefined) {
    return fallback
  }

  const text = value.trim()
  return text.length > 0 ? text : fallback
}

export function isEmpty(value: unknown) {
  if (value === null || value === undefined) return true

  if (typeof value === "string") {
    return value.trim().length === 0
  }

  return false
}

export function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value)
}

export function isValidString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value)
}

export function toArray<T = unknown>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : []
}

export function firstItem<T = unknown>(
  value: T[] | null | undefined
): T | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  return value[0]
}

export function lastItem<T = unknown>(
  value: T[] | null | undefined
): T | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  return value[value.length - 1]
}

export function getItem<T = unknown>(
  value: T[] | null | undefined,
  index: number
): T | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    index < 0 ||
    index >= value.length
  ) {
    return undefined
  }
  return value[index]
}

export function unique<T = unknown>(values: T[] | null | undefined): T[] {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(values))
}

export function safeSort<T = unknown>(
  values: T[] | null | undefined,
  compareFn?: (a: T, b: T) => number
): T[] {
  if (!Array.isArray(values)) return []

  const copy = [...values]
  return compareFn ? copy.sort(compareFn) : copy.sort()
}

export function groupBy<T, K extends string | number>(
  values: T[] | null | undefined,
  getKey: (item: T) => K
): Record<K, T[]> {
  if (!Array.isArray(values)) return {} as Record<K, T[]>
  return values.reduce((acc, item) => {
    const key = getKey(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<K, T[]>)
}

export function safeMap<T, R>(
  values: T[] | null | undefined,
  mapFn: (item: T, index: number) => R
): R[] {
  if (!Array.isArray(values)) return []
  return values.map(mapFn)
}

export function safeFilter<T>(
  values: T[] | null | undefined,
  predicate: (item: T, index: number) => boolean
): T[] {
  if (!Array.isArray(values)) return []
  return values.filter(predicate)
}

export function safeReduce<T, R>(
  values: T[] | null | undefined,
  reducer: (acc: R, item: T, index: number) => R,
  initialValue: R
): R {
  if (!Array.isArray(values)) return initialValue
  return values.reduce(reducer, initialValue)
}

export function safeSome<T>(
  values: T[] | null | undefined,
  predicate: (item: T, index: number) => boolean
): boolean {
  if (!Array.isArray(values)) return false
  return values.some(predicate)
}

export function safeEvery<T>(
  values: T[] | null | undefined,
  predicate: (item: T, index: number) => boolean
): boolean {
  if (!Array.isArray(values)) return false
  return values.every(predicate)
}

export function safeFind<T>(
  values: T[] | null | undefined,
  predicate: (item: T, index: number) => boolean
): T | undefined {
  if (!Array.isArray(values)) return undefined
  return values.find(predicate)
}

export function safeFindIndex<T>(
  values: T[] | null | undefined,
  predicate: (item: T, index: number) => boolean
): number {
  if (!Array.isArray(values)) return -1
  return values.findIndex(predicate)
}
