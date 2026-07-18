import type { IconComponent } from './icons'

type Tone = 'marine' | 'brass' | 'danger' | 'warning' | 'info'

const TONE_STYLES: Record<Tone, { badgeBg: string; badgeIcon: string; wash: string }> = {
  marine: { badgeBg: 'bg-marine/10', badgeIcon: 'text-marine', wash: 'bg-marine/5' },
  brass: { badgeBg: 'bg-brass/10', badgeIcon: 'text-brass', wash: 'bg-brass/5' },
  danger: { badgeBg: 'bg-danger/10', badgeIcon: 'text-danger', wash: 'bg-danger/5' },
  warning: { badgeBg: 'bg-warning/10', badgeIcon: 'text-warning', wash: 'bg-warning/5' },
  info: { badgeBg: 'bg-info/10', badgeIcon: 'text-info', wash: 'bg-info/5' },
}

export default function DashboardCard({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string
  icon: IconComponent
  tone: Tone
  children: React.ReactNode
}) {
  const styles = TONE_STYLES[tone]
  return (
    <div className={`rounded-2xl border border-mist p-4 shadow-[var(--shadow-card)] ${styles.wash}`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${styles.badgeBg}`}>
          <Icon className={`h-4 w-4 ${styles.badgeIcon}`} />
        </span>
        <h2 className="text-lg font-medium text-ink">{title}</h2>
      </div>
      {children}
    </div>
  )
}
