import type { HTMLAttributes, ReactNode } from 'react'

export type CardVariant = 'default' | 'nested'
export type CardPadding = 'default' | 'compact'

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

// Padding is a prop, not a hardcoded literal, for the same reason background
// is a caller-supplied className: a caller passing className="p-3" to try to
// shrink a hardcoded "p-4" would not reliably win the Tailwind cascade.
const PADDING_CLASSES: Record<CardPadding, string> = {
  default: 'p-4',
  compact: 'p-3',
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  padding?: CardPadding
  hoverable?: boolean
  children?: ReactNode
}

export default function Card({
  variant = 'default',
  padding = 'default',
  hoverable = false,
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-card)] ${PADDING_CLASSES[padding]} ${VARIANT_CLASSES[variant]} ${
        hoverable ? 'transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)]' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
