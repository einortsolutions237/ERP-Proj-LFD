export default function DashboardCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-mist bg-surface p-4 shadow-[var(--shadow-card)]">
      <h2 className="mb-3 text-lg font-medium text-ink">{title}</h2>
      {children}
    </div>
  )
}
