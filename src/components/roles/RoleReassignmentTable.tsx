'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROLES, type RoleId } from '@/lib/auth/permissions'
import type { StaffRow } from '@/components/staff/StaffTable'

// Same list StaffForm uses — super_admin is structurally absent, never an
// option a caller can select into. This is the third place this exact
// exclusion appears (staff create form, staff edit form, and here).
const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== 'super_admin')

// Display-only — same humanizeRole every other role-displaying component in
// this app duplicates locally (StaffTable, StaffForm, NavShell, messaging) —
// never used for any access decision.
function humanizeRole(role: string): string {
  return role
    .split('_')
    .map((word) => (word === 'hr' || word === 'it' ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

export default function RoleReassignmentTable({ staff, canAssign }: { staff: StaffRow[]; canAssign: boolean }) {
  const router = useRouter()
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sorted = [...staff].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name))

  async function handleRoleChange(row: StaffRow, newRole: RoleId) {
    if (row.role === 'super_admin') return // structurally disabled below too; belt and suspenders
    setError(null)
    setUpdatingId(row.id)
    try {
      const res = await fetch(`/api/staff/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Reassignment failed')
        return
      }
      router.refresh()
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  Name
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  Email
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  Current role
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  Reassign
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {sorted.map((row) => {
                const isSuperAdmin = row.role === 'super_admin'
                return (
                  <tr key={row.id} className="transition-colors duration-200 hover:bg-mist/40">
                    <td className="max-w-[12rem] truncate px-3 py-2 text-ink" title={row.name}>
                      {row.name}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2 text-ink" title={row.email}>
                      {row.email}
                    </td>
                    <td className="px-3 py-2 text-ink">{humanizeRole(row.role)}</td>
                    <td className="px-3 py-2">
                      {isSuperAdmin ? (
                        <span className="italic text-slate">protected — no reassignment control</span>
                      ) : canAssign ? (
                        <>
                          <label className="sr-only" htmlFor={`reassign-${row.id}`}>
                            Reassign role for {row.name}
                          </label>
                          <select
                            id={`reassign-${row.id}`}
                            defaultValue={row.role}
                            disabled={updatingId === row.id}
                            onChange={(e) => handleRoleChange(row, e.target.value as RoleId)}
                            className="rounded-lg border border-mist bg-paper px-2 py-1 text-ink focus:border-marine disabled:opacity-50"
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {humanizeRole(r)}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <span className="italic text-slate">no permission to reassign</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
