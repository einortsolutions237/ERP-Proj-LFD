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
      <label htmlFor="customer-search" className="sr-only">
        Search customers by name or phone
      </label>
      <input
        id="customer-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or phone…"
        className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
      />
      <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Name</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Phone</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Email</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {filtered.map((row) => (
                <tr key={row.id} className="transition-colors duration-200 hover:bg-mist/40">
                  <td className="max-w-[14rem] truncate px-3 py-2 text-ink" title={row.name}>
                    {row.name}
                  </td>
                  <td className="px-3 py-2 text-ink">{row.phone}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2 text-ink" title={row.email ?? undefined}>
                    {row.email ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-ink">
                    <Link
                      href={`/customers/${row.id}`}
                      className="inline-flex min-h-11 items-center rounded-lg px-2 text-marine transition-colors duration-200 hover:bg-mist"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate">
                    {customers.length === 0 ? (
                      'No customers yet — add one to get started.'
                    ) : (
                      <>
                        No customers match &ldquo;{search}&rdquo;.{' '}
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          className="text-marine underline-offset-2 hover:underline"
                        >
                          Clear search
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
