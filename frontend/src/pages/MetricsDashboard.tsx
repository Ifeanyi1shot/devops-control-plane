import { useEffect, useState } from 'react'
import { type MetricsData, getMetrics } from '../api/client'
import { Spinner } from '../components/Spinner'

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatMttr(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 1) return '< 1m'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

// ── Simple bar chart built with divs — no external library ────────────────────
function BarChart({
  data,
  color = 'bg-blue-500',
  label,
  emptyMessage,
}: {
  data: Array<{ date: string; count: number }>
  color?: string
  label: string
  emptyMessage: string
}) {
  const max = Math.max(...data.map((d) => d.count), 1)
  const hasData = data.some((d) => d.count > 0)

  // Show last 14 days to keep bars readable
  const visible = data.slice(-14)

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">{label}</p>
      {!hasData ? (
        <div className="h-32 flex items-center justify-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
          {emptyMessage}
        </div>
      ) : (
        <div className="flex items-end gap-1 h-32">
          {visible.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div
                className={`w-full rounded-t ${d.count > 0 ? color : 'bg-gray-100'} transition-all`}
                style={{ height: `${Math.max((d.count / max) * 100, d.count > 0 ? 8 : 2)}%` }}
              />
              {/* Tooltip */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                {formatDate(d.date)}: {d.count}
              </div>
            </div>
          ))}
        </div>
      )}
      {hasData && (
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">{formatDate(visible[0]?.date ?? '')}</span>
          <span className="text-xs text-gray-400">{formatDate(visible[visible.length - 1]?.date ?? '')}</span>
        </div>
      )}
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Action type badge ─────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  rollback:    'bg-orange-100 text-orange-700',
  deploy:      'bg-blue-100 text-blue-700',
  preview_env: 'bg-purple-100 text-purple-700',
  restart:     'bg-yellow-100 text-yellow-700',
  scale:       'bg-green-100 text-green-700',
}

export function MetricsDashboard() {
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMetrics()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load metrics'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Spinner label="Loading metrics..." />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? 'No data'}
        </div>
      </div>
    )
  }

  const { summary, deploymentFrequency, mttrTrend, topActors, actionBreakdown } = data

  const cfr = summary.changeFailureRate
  const cfrColor = cfr === 0 ? 'text-green-600' : cfr < 15 ? 'text-yellow-600' : 'text-red-600'

  const deployFreq = summary.deploymentsLast7Days > 0
    ? `${(summary.deploymentsLast7Days / 7).toFixed(1)}/day (last 7d)`
    : 'No activity yet'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">DORA Metrics</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Engineering performance based on actions recorded in the audit log.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Deployment Frequency"
          value={summary.deploymentsLast7Days === 0 ? '—' : `${summary.deploymentsLast7Days}`}
          sub={deployFreq}
        />
        <KpiCard
          label="Mean Time to Recovery"
          value={formatMttr(summary.avgMttrMinutes)}
          sub={summary.avgMttrMinutes !== null ? 'avg rollback duration' : 'No rollbacks yet'}
          accent={
            summary.avgMttrMinutes === null ? undefined
            : summary.avgMttrMinutes < 15 ? 'text-green-600'
            : summary.avgMttrMinutes < 60 ? 'text-yellow-600'
            : 'text-red-600'
          }
        />
        <KpiCard
          label="Change Failure Rate"
          value={summary.totalCompleted === 0 ? '—' : `${cfr}%`}
          sub={`${summary.totalRollbacks} rollbacks / ${summary.totalCompleted} total`}
          accent={summary.totalCompleted === 0 ? undefined : cfrColor}
        />
        <KpiCard
          label="Total Actions"
          value={String(summary.totalCompleted)}
          sub={`${summary.deploymentsLast30Days} in last 30 days`}
        />
      </div>

      {/* Charts row */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <BarChart
            data={deploymentFrequency}
            color="bg-blue-500"
            label="Completed actions per day — last 14 days"
            emptyMessage="No completed actions yet"
          />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <BarChart
            data={mttrTrend}
            color="bg-orange-400"
            label="MTTR per day (minutes) — rollbacks only"
            emptyMessage="No rollbacks completed yet"
          />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Action breakdown */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Action Breakdown</h2>
          {actionBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400">No completed actions yet.</p>
          ) : (
            <div className="space-y-3">
              {actionBreakdown.map(({ actionType, count }) => {
                const pct = Math.round((count / summary.totalCompleted) * 100)
                return (
                  <div key={actionType}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${TYPE_COLORS[actionType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {actionType}
                      </span>
                      <span className="text-xs text-gray-500">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${TYPE_COLORS[actionType]?.split(' ')[0].replace('bg-', 'bg-') ?? 'bg-gray-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top actors */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Most Active</h2>
          {topActors.length === 0 ? (
            <p className="text-sm text-gray-400">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {topActors.map(({ actor, count }, i) => (
                <div key={actor} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600 shrink-0">
                    {actor.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-700 flex-1 truncate">{actor}</span>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded px-2 py-0.5">
                    {count} actions
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DORA guide */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-5 py-4">
        <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">DORA Benchmarks</h3>
        <div className="grid sm:grid-cols-3 gap-3 text-xs text-blue-800">
          <div>
            <p className="font-medium">Deployment Frequency</p>
            <p className="text-blue-600">Elite: multiple/day · High: weekly · Medium: monthly</p>
          </div>
          <div>
            <p className="font-medium">Mean Time to Recovery</p>
            <p className="text-blue-600">Elite: &lt; 1h · High: &lt; 1d · Medium: &lt; 1 week</p>
          </div>
          <div>
            <p className="font-medium">Change Failure Rate</p>
            <p className="text-blue-600">Elite: 0–15% · High: 0–15% · Medium: 0–30%</p>
          </div>
        </div>
      </div>
    </div>
  )
}
