import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  createPreviewEnv,
  destroyPreviewEnv,
  getPreviewEnv,
  listPreviewEnvs,
} from '../api/client'
import { Spinner } from '../components/Spinner'
import type { PreviewEnvironment, Service } from '../types'

const IDENTITY_KEY = 'dcp_identity'

function loadName(): string {
  try {
    const raw = sessionStorage.getItem(IDENTITY_KEY)
    if (raw) return (JSON.parse(raw) as { name: string }).name ?? ''
  } catch { /* ignore */ }
  return ''
}

function shortSha(sha: string) {
  return sha.substring(0, 7)
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StatusBadge({ status }: { status: PreviewEnvironment['status'] }) {
  const styles: Record<string, string> = {
    creating: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    running: 'bg-green-100 text-green-700 border-green-200',
    destroying: 'bg-orange-100 text-orange-700 border-orange-200',
    destroyed: 'bg-gray-100 text-gray-500 border-gray-200',
    failed: 'bg-red-100 text-red-700 border-red-200',
  }
  const dots: Record<string, string> = {
    creating: 'bg-yellow-400',
    running: 'bg-green-400',
    destroying: 'bg-orange-400',
    destroyed: 'bg-gray-400',
    failed: 'bg-red-400',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded border ${styles[status] ?? styles.failed}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status] ?? dots.failed} ${status === 'creating' || status === 'destroying' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  )
}

function deriveImage(repo: string, sha: string) {
  return `ghcr.io/${repo.toLowerCase()}:sha-${shortSha(sha)}`
}

interface LocationState {
  service?: Service
  commitSha?: string
  branch?: string
}

export function PreviewEnvsPage() {
  const location = useLocation()
  const locationState = (location.state ?? {}) as LocationState
  const service = locationState.service

  const [previews, setPreviews] = useState<PreviewEnvironment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [showForm, setShowForm] = useState(!!locationState.commitSha)
  const [branch, setBranch] = useState(locationState.branch ?? 'main')
  const [commitSha, setCommitSha] = useState(locationState.commitSha ?? '')
  const [createdBy, setCreatedBy] = useState(loadName)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const formRef = useRef<HTMLDivElement>(null)

  // Poll interval ref for status updates
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startPolling(ids: string[]) {
    if (pollRef.current) clearInterval(pollRef.current)
    if (ids.length === 0) return

    pollRef.current = setInterval(async () => {
      const updates = await Promise.allSettled(ids.map((id) => getPreviewEnv(id)))
      setPreviews((prev) => {
        const next = [...prev]
        updates.forEach((result, i) => {
          if (result.status === 'fulfilled') {
            const idx = next.findIndex((p) => p.id === ids[i])
            if (idx !== -1) next[idx] = result.value.preview
          }
        })
        return next
      })
      // Stop polling if all are settled
      const stillTransient = ids.filter((id) => {
        const p = previews.find((x) => x.id === id)
        return p?.status === 'creating' || p?.status === 'destroying'
      })
      if (stillTransient.length === 0 && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }, 2000)
  }

  useEffect(() => {
    const serviceId = service?.id
    listPreviewEnvs(serviceId)
      .then((res) => setPreviews(res.previews))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [service?.id])

  // Watch for transient previews and start polling
  useEffect(() => {
    const transient = previews.filter(
      (p) => p.status === 'creating' || p.status === 'destroying'
    )
    if (transient.length > 0) {
      startPolling(transient.map((p) => p.id))
    }
  }, [previews.map((p) => p.id + p.status).join(',')])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!service || !commitSha.trim() || !createdBy.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const image = deriveImage(service.repo, commitSha.trim())
      const { preview } = await createPreviewEnv({
        serviceId: service.id,
        branch: branch.trim() || 'main',
        commitSha: commitSha.trim(),
        image,
        createdBy: createdBy.trim(),
      })
      setPreviews((prev) => [preview, ...prev])
      setShowForm(false)
      setCommitSha('')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create preview')
    } finally {
      setCreating(false)
    }
  }

  async function handleDestroy(id: string) {
    if (!createdBy.trim()) return
    setPreviews((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'destroying' } : p)))
    try {
      const { preview } = await destroyPreviewEnv(id, createdBy.trim())
      setPreviews((prev) => prev.map((p) => (p.id === id ? preview : p)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to destroy preview')
    }
  }

  const backTo = service ? `/services/${service.id}` : '/'
  const backLabel = service ? `← ${service.name}` : '← Services'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to={backTo} className="text-sm text-blue-600 hover:underline">
            {backLabel}
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-600 font-medium">Preview Environments</span>
        </div>
        {service && !showForm && (
          <button
            onClick={() => {
              setShowForm(true)
              setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
            }}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            + Create Preview
          </button>
        )}
      </div>

      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {service ? `${service.name} — ` : ''}Preview Environments
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Ephemeral sandboxes for testing specific commits without touching staging or production.
        </p>
      </div>

      {/* Create form */}
      {showForm && service && (
        <div ref={formRef} className="bg-white rounded-lg border-2 border-blue-200 shadow-sm">
          <div className="px-5 py-4 border-b border-blue-100 bg-blue-50 rounded-t-lg">
            <h2 className="font-semibold text-blue-900">Create Preview Environment</h2>
            <p className="text-sm text-blue-700 mt-0.5">
              Spins up an isolated copy of <strong>{service.name}</strong> at a specific commit.
            </p>
          </div>
          <form onSubmit={handleCreate} className="px-5 py-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Branch <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Commit SHA <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={commitSha}
                  onChange={(e) => setCommitSha(e.target.value)}
                  placeholder="e.g. 9018480"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Short or full SHA from deployment history.</p>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Your name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {createError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {createError}
              </p>
            )}

            <div className="flex justify-between items-center pt-1">
              <button
                type="button"
                onClick={() => { setShowForm(false); setCreateError(null) }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !commitSha.trim() || !createdBy.trim()}
                className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {creating && <Spinner label="" />}
                {creating ? 'Creating...' : 'Create Preview Environment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Preview list */}
      {loading ? (
        <Spinner label="Loading previews..." />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : previews.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-12 text-center">
          <p className="text-gray-400 text-sm">No active preview environments.</p>
          {service && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              Create your first preview →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {previews.map((p) => (
            <PreviewCard
              key={p.id}
              preview={p}
              onDestroy={() => handleDestroy(p.id)}
              destroyerName={createdBy}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PreviewCard({
  preview,
  onDestroy,
  destroyerName,
}: {
  preview: PreviewEnvironment
  onDestroy: () => void
  destroyerName: string
}) {
  const canDestroy = preview.status === 'running' || preview.status === 'failed' || preview.status === 'creating'

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={preview.status} />
            <span className="font-mono text-sm font-semibold text-gray-800">
              {shortSha(preview.commitSha)}
            </span>
            <span className="text-xs text-gray-400">
              branch: <span className="font-mono">{preview.branch}</span>
            </span>
          </div>

          <div className="mt-2 space-y-1">
            {preview.status === 'running' ? (
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-blue-600 hover:underline font-mono break-all"
              >
                {preview.url}
              </a>
            ) : (
              <span className="text-sm text-gray-400 font-mono">{preview.url}</span>
            )}
            <div className="text-xs text-gray-400 flex flex-wrap gap-3 mt-1">
              <span>Namespace: <span className="font-mono">{preview.namespace}</span></span>
              <span>Created by: {preview.createdBy}</span>
              <span>{formatDate(preview.createdAt)}</span>
            </div>
            {preview.error && (
              <p className="text-xs text-red-600 mt-1">{preview.error}</p>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {canDestroy && (
            <button
              onClick={onDestroy}
              disabled={preview.status === 'destroying' || !destroyerName.trim()}
              className="text-xs font-medium px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {preview.status === 'destroying' ? 'Destroying...' : 'Destroy'}
            </button>
          )}
          {preview.status === 'destroyed' && (
            <span className="text-xs text-gray-400">
              Destroyed {preview.destroyedBy ? `by ${preview.destroyedBy}` : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
