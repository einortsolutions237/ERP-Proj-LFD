import type { ReactNode } from 'react'

export type AlertTone = 'success' | 'warning' | 'error' | 'info'
export type AlertSize = 'xs' | 'sm'

const BOX_CLASSES: Record<AlertTone, string> = {
  success: 'border-success bg-success/10 text-success',
  warning: 'border-warning bg-warning/10 text-warning',
  error: 'border-danger bg-danger/10 text-danger',
  info: 'border-info bg-info/10 text-info',
}

const TEXT_CLASSES: Record<AlertTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
  info: 'text-info',
}

// Text size is a prop, not a hardcoded literal, for the same reason Card
// keeps background out of its own classes: Tailwind's generated stylesheet
// orders same-specificity utilities by its own internal rule order, not by
// className string order, so a caller passing className="text-xs" to try to
// shrink a hardcoded "text-sm" would not reliably win.
const SIZE_CLASSES: Record<AlertSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
}

interface AlertProps {
  tone?: AlertTone
  inline?: boolean
  size?: AlertSize
  role?: 'alert' | 'status'
  className?: string
  children: ReactNode
}

export default function Alert({
  tone = 'info',
  inline = false,
  size = 'sm',
  role = 'alert',
  className = '',
  children,
}: AlertProps) {
  if (inline) {
    return (
      <p role={role} className={`${SIZE_CLASSES[size]} ${TEXT_CLASSES[tone]} ${className}`}>
        {children}
      </p>
    )
  }
  return (
    <div role={role} className={`rounded-[var(--radius-control)] border px-3 py-2 ${SIZE_CLASSES[size]} ${BOX_CLASSES[tone]} ${className}`}>
      {children}
    </div>
  )
}
