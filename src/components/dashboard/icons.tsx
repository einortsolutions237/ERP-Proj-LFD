import type { ReactElement } from 'react'

interface IconProps {
  className?: string
}

export type IconComponent = (props: IconProps) => ReactElement

const ICON_SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const ClockIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)

export const ChartLineIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M4 20V4M4 20h16" />
    <path d="M6 15l3.5-4 3 2.5L18 7" />
    <circle cx="6" cy="15" r="0.9" />
    <circle cx="9.5" cy="11" r="0.9" />
    <circle cx="12.5" cy="13.5" r="0.9" />
    <circle cx="18" cy="7" r="0.9" />
  </svg>
)

export const BoxIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M4 8 12 4l8 4-8 4-8-4z" />
    <path d="M4 8v8l8 4 8-4V8" />
    <path d="M12 12v8" />
  </svg>
)

export const TruckIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="2" y="8" width="11" height="8" />
    <path d="M13 11h4l3 3v2h-7z" />
    <circle cx="6.5" cy="18" r="1.5" />
    <circle cx="16.5" cy="18" r="1.5" />
  </svg>
)

export const ActivityIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M3 12h4l2-7 4 14 2-7h6" />
  </svg>
)

export const CalendarCheckIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="4" y="5" width="16" height="15" rx="1" />
    <path d="M4 10h16M8 3v3M16 3v3" />
    <path d="M9 14.5 11 16.5 15.5 12" />
  </svg>
)

export const FlaskIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M9 2.5h6M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.3h12.4a1.5 1.5 0 0 0 1.3-2.3L14 9.5V3" />
    <path d="M7.5 15h9" />
  </svg>
)

export const ClipboardCheckIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="6" y="4" width="12" height="17" rx="1" />
    <rect x="9" y="2.5" width="6" height="3" rx="1" />
    <path d="M9 13.5 11 15.5 15 11" />
  </svg>
)
