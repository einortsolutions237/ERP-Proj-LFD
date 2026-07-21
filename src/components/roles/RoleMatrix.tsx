import { ROLES, ROLE_CAPABILITIES, type Capability } from '@/lib/auth/permissions'

// Read-only, no client state — this is just a projection of the static
// ROLE_CAPABILITIES table (Task 3). No API call, nothing to fetch.
const CAPABILITIES = Object.keys(ROLE_CAPABILITIES) as Capability[]

export default function RoleMatrix() {
  return (
    <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist/40">
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                Role
              </th>
              {CAPABILITIES.map((cap) => (
                <th
                  key={cap}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate"
                >
                  {cap}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {ROLES.map((role) => {
              // super_admin has no entry in ROLE_CAPABILITIES by design (Task 3) —
              // it is intentionally out-of-band, not "granted every capability" in
              // the data model. Render that fact explicitly instead of computing
              // (and thus fabricating) a row from the capability list.
              if (role === 'super_admin') {
                return (
                  <tr key={role} className="bg-mist/40">
                    <td className="px-3 py-2 font-medium text-ink">{role}</td>
                    <td colSpan={CAPABILITIES.length} className="px-3 py-2 italic text-slate">
                      (full access, protected)
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={role} className="transition-colors duration-200 hover:bg-mist/40">
                  <td className="px-3 py-2 font-medium text-ink">{role}</td>
                  {CAPABILITIES.map((cap) => {
                    const granted = ROLE_CAPABILITIES[cap].includes(role)
                    return (
                      <td key={cap} className="px-3 py-2 text-center">
                        {granted ? (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success/10 text-success">
                            <span aria-hidden="true">✓</span>
                            <span className="sr-only">Granted</span>
                          </span>
                        ) : (
                          <span aria-hidden="true" className="text-slate">
                            —
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
