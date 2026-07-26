export type StatTone = 'ink' | 'danger' | 'warning' | 'info'

const TONE_CLASSES: Record<StatTone, string> = {
  ink: 'text-ink',
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
}

export default function StatSummary({
  count,
  label,
  tone = 'ink',
}: {
  count: number
  label: string
  tone?: StatTone
}) {
  return (
    <p className="text-sm text-slate">
      <span className={`font-mono text-base font-medium ${TONE_CLASSES[tone]}`}>{count}</span> {label}
    </p>
  )
}
