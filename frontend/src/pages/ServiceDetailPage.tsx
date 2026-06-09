import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getDeployments, getService, listPreviewEnvs } from '../api/client'
import { Spinner } from '../components/Spinner'
import type { Deployment, PreviewEnvironment, RollbackNavigationState, Service } from '../types'

const IDENTITY_KEY = 'dcp_identity'

interface Identity {
  name: string
  role: string
}

function loadIdentity(): Identity {
  try {
    const raw = sessionStorage.getItem(IDENTITY_KEY)
    if (raw) return JSON.parse(raw) as Identity
  } catch { /* ignore */ }
  return { name: '', role: 'engineer' }
}

function saveIdentity(id: Identity) {
  sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(id))
}

function shortSha(sha: string) {
  return sha.substring(0, 7)
}

function deriveImage(repo: string, sha: string) {
  const lower = repo.toLowerCase()
  return `ghcr.io/${lower}:sha-${shortSha(sha)}`
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface RollbackForm {
  targetImage: string
  containerName: string
  environment: string
  reason: string
}

export function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [service, setService] = useState<Service | null>(null)
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [previews, setPreviews] = useState<PreviewEnvironment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [identity, setIdentity] = useState<Identity>(loadIdentity)
  const [environment, setEnvironment] = useState('production')

  // Active rollback form state
  const [selectedDeploy, setSelectedDeploy] = useState<Deployment | null>(null)
  const [form, setForm] = useState<RollbackForm>({
    targetImage: '',
    containerName: 'app',
    environment: 'production',
    reason: '',
  })
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([getService(id), getDeployments(id, environment), listPreviewEnvs(id)])
      .then(([svcRes, depRes, previewRes]) => {
        setService(svcRes.service)
        setDeployments(depRes.deployments)
        setPreviews(previewRes.previews)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id, environment])

  function handleSelectDeploy(dep: Deployment) {
    if (!service) return
    setSelectedDeploy(dep)
    setForm({
      targetImage: deriveImage(service.repo, dep.sha),
      containerName: 'app',
      environment,
      reason: '',
    })
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  function handleIdentityChange(field: keyof Identity, value: string) {
    const next = { ...identity, [field]: value }
    setIdentity(next)
    saveIdentity(next)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedDeploy || !service || !identity.name.trim() || !form.reason.trim()) return

    const state: RollbackNavigationState = {
      serviceId: service.id,
      serviceName: service.name,
      targetDeployment: selectedDeploy,
      targetImage: form.targetImage,
      containerName: form.containerName,
      environment: form.environment,
      requestedBy: identity.name.trim(),
      requestedByRole: identity.role,
      reason: form.reason.trim(),
    }

    navigate('/rollback/preview', { state })
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Spinner label="Loading service..." />
      </div>
    )
  }

  if (error || !service) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? 'Service not found'}
        </div>
        <Link to="/" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← Back to Services
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          ← Services
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-600 font-medium">{service.name}</span>
      </div>

      {/* Service info + identity */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            {service.name}
            {service.tags['tier'] === 'critical' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                critical
              </span>
            )}
          </h2>
          <dl className="space-y-1.5 text-sm">
            <Row label="Owner" value={service.owner} />
            <Row label="Repo" value={service.repo} mono />
            <Row label="Namespace" value={service.namespace} mono />
            <Row label="Deployment" value={service.deployment} mono />
            {service.onCall && <Row label="On-call" value={service.onCall} />}
            {service.runbookUrl && (
              <div className="flex items-center gap-2">
                <dt className="w-24 text-gray-400 shrink-0">Runbook</dt>
                <dd>
                  <a
                    href={service.runbookUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline truncate"
                  >
                    Link
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">
            Acting as
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Your name</label>
              <input
                type="text"
                value={identity.name}
                onChange={(e) => handleIdentityChange('name', e.target.value)}
                placeholder="e.g. Jane Smith"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role</label>
              <select
                value={identity.role}
                onChange={(e) => handleIdentityChange('role', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="engineer">Engineer</option>
                <option value="senior-engineer">Senior Engineer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Auth is not wired up yet — this simulates your identity for policy checks.
          </p>
        </div>
      </div>

      {/* Deployment history */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Deployment History</h2>
          <div className="flex gap-2">
            {(['production', 'staging'] as const).map((env) => (
              <button
                key={env}
                onClick={() => { setEnvironment(env); setSelectedDeploy(null) }}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  environment === env
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
              >
                {env}
              </button>
            ))}
          </div>
        </div>

        {deployments.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No deployments found in <strong>{environment}</strong>. GitHub Deployments API
            returns entries created via the Deployments API or environment-linked Actions workflows.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {deployments.map((dep, i) => (
              <DeploymentRow
                key={dep.id}
                deployment={dep}
                isCurrent={i === 0}
                isSelected={selectedDeploy?.id === dep.id}
                onSelect={() => handleSelectDeploy(dep)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview Environments */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Preview Environments</h2>
            <p className="text-xs text-gray-400 mt-0.5">Ephemeral sandboxes — test any commit without touching staging or prod</p>
          </div>
          <Link
            to="/preview-env"
            state={{ service, commitSha: selectedDeploy?.sha, branch: 'main' }}
            className="text-xs font-medium px-3 py-1.5 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors"
          >
            + Create Preview
          </Link>
        </div>

        {previews.filter((p) => p.status !== 'destroyed').length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-gray-400">
            No active previews.{' '}
            <Link
              to="/preview-env"
              state={{ service }}
              className="text-blue-600 hover:underline"
            >
              Create one →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {previews
              .filter((p) => p.status !== 'destroyed')
              .map((p) => (
                <div key={p.id} className="px-5 py-3 flex items-center gap-4">
                  <PreviewStatusDot status={p.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-gray-700">
                      {p.commitSha.substring(0, 7)}{' '}
                      <span className="text-gray-400 font-sans">— {p.branch}</span>
                    </p>
                    {p.status === 'running' ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline truncate block">
                        {p.url}
                      </a>
                    ) : (
                      <p className="text-xs text-gray-400 truncate">{p.url}</p>
                    )}
                  </div>
                  <PreviewStatusBadge status={p.status} />
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Rollback form — appears when a deploy is selected */}
      {selectedDeploy && (
        <div ref={formRef} className="bg-white rounded-lg border-2 border-blue-200 shadow-sm">
          <div className="px-5 py-4 border-b border-blue-100 bg-blue-50 rounded-t-lg">
            <h2 className="font-semibold text-blue-900">
              Roll back {service.name} to{' '}
              <span className="font-mono">{shortSha(selectedDeploy.sha)}</span>
            </h2>
            <p className="text-sm text-blue-700 mt-0.5">
              {selectedDeploy.message || 'No commit message'} — by {selectedDeploy.author},{' '}
              {formatDate(selectedDeploy.deployedAt)}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Target image</label>
                <input
                  type="text"
                  value={form.targetImage}
                  onChange={(e) => setForm((f) => ({ ...f, targetImage: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Derived from SHA. Edit if your registry differs.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Container name</label>
                  <input
                    type="text"
                    value={form.containerName}
                    onChange={(e) => setForm((f) => ({ ...f, containerName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Environment</label>
                  <select
                    value={form.environment}
                    onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="production">production</option>
                    <option value="staging">staging</option>
                    <option value="development">development</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={2}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Elevated error rate on /checkout after this deploy, rolling back to restore stability"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                required
              />
            </div>

            {!identity.name.trim() && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Set your name in the "Acting as" section above before previewing.
              </p>
            )}

            <div className="flex justify-between items-center pt-1">
              <button
                type="button"
                onClick={() => setSelectedDeploy(null)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!identity.name.trim() || !form.reason.trim()}
                className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Preview Rollback →
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function DeploymentRow({
  deployment,
  isCurrent,
  isSelected,
  onSelect,
}: {
  deployment: Deployment
  isCurrent: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={`px-5 py-3.5 flex items-center gap-4 ${
        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
      } transition-colors`}
    >
      <div className="font-mono text-sm font-semibold text-gray-800 w-16 shrink-0">
        {shortSha(deployment.sha)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">
          {deployment.message || <span className="text-gray-400 italic">No message</span>}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {deployment.author} · {formatDate(deployment.deployedAt)}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {isCurrent ? (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">
            current
          </span>
        ) : (
          <button
            onClick={onSelect}
            className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors ${
              isSelected
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'
            }`}
          >
            {isSelected ? 'Selected' : 'Roll back to this'}
          </button>
        )}
      </div>
    </div>
  )
}

function PreviewStatusDot({ status }: { status: PreviewEnvironment['status'] }) {
  const color: Record<string, string> = {
    creating: 'bg-yellow-400 animate-pulse',
    running: 'bg-green-400',
    destroying: 'bg-orange-400 animate-pulse',
    destroyed: 'bg-gray-300',
    failed: 'bg-red-400',
  }
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color[status] ?? 'bg-gray-300'}`} />
}

function PreviewStatusBadge({ status }: { status: PreviewEnvironment['status'] }) {
  const styles: Record<string, string> = {
    creating: 'bg-yellow-100 text-yellow-700',
    running: 'bg-green-100 text-green-700',
    destroying: 'bg-orange-100 text-orange-700',
    destroyed: 'bg-gray-100 text-gray-500',
    failed: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <dt className="w-24 text-gray-400 shrink-0">{label}</dt>
      <dd className={`text-gray-700 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
