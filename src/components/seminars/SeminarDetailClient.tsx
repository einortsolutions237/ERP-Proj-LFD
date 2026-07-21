'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SeminarForm from './SeminarForm'
import AttendanceForm from './AttendanceForm'
import AttendanceTable from './AttendanceTable'
import type { SeminarFormat } from '@/lib/types/seminar'
import type { SeminarAttendanceRow } from '@/lib/clinical/getSeminarAttendance'

// `seminar.scheduledAt` arrives as a UTC ISO string (server-serialized via
// .toISOString()); a <input type="datetime-local"> needs local-time
// "YYYY-MM-DDTHH:mm" with no timezone conversion applied by the browser.
// A plain .slice(0, 16) on the ISO string would silently display (and, on
// resubmission, persist) the wrong instant for any timezone other than
// UTC — this reconstructs local wall-clock fields explicitly instead.
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface SeminarDetailClientProps {
  seminar: {
    id: string
    title: string
    description: string | null
    scheduledAt: string
    format: SeminarFormat
    branchId: string | null
    branchName: string | null
  }
  attendance: SeminarAttendanceRow[]
  canManage: boolean
  canRecord: boolean
  canView: boolean
  branches: { id: string; name: string }[]
  customers: { id: string; name: string; phone: string }[]
}

export default function SeminarDetailClient({
  seminar,
  attendance,
  canManage,
  canRecord,
  canView,
  branches,
  customers,
}: SeminarDetailClientProps) {
  const router = useRouter()
  const [showEdit, setShowEdit] = useState(false)
  const [showRecordForm, setShowRecordForm] = useState(false)

  return (
    <div className="mx-auto mt-12 max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">{seminar.title}</h1>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowEdit((prev) => !prev)}
            className="text-marine underline-offset-2 hover:underline"
          >
            {showEdit ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>

      {showEdit ? (
        <SeminarForm
          mode="edit"
          seminarId={seminar.id}
          branches={branches}
          initial={{
            title: seminar.title,
            description: seminar.description,
            scheduledAt: toDatetimeLocalValue(seminar.scheduledAt),
            format: seminar.format,
            branchId: seminar.branchId,
          }}
          onDone={() => setShowEdit(false)}
        />
      ) : (
        <div className="space-y-1 text-sm">
          <div>
            <span className="text-slate">Date/Time:</span>{' '}
            <span className="text-ink">{new Date(seminar.scheduledAt).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate">Format:</span> <span className="text-ink">{seminar.format}</span>
          </div>
          <div>
            <span className="text-slate">Branch:</span> <span className="text-ink">{seminar.branchName ?? '—'}</span>
          </div>
          {seminar.description && (
            <div>
              <span className="text-slate">Description:</span> <span className="text-ink">{seminar.description}</span>
            </div>
          )}
        </div>
      )}

      {canView && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-ink">Attendance</h2>
          <AttendanceTable rows={attendance} emptyMessage="No attendance recorded yet." />
        </div>
      )}

      {canRecord && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowRecordForm((prev) => !prev)}
            className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
          >
            Record attendance
          </button>
          {showRecordForm && (
            <AttendanceForm
              seminarId={seminar.id}
              customers={customers}
              onDone={() => {
                setShowRecordForm(false)
                router.refresh()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
