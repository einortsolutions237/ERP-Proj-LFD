'use client'
import { useState, useTransition } from 'react'
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

// "Saved." confirmation dot pairs a solid brand-token dot with text-ink
// rather than text-success, since text-success alone fails WCAG AA at this
// size (~3.3:1) — the same fix applied to this module's status badges.
function SavedNote() {
  return (
    <p className="flex items-center gap-1.5 text-sm text-ink">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
      Saved.
    </p>
  )
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
  const [isRefreshing, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [treatmentSaved, setTreatmentSaved] = useState(false)
  const [orderingForTreatmentId, setOrderingForTreatmentId] = useState<string | null>(null)
  const [savedTreatmentId, setSavedTreatmentId] = useState<string | null>(null)

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
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setOrderingForTreatmentId((prev) => (prev === row.id ? null : row.id))}
                                className="min-h-11 rounded-lg border border-mist px-3 text-xs text-ink transition-colors duration-200 hover:bg-mist/40"
                              >
                                Order lab test
                              </button>
                              {savedTreatmentId === row.id && <SavedNote />}
                            </div>
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
                    setSavedTreatmentId(orderingForTreatmentId)
                    setOrderingForTreatmentId(null)
                    startTransition(() => router.refresh())
                  }}
                />
              )}
            </div>
          )}

          {canCreate && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm((prev) => !prev)
                    setTreatmentSaved(false)
                  }}
                  className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
                >
                  Add treatment
                </button>
                {treatmentSaved && !showForm && <SavedNote />}
                {isRefreshing && <p className="text-sm text-slate">Updating…</p>}
              </div>
              {showForm && (
                <TreatmentForm
                  customerId={customerId}
                  onDone={() => {
                    setShowForm(false)
                    setTreatmentSaved(true)
                    startTransition(() => router.refresh())
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
