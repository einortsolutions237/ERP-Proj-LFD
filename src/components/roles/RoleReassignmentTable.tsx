'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROLES, type RoleId } from '@/lib/auth/permissions'
import type { StaffRow } from '@/components/staff/StaffTable'

// Same list StaffForm uses — super_admin is structurally absent, never an
// option a caller can select into. This is the third place this exact
// exclusion appears (staff create form, staff edit form, and here).
const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== 'super_admin')

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
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Current role</th>
            <th className="py-2 pr-4">Reassign</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const isSuperAdmin = row.role === 'super_admin'
            return (
              <tr key={row.id} className="border-b">
                <td className="py-2 pr-4">{row.name}</td>
                <td className="py-2 pr-4">{row.email}</td>
                <td className="py-2 pr-4">{row.role}</td>
                <td className="py-2 pr-4">
                  {isSuperAdmin ? (
                    <span className="text-gray-500 italic">protected — no reassignment control</span>
                  ) : canAssign ? (
                    <select
                      defaultValue={row.role}
                      disabled={updatingId === row.id}
                      onChange={(e) => handleRoleChange(row, e.target.value as RoleId)}
                      className="border rounded px-2 py-1"
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-400 italic">no permission to reassign</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
