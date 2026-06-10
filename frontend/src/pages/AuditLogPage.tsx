import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { type AuditEntry, getAuditByService, getAuditLog, getServices } from '../api/client'
import { Spinner } from '../components/Spinner'
import type { Service } from '../types'

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function shortId(id: string) {
  return id.substring(0, 8)
}

const EVENT_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  'action.completed':              { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-400' },
  'action.approved':               { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-400' },
  'action.executing':              { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  'action.previewed':              { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400' },
  'action.failed':                 { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-400' },
  'action.denied':                 { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-400' },
  'action.rejected':               { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-400' },
  'rollback.k8s.patch.start':      { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-400' },
  'rollback.k8s.patch.complete':   { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-400' },
}

const DEFAULT_STYLE = { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' }

function EventBadge({ event }: { event: string }) {
  const style = EVENT_STYLES[event] ?? DEFAULT_STYLE
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {event}
    </span>
  )
}

function DetailPanel({ detail }: { detail: Record<string, unknown> }) {
  if (Object.keys(detail).length === 0) return null
  return (
    <pre className="mt-2 text-xs bg-slate-900 text-slate-300 rounded p-3 overflow-x-auto">
      {JSON.stringify(detail, null, 2)}
    </pre>
  )
}

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [selectedService, setSelectedService] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function fetchEntries(serviceId: string) {
    try {
      const res = serviceId === 'all'
        ? await getAuditLog(200)
        : await getAuditByService(serviceId, 100)
      setEntries(res.entries)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log')
    }
  }

  useEffect(() => {
    Promise.all([getAuditLog(200), getServices()])
      .then(([auditRes, svcRes]) => {
        setEntries(auditRes.entries)
        setServices(svcRes.services)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (live) {
      pollRef.current = setInterval(() => fetchEntries(selectedService), 5000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [live, selectedService])

  function handleServiceChange(serviceId: string) {
    setSelectedService(serviceId)
    setLoading(true)
    fetchEntries(serviceId).finally(() => setLoading(false))
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Complete record of every action and event across all services.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Live toggle */}
          <button
            onClick={() => setLive((v) => !v)}
            className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded border transition-colors ${
              live
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-green-400 animate-pulse' : 'bg-gray-300'}`} />
            {live ? 'Live' : 'Paused'}
          </button>

          {/* Refresh */}
          <button
            onClick={() => fetchEntries(selectedService)}
            className="text-xs font-medium px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:border-gray-400 bg-white transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-500">Filter by service:</label>
        <select
          value={selectedService}
          onChange={(e) => handleServiceChange(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {entries.length > 0 && (
          <span className="text-xs text-gray-400">{entries.length} entries</span>
        )}
      </div>

      {/* Entries */}
      {loading ? (
        <Spinner label="Loading audit log..." />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 px-5 py-12 text-center text-sm text-gray-400">
          No audit entries yet. Trigger a rollback or preview to see entries here.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm divide-y divide-gray-50">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
            >
              <div className="flex items-center gap-3 flex-wrap">
                {/* Timestamp */}
                <span className="text-xs text-gray-400 w-40 shrink-0 font-mono">
                  {formatDate(entry.timestamp)}
                </span>

                {/* Event badge */}
                <div className="shrink-0">
                  <EventBadge event={entry.event} />
                </div>

                {/* Actor */}
                <span className="text-sm text-gray-700 font-medium min-w-0 truncate">
                  {entry.actor}
                </span>

                {/* Service */}
                <Link
                  to={`/services/${entry.serviceId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-blue-600 hover:underline shrink-0"
                >
                  {entry.serviceId}
                </Link>

                {/* Action ID */}
                <span className="text-xs font-mono text-gray-400 ml-auto shrink-0">
                  action: {shortId(entry.actionId)}
                </span>
              </div>

              {/* Expanded detail */}
              {expandedId === entry.id && (
                <DetailPanel detail={entry.detail} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
