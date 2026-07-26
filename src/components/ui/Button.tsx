import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-marine text-paper hover:bg-marine/90',
  secondary: 'border border-mist text-ink hover:border-marine hover:bg-mist',
  ghost: 'text-ink hover:bg-mist',
  danger: 'border border-mist text-danger hover:border-danger hover:bg-danger/10',
  success: 'bg-success text-paper hover:bg-success/90',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: boolean
  loading?: boolean
  children?: ReactNode
}

function LoadingSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export default function Button({
  variant = 'primary',
  icon = false,
  loading = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const sizeClasses = icon
    ? 'flex min-h-11 min-w-11 shrink-0 items-center justify-center'
    : 'inline-flex min-h-11 items-center justify-center gap-2 px-3 py-2.5'

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`rounded-[var(--radius-control)] text-sm font-medium transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50 ${sizeClasses} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {loading ? <LoadingSpinner /> : children}
    </button>
  )
}
