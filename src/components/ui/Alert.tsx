import type { ReactNode } from 'react'

export type AlertTone = 'success' | 'warning' | 'error' | 'info'

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

interface AlertProps {
  tone?: AlertTone
  inline?: boolean
  className?: string
  children: ReactNode
}

export default function Alert({ tone = 'info', inline = false, className = '', children }: AlertProps) {
  if (inline) {
    return (
      <p role="alert" className={`text-sm ${TEXT_CLASSES[tone]} ${className}`}>
        {children}
      </p>
    )
  }
  return (
    <div role="alert" className={`rounded-[var(--radius-control)] border px-3 py-2 text-sm ${BOX_CLASSES[tone]} ${className}`}>
      {children}
    </div>
  )
}
