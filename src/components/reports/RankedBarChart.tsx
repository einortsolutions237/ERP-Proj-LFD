'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { BarChartDatum } from './CategoryBarChart'

// See CategoryBarChart.tsx for why these are hardcoded hex rather than
// Tailwind classes — identical reasoning, same tokens.
const MIST = '#e2e8f0'
const SLATE = '#475569'

export default function RankedBarChart({
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
    <div
      className="w-full"
      style={{ height: Math.max(data.length * 40, 120) }}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={MIST} horizontal={false} />
          <XAxis
            type="number"
            stroke={SLATE}
            tick={{ fontSize: 11 }}
            tickFormatter={(value: number) => value.toLocaleString()}
          />
          <YAxis type="category" dataKey="label" stroke={SLATE} tick={{ fontSize: 11 }} width={140} />
          <Tooltip
            formatter={(value: unknown): [string, string] => [
              typeof value === 'number' ? value.toLocaleString() : String(value),
              valueLabel,
            ]}
            contentStyle={{ borderRadius: 12, borderColor: MIST, fontSize: 12 }}
          />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={!reducedMotion} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
