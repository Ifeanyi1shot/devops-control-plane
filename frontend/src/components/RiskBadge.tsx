import type { RiskLevel } from '../types'

const styles: Record<RiskLevel, string> = {
  low: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
}

const labels: Record<RiskLevel, string> = {
  low: 'LOW RISK',
  medium: 'MEDIUM RISK',
  high: 'HIGH RISK',
  critical: 'CRITICAL RISK',
}

interface Props {
  level: RiskLevel
  size?: 'sm' | 'md'
}

export function RiskBadge({ level, size = 'md' }: Props) {
  const base = size === 'md'
    ? 'px-2.5 py-1 text-xs font-bold tracking-wide rounded border'
    : 'px-2 py-0.5 text-xs font-semibold rounded border'
  return (
    <span className={`${base} ${styles[level]}`}>
      {labels[level]}
    </span>
  )
}
