'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TreatmentForm from './TreatmentForm'
import type { TreatmentRow } from '@/lib/clinical/getPatientTreatments'

export type { TreatmentRow }

export interface ClinicalSectionProps {
  customerId: string
  treatments: TreatmentRow[]
  canCreate: boolean
}

export default function ClinicalSection({ customerId, treatments, canCreate }: ClinicalSectionProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium text-ink">Clinical record</h2>
      {treatments.length === 0 ? (
        <p className="text-sm text-slate">No treatments recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-mist">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Doctor</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Diagnosis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {treatments.map((row) => (
                <tr key={row.id} className="hover:bg-mist/40 transition-colors">
                  <td className="px-3 py-2 text-ink">{row.date}</td>
                  <td className="px-3 py-2 text-ink">{row.doctorName}</td>
                  <td className="px-3 py-2 text-ink">{row.diagnosis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canCreate && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
          >
            Add treatment
          </button>
          {showForm && (
            <TreatmentForm
              customerId={customerId}
              onDone={() => {
                setShowForm(false)
                router.refresh()
              }}
            />
          )}
        </div>
      )}

      <div className="space-y-1">
        <h3 className="text-sm font-medium text-ink">Lab results</h3>
        <p className="text-sm text-slate">Will appear once Lab exists (Phase 15).</p>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-ink">Seminar attendance</h3>
        <p className="text-sm text-slate">Will appear once Seminars exists (Phase 16).</p>
      </div>
    </div>
  )
}
