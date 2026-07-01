import { ROLES, ROLE_CAPABILITIES, type Capability } from '@/lib/auth/permissions'

// Read-only, no client state — this is just a projection of the static
// ROLE_CAPABILITIES table (Task 3). No API call, nothing to fetch.
const CAPABILITIES = Object.keys(ROLE_CAPABILITIES) as Capability[]

export default function RoleMatrix() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Role</th>
            {CAPABILITIES.map((cap) => (
              <th key={cap} className="py-2 pr-4 font-medium whitespace-nowrap">
                {cap}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROLES.map((role) => {
            // super_admin has no entry in ROLE_CAPABILITIES by design (Task 3) —
            // it is intentionally out-of-band, not "granted every capability" in
            // the data model. Render that fact explicitly instead of computing
            // (and thus fabricating) a row from the capability list.
            if (role === 'super_admin') {
              return (
                <tr key={role} className="border-b bg-gray-50">
                  <td className="py-2 pr-4 font-medium">{role}</td>
                  <td colSpan={CAPABILITIES.length} className="py-2 pr-4 text-gray-600 italic">
                    (full access, protected)
                  </td>
                </tr>
              )
            }
            return (
              <tr key={role} className="border-b">
                <td className="py-2 pr-4 font-medium">{role}</td>
                {CAPABILITIES.map((cap) => (
                  <td key={cap} className="py-2 pr-4 text-center">
                    {ROLE_CAPABILITIES[cap].includes(role) ? '✓' : '—'}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
