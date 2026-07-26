import type { ReactNode } from 'react'

export type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  neutral: 'bg-mist text-slate',
}

interface BadgeProps {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}

export default function Badge({ tone = 'neutral', className = '', children }: BadgeProps) {
  return (
    <span className={`inline-block rounded-[var(--radius-badge)] px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}>
      {children}
    </span>
  )
}
