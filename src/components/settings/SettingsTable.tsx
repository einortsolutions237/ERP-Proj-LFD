'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Server Components can't pass Firestore Timestamp instances to Client
// Components, so the page converts updatedAt to an ISO string before handing
// rows to this table (same pattern as DepartmentTable).
export type SettingRow = {
  key: string
  value: string | number | boolean
  updatedAt: string
  updatedBy: string
}

type ValueType = 'string' | 'number' | 'boolean'

function inferType(value: string | number | boolean): ValueType {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

export default function SettingsTable({ settings }: { settings: SettingRow[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // Add-row state
  const [newKey, setNewKey] = useState('')
  const [newType, setNewType] = useState<ValueType>('string')
  const [newValue, setNewValue] = useState('')

  // Edit-row state: only one row editable at a time, tracked by key. Only the
  // value is editable — the key is the doc ID and can't change in place.
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  function parseInput(raw: string, type: ValueType): string | number | boolean | undefined {
    if (type === 'boolean') {
      if (raw !== 'true' && raw !== 'false') return undefined
      return raw === 'true'
    }
    if (type === 'number') {
      const num = Number(raw)
      return Number.isFinite(num) && raw.trim() !== '' ? num : undefined
    }
    return raw.trim() !== '' ? raw : undefined
  }

  async function submitUpsert(key: string, value: string | number | boolean): Promise<boolean> {
    setError(null)
    setBusyKey(key)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Save failed')
        return false
      }
      router.refresh()
      return true
    } finally {
      setBusyKey(null)
    }
  }

  async function handleAdd() {
    const trimmedKey = newKey.trim()
    if (!trimmedKey) {
      setError('key is required')
      return
    }
    const value = parseInput(newValue, newType)
    if (value === undefined) {
      setError(`value must be a valid ${newType}`)
      return
    }
    const ok = await submitUpsert(trimmedKey, value)
    if (ok) {
      setNewKey('')
      setNewValue('')
      setNewType('string')
    }
  }

  async function handleSaveEdit(row: SettingRow) {
    const type = inferType(row.value)
    const value = parseInput(editValue, type)
    if (value === undefined) {
      setError(`value must be a valid ${type}`)
      return
    }
    const ok = await submitUpsert(row.key, value)
    if (ok) setEditingKey(null)
  }

  async function handleDelete(row: SettingRow) {
    if (!confirm(`Delete ${row.key}? This cannot be undone.`)) return
    setError(null)
    setBusyKey(row.key)
    try {
      const res = await fetch(`/api/settings/${encodeURIComponent(row.key)}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Delete failed')
        return
      }
      router.refresh()
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="rounded-2xl border border-mist bg-surface p-4 shadow-[var(--shadow-card)] space-y-3">
        <h2 className="text-sm font-medium text-ink">Add setting</h2>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-marine"
            placeholder="key (e.g. business.timezone)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <select
            className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
            value={newType}
            onChange={(e) => setNewType(e.target.value as ValueType)}
          >
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
          {newType === 'boolean' ? (
            <select
              className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            >
              <option value="">choose...</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-marine"
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          )}
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={handleAdd}
            className="rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-opacity duration-200 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist/40">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Key</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Value</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Updated</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {settings.map((row) => (
              <tr key={row.key} className="hover:bg-mist/40 transition-colors duration-200">
                <td className="px-3 py-2 font-mono text-ink">{row.key}</td>
                <td className="px-3 py-2 text-ink">
                  {editingKey === row.key ? (
                    <input
                      className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    />
                  ) : (
                    String(row.value)
                  )}
                </td>
                <td className="px-3 py-2 text-slate">{row.updatedAt}</td>
                <td className="px-3 py-2 space-x-3">
                  {editingKey === row.key ? (
                    <>
                      <button
                        type="button"
                        disabled={busyKey === row.key}
                        onClick={() => handleSaveEdit(row)}
                        className="text-marine underline-offset-2 hover:underline disabled:text-slate disabled:no-underline"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingKey(null)}
                        className="text-marine underline-offset-2 hover:underline"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingKey(row.key)
                          setEditValue(String(row.value))
                          setError(null)
                        }}
                        className="text-marine underline-offset-2 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyKey === row.key}
                        onClick={() => handleDelete(row)}
                        className="text-danger underline-offset-2 hover:underline disabled:text-slate disabled:no-underline"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {settings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-slate">
                  No settings configured yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
