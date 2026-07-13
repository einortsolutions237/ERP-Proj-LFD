'use client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { RevenueTrendPoint } from '@/lib/dashboard/revenueTrend'

// Recharts renders raw SVG and does not consume Tailwind utility classes for
// stroke/fill — these hex values are the literal values of this app's
// --color-marine/--color-mist/--color-slate tokens (src/app/globals.css) and
// must be updated here too if those tokens ever change. This is the one
// deliberate, narrow exception to this app's "zero hardcoded hex" invariant
// (confirmed clean as of Phase 21), required by the charting library itself.
const MARINE = '#0f5c66'
const MIST = '#e2e8f0'
const SLATE = '#475569'

export default function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={MARINE} stopOpacity={0.35} />
              <stop offset="95%" stopColor={MARINE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={MIST} vertical={false} />
          <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} stroke={SLATE} tick={{ fontSize: 11 }} />
          <YAxis stroke={SLATE} tick={{ fontSize: 11 }} width={56} />
          <Tooltip
            formatter={(value: unknown): [string, string] => [typeof value === 'number' ? value.toLocaleString() : String(value), 'Revenue']}
            contentStyle={{ borderRadius: 12, borderColor: MIST, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="revenue" stroke={MARINE} strokeWidth={2} fill="url(#revenueFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
