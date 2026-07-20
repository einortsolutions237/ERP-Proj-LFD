'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ROLES, type RoleId } from '@/lib/auth/permissions'
import type { Staff } from '@/lib/types/staff'

// super_admin is structurally absent from this list — not filtered out at
// validation time, but never present for the <select> to render as an option.
const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== 'super_admin')

// Display-only — humanizes the raw role enum ("branch_manager" ->
// "Branch Manager") for the <option> label; the submitted value is still the
// raw RoleId, never this display string.
function humanizeRole(role: string): string {
  return role
    .split('_')
    .map((word) => (word === 'hr' || word === 'it' ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

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
  const [baseSalary, setBaseSalary] = useState(initial?.baseSalary != null ? String(initial.baseSalary) : '')
  const [error, setError] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const isSuperAdminTarget = initial?.role === 'super_admin'
  const cancelHref = mode === 'create' ? '/staff' : `/staff/${staffId}`

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
      baseSalary: mode === 'edit' ? (baseSalary.trim() === '' ? null : Number(baseSalary)) : undefined,
    }

    try {
      const res = await fetch(mode === 'create' ? '/api/staff' : `/api/staff/${staffId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not save — check your connection and try again.')
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
      setError('Could not save — check your connection and try again.')
      setSubmitting(false)
    }
  }

  async function handleCopyPassword() {
    if (!tempPassword) return
    try {
      await navigator.clipboard.writeText(tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can fail (permissions, non-HTTPS context); the
      // password is still visible and manually selectable either way.
    }
  }

  if (tempPassword) {
    return (
      <div className="max-w-md space-y-4">
        <p className="text-sm text-ink">
          Staff account created. Share this temporary password with the new staff member securely
          — it will not be shown again:
        </p>
        <div className="flex items-center gap-2">
          <code className="block flex-1 rounded-lg bg-mist/40 px-3 py-2 font-mono text-ink break-all">{tempPassword}</code>
          <button
            type="button"
            onClick={handleCopyPassword}
            className="min-h-11 shrink-0 rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
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
        <label htmlFor="staff-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="staff-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="staff-email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="staff-email"
          type="email"
          required
          disabled={mode === 'edit'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="staff-role" className="block text-sm font-medium text-ink">
          Role
        </label>
        {isSuperAdminTarget ? (
          <input
            id="staff-role"
            disabled
            value="super_admin (protected — cannot be changed here)"
            className="w-full rounded-lg border border-mist bg-mist/40 px-3 py-2 text-ink"
          />
        ) : (
          <select
            id="staff-role"
            value={role}
            onChange={(e) => setRole(e.target.value as RoleId)}
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {humanizeRole(r)}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label htmlFor="staff-department" className="block text-sm font-medium text-ink">
          Department
        </label>
        <input
          id="staff-department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="staff-phone" className="block text-sm font-medium text-ink">
          Phone
        </label>
        <input
          id="staff-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="staff-address" className="block text-sm font-medium text-ink">
          Address
        </label>
        <input
          id="staff-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <fieldset className="rounded-2xl border border-mist shadow-[var(--shadow-card)] bg-surface p-3 space-y-2">
        <legend className="text-sm font-medium text-ink px-1">Emergency contact</legend>
        <label htmlFor="staff-emergency-name" className="sr-only">
          Emergency contact name
        </label>
        <input
          id="staff-emergency-name"
          placeholder="Name"
          value={emergencyName}
          onChange={(e) => setEmergencyName(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
        <label htmlFor="staff-emergency-phone" className="sr-only">
          Emergency contact phone
        </label>
        <input
          id="staff-emergency-phone"
          type="tel"
          placeholder="Phone"
          value={emergencyPhone}
          onChange={(e) => setEmergencyPhone(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
        <label htmlFor="staff-emergency-relationship" className="sr-only">
          Emergency contact relationship
        </label>
        <input
          id="staff-emergency-relationship"
          placeholder="Relationship"
          value={emergencyRelationship}
          onChange={(e) => setEmergencyRelationship(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </fieldset>
      <div>
        <label htmlFor="staff-start-date" className="block text-sm font-medium text-ink">
          Start date
        </label>
        <input
          id="staff-start-date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {mode === 'edit' && (
        <div>
          <label htmlFor="staff-status" className="block text-sm font-medium text-ink">
            Employment status
          </label>
          {isSuperAdminTarget ? (
            <input
              id="staff-status"
              disabled
              value="active (protected — cannot be deactivated here)"
              className="w-full rounded-lg border border-mist bg-mist/40 px-3 py-2 text-ink"
            />
          ) : (
            <select
              id="staff-status"
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
        <label htmlFor="staff-qualifications" className="block text-sm font-medium text-ink">
          Qualifications (comma-separated)
        </label>
        <input
          id="staff-qualifications"
          value={qualifications}
          onChange={(e) => setQualifications(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {mode === 'edit' && (
        <div>
          <label htmlFor="staff-base-salary" className="block text-sm font-medium text-ink">
            Base salary
          </label>
          <input
            id="staff-base-salary"
            type="number"
            step="0.01"
            min="0"
            placeholder="Not set"
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink placeholder:text-slate focus:border-marine"
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : mode === 'create' ? 'Create staff member' : 'Save changes'}
        </button>
        <Link
          href={cancelHref}
          className="inline-flex min-h-11 items-center rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
