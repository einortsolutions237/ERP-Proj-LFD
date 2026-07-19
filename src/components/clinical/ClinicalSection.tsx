'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TreatmentForm from './TreatmentForm'
import LabOrderForm from './LabOrderForm'
import type { TreatmentRow } from '@/lib/clinical/getPatientTreatments'
import type { SeminarAttendanceRow } from '@/lib/clinical/getSeminarAttendance'

export type { TreatmentRow }

export interface ClinicalSectionProps {
  customerId: string
  treatments: TreatmentRow[]
  canCreate: boolean
  canViewClinical: boolean
  canOrderLab: boolean
  seminarAttendance: SeminarAttendanceRow[]
  canViewSeminarAttendance: boolean
}

export default function ClinicalSection({
  customerId,
  treatments,
  canCreate,
  canViewClinical,
  canOrderLab,
  seminarAttendance,
  canViewSeminarAttendance,
}: ClinicalSectionProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [orderingForTreatmentId, setOrderingForTreatmentId] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {canViewClinical && (
        <>
          <h2 className="text-lg font-medium text-ink">Clinical record</h2>
          {treatments.length === 0 ? (
            <p className="text-sm text-slate">No treatments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-mist/40">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Doctor</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Diagnosis</th>
                      {canOrderLab && <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {treatments.map((row) => (
                      <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                        <td className="px-3 py-2 text-ink">{row.date}</td>
                        <td className="px-3 py-2 text-ink">{row.doctorName}</td>
                        <td className="px-3 py-2 text-ink">{row.diagnosis}</td>
                        {canOrderLab && (
                          <td className="px-3 py-2 text-ink">
                            <button
                              type="button"
                              onClick={() => setOrderingForTreatmentId((prev) => (prev === row.id ? null : row.id))}
                              className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist/40"
                            >
                              Order lab test
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canOrderLab && orderingForTreatmentId && (
                <LabOrderForm
                  customerId={customerId}
                  treatmentId={orderingForTreatmentId}
                  onDone={() => {
                    setOrderingForTreatmentId(null)
                    router.refresh()
                  }}
                />
              )}
            </div>
          )}

          {canCreate && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowForm((prev) => !prev)}
                className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
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
        </>
      )}

      {canViewSeminarAttendance && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-ink">Seminar attendance</h3>
          {seminarAttendance.length === 0 ? (
            <p className="text-sm text-slate">No seminar attendance recorded.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-mist/40">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Seminar</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {seminarAttendance.map((row) => (
                    <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                      <td className="px-3 py-2 text-ink">{new Date(row.seminarScheduledAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-ink">{row.seminarTitle}</td>
                      <td className="px-3 py-2 text-ink">{row.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
