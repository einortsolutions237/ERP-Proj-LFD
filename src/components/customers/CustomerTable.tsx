'use client'
import { useState } from 'react'
import Link from 'next/link'

// List page only ever needs these fields for the row — keeping the row type
// narrow (rather than the full Customer, which carries Timestamps) means
// there's no Timestamp-serialization boundary to get wrong here at all.
export interface CustomerRow {
  id: string
  name: string
  phone: string
  email: string | null
}

export default function CustomerTable({ customers }: { customers: CustomerRow[] }) {
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const filtered = customers.filter(
    (c) => c.name.toLowerCase().includes(query) || c.phone.toLowerCase().includes(query)
  )

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or phone…"
        className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
      />
      <div className="overflow-hidden rounded-md border border-mist">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist/40">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Phone</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Email</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-mist/40 transition-colors">
                <td className="px-3 py-2 text-ink">{row.name}</td>
                <td className="px-3 py-2 text-ink">{row.phone}</td>
                <td className="px-3 py-2 text-ink">{row.email ?? '—'}</td>
                <td className="px-3 py-2 text-ink">
                  <Link href={`/customers/${row.id}`} className="text-marine underline-offset-2 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-slate">
                  No customers found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
