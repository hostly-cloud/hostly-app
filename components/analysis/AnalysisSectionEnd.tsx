export function AnalysisSectionEnd({
  label,
  hint,
  withDivider,
  className,
}: {
  label: string
  hint?: string
  withDivider?: boolean
  className?: string
}) {
  return (
    <div className={`mt-4 text-center text-xs text-gray-400 ${className || ""}`}>
      {withDivider && <div className="mb-2 border-t border-gray-200" />}

      <div>— Fin análisis de {label} —</div>

      {hint && <div className="mt-1">{hint}</div>}
    </div>
  )
}
