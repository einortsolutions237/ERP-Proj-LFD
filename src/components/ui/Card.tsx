import type { HTMLAttributes, ReactNode } from 'react'

export type CardVariant = 'default' | 'nested'

// Background is deliberately not part of these classes — callers supply their
// own bg-* utility via `className`. Tailwind's generated stylesheet orders
// utilities of equal specificity by its own internal rule order, not by the
// order classes appear in a JSX className string, so two competing bg-*
// classes on one element would have an unpredictable winner. Keeping Card
// itself background-free avoids that entirely.
const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: 'border border-mist shadow-[var(--shadow-card)]',
  nested: 'border border-mist/70',
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  hoverable?: boolean
  children?: ReactNode
}

export default function Card({
  variant = 'default',
  hoverable = false,
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-card)] p-4 ${VARIANT_CLASSES[variant]} ${
        hoverable ? 'transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)]' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
