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
        className="w-full border rounded px-3 py-2 text-sm"
      />
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Phone</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="py-2 pr-4">{row.name}</td>
              <td className="py-2 pr-4">{row.phone}</td>
              <td className="py-2 pr-4">{row.email ?? '—'}</td>
              <td className="py-2 pr-4">
                <Link href={`/customers/${row.id}`} className="underline">
                  View
                </Link>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-gray-500">
                No customers found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
