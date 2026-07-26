import type { ReactNode } from 'react'

export default function FormSection({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
}
