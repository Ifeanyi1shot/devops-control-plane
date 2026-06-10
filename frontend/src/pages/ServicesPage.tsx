import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getServices } from '../api/client'
import { Spinner } from '../components/Spinner'
import type { Service } from '../types'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getServices()
      .then((r) => setServices(r.services))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load services'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Services</h1>
        <p className="mt-1 text-sm text-gray-500">
          Select a service to view deployment history and execute operational actions.
        </p>
      </div>

      {loading && <Spinner label="Loading services..." />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {!loading && !error && services.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-gray-500">No services registered.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((svc) => (
          <ServiceCard key={svc.id} service={svc} />
        ))}
      </div>
    </div>
  )
}

function ServiceCard({ service }: { service: Service }) {
  const tier = service.tags['tier']
  const team = service.tags['team']
  const locked = !!service.lock

  return (
    <Link
      to={`/services/${service.id}`}
      className={`block bg-white rounded-lg border shadow-sm p-5 hover:shadow-md transition-all ${
        locked
          ? 'border-orange-300 hover:border-orange-400'
          : 'border-gray-200 hover:border-blue-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h2 className="font-semibold text-gray-900 leading-tight">{service.name}</h2>
        <div className="flex items-center gap-1.5 shrink-0">
          {locked && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200 flex items-center gap-1">
              🔒 locked
            </span>
          )}
          {tier === 'critical' && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
              critical
            </span>
          )}
        </div>
      </div>

      {locked && service.lock && (
        <div className="mb-3 text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded px-2 py-1.5">
          <span className="font-medium">{service.lock.lockedBy}</span>: {service.lock.reason}
          <span className="text-orange-400 ml-1">· {timeAgo(service.lock.lockedAt)}</span>
        </div>
      )}

      <div className="space-y-1.5 text-sm text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">owner</span>
          <span className="font-medium text-gray-700">{service.owner}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="text-gray-400">repo</span>
          <span className="text-gray-600">{service.repo}</span>
        </div>
        {service.onCall && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">on-call</span>
            <span className="text-gray-700">{service.onCall}</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {team && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
            {team}
          </span>
        )}
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
          {service.namespace}
        </span>
      </div>
    </Link>
  )
}
