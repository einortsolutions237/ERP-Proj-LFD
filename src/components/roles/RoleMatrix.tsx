import { ROLES, ROLE_CAPABILITIES, type Capability, type RoleId } from '@/lib/auth/permissions'
import Badge from '@/components/ui/Badge'
import RoleCapabilityEditor from './RoleCapabilityEditor'

const CAPABILITIES = Object.keys(ROLE_CAPABILITIES) as Capability[]

export default function RoleMatrix({
  overrides,
  canEdit,
}: {
  overrides: Partial<Record<RoleId, Capability[]>>
  canEdit: boolean
}) {
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
              {canEdit && (
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  Override
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {ROLES.map((role) => {
              if (role === 'super_admin') {
                return (
                  <tr key={role} className="bg-mist/40">
                    <td className="px-3 py-2 font-medium text-ink">{role}</td>
                    <td colSpan={CAPABILITIES.length + (canEdit ? 1 : 0)} className="px-3 py-2 italic text-slate">
                      (full access, protected)
                    </td>
                  </tr>
                )
              }
              const override = overrides[role] ?? null
              const effective = override ?? CAPABILITIES.filter((cap) => ROLE_CAPABILITIES[cap].includes(role))
              return (
                <tr key={role} className="transition-colors duration-200 hover:bg-mist/40">
                  <td className="px-3 py-2 font-medium text-ink">
                    {role}
                    {override && (
                      <Badge tone="warning" className="ml-2">
                        overridden
                      </Badge>
                    )}
                  </td>
                  {CAPABILITIES.map((cap) => {
                    const granted = effective.includes(cap)
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
                  {canEdit && (
                    <td className="px-3 py-2">
                      <RoleCapabilityEditor role={role} capabilities={CAPABILITIES} effectiveCapabilities={effective} hasOverride={!!override} />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
