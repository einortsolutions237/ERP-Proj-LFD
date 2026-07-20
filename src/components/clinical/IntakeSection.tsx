'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import DemographicsForm from './DemographicsForm'
import NursingVisitForm from './NursingVisitForm'
import type { PatientDemographicsRow, NursingVisitRow } from '@/lib/clinical/getPatientIntake'

export interface IntakeSectionProps {
  customerId: string
  demographics: PatientDemographicsRow | null
  visits: NursingVisitRow[]
  canRecord: boolean
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

export default function IntakeSection({ customerId, demographics, visits, canRecord }: IntakeSectionProps) {
  const router = useRouter()
  const [isRefreshing, startTransition] = useTransition()
  const [showDemographicsForm, setShowDemographicsForm] = useState(false)
  const [demographicsSaved, setDemographicsSaved] = useState(false)
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [visitSaved, setVisitSaved] = useState(false)

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-lg font-medium text-ink">Patient demographics</h2>
        {demographics ? (
          <div className="space-y-1 text-sm">
            <div><span className="text-slate">Marital status:</span> <span className="text-ink">{demographics.maritalStatus ?? '—'}</span></div>
            <div><span className="text-slate">Religion:</span> <span className="text-ink">{demographics.religion ?? '—'}</span></div>
            <div><span className="text-slate">Occupation:</span> <span className="text-ink">{demographics.occupation ?? '—'}</span></div>
            <div><span className="text-slate">Referral:</span> <span className="text-ink">{demographics.referralName ?? '—'}</span></div>
            <div className="text-xs text-slate">
              Last updated {new Date(demographics.updatedAt).toLocaleString()} by {demographics.recordedByName}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate">No demographics recorded yet.</p>
        )}

        {canRecord && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDemographicsForm((prev) => !prev)
                  setDemographicsSaved(false)
                }}
                className="min-h-11 rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist"
              >
                {demographics ? 'Edit demographics' : 'Record demographics'}
              </button>
              {demographicsSaved && !showDemographicsForm && <SavedNote />}
              {isRefreshing && <p className="text-sm text-slate">Updating…</p>}
            </div>
            {showDemographicsForm && (
              <DemographicsForm
                customerId={customerId}
                initial={demographics}
                onDone={() => {
                  setShowDemographicsForm(false)
                  setDemographicsSaved(true)
                  startTransition(() => router.refresh())
                }}
              />
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium text-ink">Nursing visits</h2>
        {visits.length === 0 ? (
          <p className="text-sm text-slate">No nursing visits recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {visits.map((visit) => (
              <div key={visit.id} className="space-y-2 rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
                <div className="text-xs text-slate">
                  {new Date(visit.recordedAt).toLocaleString()} — recorded by {visit.recordedByName}
                </div>
                {Object.keys(visit.vitals).length > 0 && (
                  <div className="text-sm text-ink">
                    {Object.entries(visit.vitals).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </div>
                )}
                {visit.answers.length > 0 && (
                  <div className="space-y-1">
                    {visit.answers.map((a, i) => (
                      <div key={i} className="text-sm">
                        <span className="text-slate">{a.question}</span> <span className="text-ink">{a.answer || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canRecord && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowVisitForm((prev) => !prev)
                  setVisitSaved(false)
                }}
                className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
              >
                Record visit
              </button>
              {visitSaved && !showVisitForm && <SavedNote />}
            </div>
            {showVisitForm && (
              <NursingVisitForm
                customerId={customerId}
                onDone={() => {
                  setShowVisitForm(false)
                  setVisitSaved(true)
                  startTransition(() => router.refresh())
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
