'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Capability, RoleId } from '@/lib/auth/permissions'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'

export default function RoleCapabilityEditor({
  role,
  capabilities,
  effectiveCapabilities,
  hasOverride,
}: {
  role: RoleId
  capabilities: Capability[]
  effectiveCapabilities: Capability[]
  hasOverride: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<Capability>>(new Set(effectiveCapabilities))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(cap: Capability) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(cap)) next.delete(cap)
      else next.add(cap)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/role-capability-overrides/${role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capabilities: Array.from(selected) }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not save')
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError('Could not reach the server — the change was not saved.')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/role-capability-overrides/${role}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not reset')
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError('Could not reach the server — the reset was not applied.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Edit
        </Button>
        {hasOverride && (
          <Button variant="secondary" onClick={handleReset} disabled={saving}>
            Reset to default
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-mist bg-paper p-3">
      {error && <Alert tone="error" inline>{error}</Alert>}
      <fieldset className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        <legend className="sr-only">Capabilities for {role}</legend>
        {capabilities.map((cap) => (
          <label key={cap} className="flex items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={selected.has(cap)}
              onChange={() => toggle(cap)}
              disabled={cap === 'admin.roleOverrides.manage'}
              className="h-4 w-4"
            />
            {cap}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-2">
        <Button onClick={handleSave} loading={saving}>
          Save
        </Button>
        <Button variant="secondary" onClick={() => { setOpen(false); setSelected(new Set(effectiveCapabilities)); setError(null) }}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
