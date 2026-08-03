'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// Recharts renders raw SVG and does not consume Tailwind utility classes for
// stroke/fill — these hex values are the literal values of this app's
// --color-mist/--color-slate tokens (src/app/globals.css) and must be updated
// here too if those tokens ever change. Matches the identical, already-reviewed
// exception documented in src/components/dashboard/RevenueTrendChart.tsx.
const MIST = '#e2e8f0'
const SLATE = '#475569'

export interface BarChartDatum {
  label: string
  value: number
}

export default function CategoryBarChart({
  data,
  color,
  valueLabel,
  ariaLabel,
}: {
  data: BarChartDatum[]
  color: string
  valueLabel: string
  ariaLabel: string
}) {
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
  }, [])

  return (
    <div className="h-56 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={MIST} vertical={false} />
          <XAxis dataKey="label" stroke={SLATE} tick={{ fontSize: 11 }} />
          <YAxis
            stroke={SLATE}
            tick={{ fontSize: 11 }}
            width="auto"
            tickFormatter={(value: number) => value.toLocaleString()}
          />
          <Tooltip
            formatter={(value: unknown): [string, string] => [
              typeof value === 'number' ? value.toLocaleString() : String(value),
              valueLabel,
            ]}
            contentStyle={{ borderRadius: 12, borderColor: MIST, fontSize: 12 }}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={!reducedMotion} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
