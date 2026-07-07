'use client'
import { useState } from 'react'
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

export default function IntakeSection({ customerId, demographics, visits, canRecord }: IntakeSectionProps) {
  const router = useRouter()
  const [showDemographicsForm, setShowDemographicsForm] = useState(false)
  const [showVisitForm, setShowVisitForm] = useState(false)

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
            <button
              type="button"
              onClick={() => setShowDemographicsForm((prev) => !prev)}
              className="rounded-md border border-mist px-3 py-2 text-sm text-ink transition-colors hover:bg-mist"
            >
              {demographics ? 'Edit demographics' : 'Record demographics'}
            </button>
            {showDemographicsForm && (
              <DemographicsForm
                customerId={customerId}
                initial={demographics}
                onDone={() => {
                  setShowDemographicsForm(false)
                  router.refresh()
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
              <div key={visit.id} className="space-y-2 rounded-md border border-mist p-3">
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
            <button
              type="button"
              onClick={() => setShowVisitForm((prev) => !prev)}
              className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
            >
              Record visit
            </button>
            {showVisitForm && (
              <NursingVisitForm
                customerId={customerId}
                onDone={() => {
                  setShowVisitForm(false)
                  router.refresh()
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
