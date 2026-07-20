'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface DeleteCustomerButtonProps {
  customerId: string
  customerName: string
}

export default function DeleteCustomerButton({ customerId, customerName }: DeleteCustomerButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!confirm(`Delete ${customerName}? This cannot be undone.`)) return
    setError(null)
    setDeleting(true)
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) {
        // e.g. 409 when the customer is still referenced by a sale — show the
        // message inline and stay on the page, don't navigate away.
        setError(body.error ?? 'Could not delete — check your connection and try again.')
        return
      }
      router.push('/customers')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={deleting}
        onClick={handleDelete}
        className="inline-flex min-h-11 items-center rounded-lg px-3 text-danger transition-colors duration-200 hover:bg-danger/10 disabled:opacity-50"
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
