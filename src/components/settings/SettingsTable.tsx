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
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="border rounded p-4 space-y-2">
        <h2 className="text-sm font-medium">Add setting</h2>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="key (e.g. business.timezone)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <select
            className="border rounded px-2 py-1 text-sm"
            value={newType}
            onChange={(e) => setNewType(e.target.value as ValueType)}
          >
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
          {newType === 'boolean' ? (
            <select
              className="border rounded px-2 py-1 text-sm"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            >
              <option value="">choose...</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          )}
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={handleAdd}
            className="bg-black text-white rounded px-3 py-1 text-sm disabled:bg-gray-400"
          >
            Add
          </button>
        </div>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Key</th>
            <th className="py-2 pr-4">Value</th>
            <th className="py-2 pr-4">Updated</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {settings.map((row) => (
            <tr key={row.key} className="border-b">
              <td className="py-2 pr-4 font-mono">{row.key}</td>
              <td className="py-2 pr-4">
                {editingKey === row.key ? (
                  <input
                    className="border rounded px-2 py-1 text-sm"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                  />
                ) : (
                  String(row.value)
                )}
              </td>
              <td className="py-2 pr-4 text-gray-500">{row.updatedAt}</td>
              <td className="py-2 pr-4 space-x-2">
                {editingKey === row.key ? (
                  <>
                    <button
                      type="button"
                      disabled={busyKey === row.key}
                      onClick={() => handleSaveEdit(row)}
                      className="underline disabled:text-gray-400"
                    >
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingKey(null)} className="underline">
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
                      className="underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busyKey === row.key}
                      onClick={() => handleDelete(row)}
                      className="text-red-600 underline disabled:text-gray-400 disabled:no-underline"
                    >
                      Delete
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
