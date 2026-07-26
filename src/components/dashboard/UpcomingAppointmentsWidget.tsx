import type { AppointmentRow } from '@/lib/clinical/getAppointments'
import StatSummary from '@/components/ui/StatSummary'

export default function UpcomingAppointmentsWidget({ appointments }: { appointments: AppointmentRow[] }) {
  return (
    <div className="space-y-3">
      {appointments.length === 0 ? (
        <p className="text-sm text-slate">No upcoming appointments.</p>
      ) : (
        <>
          <StatSummary
            count={appointments.length}
            label={`upcoming appointment${appointments.length === 1 ? '' : 's'}`}
          />
          <ul className="divide-y divide-mist">
            {appointments.slice(0, 5).map((appt) => (
              <li key={appt.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {appt.customerName}
                  <span className="ml-2 text-xs text-slate">with {appt.doctorName}</span>
                </span>
                <span className="font-mono text-xs text-slate">{new Date(appt.scheduledAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
