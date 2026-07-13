'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROLES, type RoleId } from '@/lib/auth/permissions'
import type { Staff } from '@/lib/types/staff'

// super_admin is structurally absent from this list — not filtered out at
// validation time, but never present for the <select> to render as an option.
const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== 'super_admin')

export interface StaffFormProps {
  mode: 'create' | 'edit'
  staffId?: string
  initial?: Partial<Staff>
}

export default function StaffForm({ mode, staffId, initial }: StaffFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [role, setRole] = useState<RoleId>((initial?.role as RoleId) ?? ASSIGNABLE_ROLES[0])
  const [department, setDepartment] = useState(initial?.department ?? '')
  const [phone, setPhone] = useState(initial?.contact?.phone ?? '')
  const [address, setAddress] = useState(initial?.contact?.address ?? '')
  const [emergencyName, setEmergencyName] = useState(initial?.emergencyContact?.name ?? '')
  const [emergencyPhone, setEmergencyPhone] = useState(initial?.emergencyContact?.phone ?? '')
  const [emergencyRelationship, setEmergencyRelationship] = useState(initial?.emergencyContact?.relationship ?? '')
  const [startDate, setStartDate] = useState(initial?.employment?.startDate ?? '')
  const [status, setStatus] = useState<'active' | 'inactive'>(initial?.employment?.status ?? 'active')
  const [qualifications, setQualifications] = useState((initial?.qualifications ?? []).join(', '))
  const [error, setError] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isSuperAdminTarget = initial?.role === 'super_admin'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = {
      name,
      email,
      role,
      department: department || null,
      contact: { phone: phone || null, address: address || null },
      emergencyContact: {
        name: emergencyName || null,
        phone: emergencyPhone || null,
        relationship: emergencyRelationship || null,
      },
      // Create: POST reads a top-level `startDate` (see /api/staff route.ts).
      // Edit: PATCH replaces the whole `employment` map on write (Firestore
      // Admin SDK .update() with a plain object, not dot-notation), so both
      // `status` and `startDate` must travel together inside `employment` or
      // the other field gets silently wiped from the document.
      startDate: mode === 'create' ? startDate || undefined : undefined,
      employment: mode === 'edit' ? { status, startDate: startDate || undefined } : undefined,
      qualifications: qualifications
        .split(',')
        .map((q) => q.trim())
        .filter(Boolean),
    }

    try {
      const res = await fetch(mode === 'create' ? '/api/staff' : `/api/staff/${staffId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      if (mode === 'create' && body.tempPassword) {
        setTempPassword(body.tempPassword)
        setSubmitting(false)
        return
      }
      router.push('/staff')
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  if (tempPassword) {
    return (
      <div className="max-w-md space-y-4">
        <p className="text-sm text-ink">
          Staff account created. Share this temporary password with the new staff member securely
          — it will not be shown again:
        </p>
        <code className="block rounded-lg bg-mist/40 px-3 py-2 font-mono text-ink break-all">{tempPassword}</code>
        <button
          type="button"
          className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
          onClick={() => router.push('/staff')}
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Email</label>
        <input
          type="email"
          required
          disabled={mode === 'edit'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Role</label>
        {isSuperAdminTarget ? (
          <input
            disabled
            value="super_admin (protected — cannot be changed here)"
            className="w-full rounded-lg border border-mist bg-mist/40 px-3 py-2 text-ink"
          />
        ) : (
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as RoleId)}
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Department</label>
        <input
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Phone</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Address</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <fieldset className="rounded-2xl border border-mist shadow-[var(--shadow-card)] bg-surface p-3 space-y-2">
        <legend className="text-sm font-medium text-ink px-1">Emergency contact</legend>
        <input
          placeholder="Name"
          value={emergencyName}
          onChange={(e) => setEmergencyName(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
        <input
          placeholder="Phone"
          value={emergencyPhone}
          onChange={(e) => setEmergencyPhone(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
        <input
          placeholder="Relationship"
          value={emergencyRelationship}
          onChange={(e) => setEmergencyRelationship(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </fieldset>
      <div>
        <label className="block text-sm font-medium text-ink">Start date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {mode === 'edit' && (
        <div>
          <label className="block text-sm font-medium text-ink">Employment status</label>
          {isSuperAdminTarget ? (
            <input
              disabled
              value="active (protected — cannot be deactivated here)"
              className="w-full rounded-lg border border-mist bg-mist/40 px-3 py-2 text-ink"
            />
          ) : (
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
              className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          )}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-ink">Qualifications (comma-separated)</label>
        <input
          value={qualifications}
          onChange={(e) => setQualifications(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        {mode === 'create' ? 'Create staff member' : 'Save changes'}
      </button>
    </form>
  )
}
