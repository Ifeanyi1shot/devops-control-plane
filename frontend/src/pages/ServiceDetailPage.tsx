import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { type RollbackAnalysis, analyzeRollback, getDeployments, getService, listPreviewEnvs, lockService, unlockService } from '../api/client'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import type { Deployment, PreviewEnvironment, RollbackNavigationState, Service, ServiceLock } from '../types'

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

  const { user: authUser } = useAuth()
  const [identity, setIdentity] = useState<Identity>(loadIdentity)
  const [environment, setEnvironment] = useState('production')

  // Sync identity from GitHub auth when user logs in
  useEffect(() => {
    if (authUser) {
      const next = { name: authUser.name, role: authUser.role }
      setIdentity(next)
      saveIdentity(next)
    }
  }, [authUser])

  // Lock state
  const [lock, setLock] = useState<ServiceLock | null | undefined>(undefined)
  const [lockReason, setLockReason] = useState('')
  const [lockLoading, setLockLoading] = useState(false)
  const [lockError, setLockError] = useState<string | null>(null)

  // AI analysis state
  const [analysis, setAnalysis] = useState<RollbackAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

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
        setLock(svcRes.service.lock ?? null)
        setDeployments(depRes.deployments)
        setPreviews(previewRes.previews)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id, environment])

  const lockActor = authUser?.login ?? authUser?.name ?? (identity.name || 'unknown')

  async function handleLock() {
    if (!service || !lockReason.trim()) return
    setLockLoading(true)
    setLockError(null)
    try {
      const res = await lockService(service.id, lockActor, lockReason.trim())
      setLock(res.lock)
      setLockReason('')
    } catch (e) {
      setLockError(e instanceof Error ? e.message : 'Failed to lock service')
    } finally {
      setLockLoading(false)
    }
  }

  async function handleUnlock() {
    if (!service) return
    setLockLoading(true)
    setLockError(null)
    try {
      await unlockService(service.id, lockActor)
      setLock(null)
    } catch (e) {
      setLockError(e instanceof Error ? e.message : 'Failed to unlock service')
    } finally {
      setLockLoading(false)
    }
  }

  function handleSelectDeploy(dep: Deployment) {
    if (!service) return
    setSelectedDeploy(dep)
    setAnalysis(null)
    setAnalysisError(null)
    setForm({
      targetImage: deriveImage(service.repo, dep.sha),
      containerName: 'app',
      environment,
      reason: '',
    })
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  async function analyzeSelected() {
    if (!selectedDeploy || !service || deployments.length === 0) return
    const currentSha = deployments[0]?.sha ?? ''
    if (!currentSha || currentSha === selectedDeploy.sha) return
    setAnalyzing(true)
    setAnalysis(null)
    setAnalysisError(null)
    try {
      const res = await analyzeRollback(service.id, currentSha, selectedDeploy.sha, form.reason)
      setAnalysis(res.analysis)
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
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
          {authUser ? (
            <div className="flex items-center gap-3">
              <img
                src={authUser.avatarUrl}
                alt={authUser.name}
                className="w-10 h-10 rounded-full border border-gray-200"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{authUser.name}</p>
                <p className="text-xs text-gray-400">
                  @{authUser.login} · <span className="font-medium text-gray-600">{authUser.role}</span>
                </p>
              </div>
              <span className="ml-auto text-xs text-green-600 bg-green-50 border border-green-200 rounded px-2 py-0.5">
                GitHub verified
              </span>
            </div>
          ) : (
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
              <a
                href="/auth/github"
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Login with GitHub for verified identity
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Deployment Lock banner */}
      <div className={`rounded-lg border shadow-sm ${lock ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-white'}`}>
        <div className="px-5 py-4">
          {lock ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none mt-0.5">🔒</span>
                  <div>
                    <p className="font-semibold text-orange-900 text-sm">
                      Service locked by <span className="font-bold">{lock.lockedBy}</span>
                    </p>
                    <p className="text-sm text-orange-700 mt-0.5">"{lock.reason}"</p>
                    <p className="text-xs text-orange-400 mt-1">{formatDate(lock.lockedAt)}</p>
                  </div>
                </div>
                <button
                  onClick={handleUnlock}
                  disabled={lockLoading}
                  className="shrink-0 text-xs font-medium px-3 py-1.5 rounded border border-orange-300 text-orange-700 hover:bg-orange-100 disabled:opacity-50 transition-colors"
                >
                  {lockLoading ? 'Unlocking…' : 'Unlock'}
                </button>
              </div>
              {lockError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {lockError}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700 mb-1">Lock this service</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={lockReason}
                    onChange={(e) => setLockReason(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLock()}
                    placeholder="Reason (e.g. active incident, freeze window)"
                    className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                  />
                  <button
                    onClick={handleLock}
                    disabled={lockLoading || !lockReason.trim()}
                    className="shrink-0 text-xs font-medium px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:border-orange-400 hover:text-orange-700 disabled:opacity-40 transition-colors"
                  >
                    {lockLoading ? 'Locking…' : '🔒 Lock'}
                  </button>
                </div>
              </div>
              {lockError && (
                <p className="text-xs text-red-600">{lockError}</p>
              )}
            </div>
          )}
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

      {/* AI analysis panel — appears when a deploy is selected */}
      {selectedDeploy && (
        <div className="bg-white rounded-lg border border-purple-200 shadow-sm">
          <div className="px-5 py-4 border-b border-purple-100 bg-purple-50 rounded-t-lg flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-purple-900 flex items-center gap-2">
                <span>AI Rollback Assistant</span>
                <span className="text-xs font-normal text-purple-500">powered by Claude</span>
              </h2>
              <p className="text-xs text-purple-600 mt-0.5">
                Analyzes the diff and tells you what will change, what's at risk, and what to verify.
              </p>
            </div>
            {!analysis && !analyzing && (
              <button
                onClick={analyzeSelected}
                className="text-sm font-medium px-4 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors shrink-0"
              >
                Analyze with AI
              </button>
            )}
          </div>

          <div className="px-5 py-4">
            {analyzing && (
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <Spinner label="" />
                <span>Claude is analyzing the diff...</span>
              </div>
            )}
            {analysisError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {analysisError}
              </div>
            )}
            {!analysis && !analyzing && !analysisError && (
              <p className="text-sm text-gray-400">
                Click "Analyze with AI" to get a risk assessment before proceeding.
              </p>
            )}
            {analysis && <AnalysisResult analysis={analysis} onReanalyze={analyzeSelected} />}
          </div>
        </div>
      )}

      {/* Rollback form — appears when a deploy is selected */}
      {selectedDeploy && (
        <div ref={formRef} className={`bg-white rounded-lg border-2 shadow-sm relative ${lock ? 'border-orange-200 opacity-60 pointer-events-none' : 'border-blue-200'}`}>
          {lock && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-orange-50/80">
              <p className="text-sm font-semibold text-orange-800">
                🔒 Rollbacks are blocked — service is locked
              </p>
            </div>
          )}
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

const SOURCE_LABEL: Record<string, { label: string; title: string }> = {
  deployment: { label: 'deploy', title: 'From GitHub Deployments API' },
  run:        { label: 'run',    title: 'From GitHub Actions workflow run' },
  commit:     { label: 'commit', title: 'From branch commit history' },
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
  const src = SOURCE_LABEL[deployment.source] ?? SOURCE_LABEL['commit']

  return (
    <div
      onClick={isCurrent ? undefined : onSelect}
      className={`px-5 py-3.5 flex items-center gap-3 transition-colors ${
        isCurrent
          ? ''
          : isSelected
            ? 'bg-blue-50'
            : 'hover:bg-gray-50 cursor-pointer'
      }`}
    >
      {/* Avatar */}
      {deployment.avatarUrl ? (
        <img
          src={deployment.avatarUrl}
          alt={deployment.author}
          className="w-7 h-7 rounded-full shrink-0 border border-gray-200"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-gray-200 shrink-0 flex items-center justify-center text-xs text-gray-500 font-medium">
          {deployment.author.charAt(0).toUpperCase()}
        </div>
      )}

      {/* SHA + external link icon */}
      <div className="w-20 shrink-0 flex items-center gap-1">
        <span className="font-mono text-sm font-semibold text-gray-800">
          {shortSha(deployment.sha)}
        </span>
        {deployment.commitUrl && (
          <a
            href={deployment.commitUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="View on GitHub"
            className="text-gray-400 hover:text-blue-500 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
          </a>
        )}
      </div>

      {/* Message + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">
          {deployment.message || <span className="text-gray-400 italic">No message</span>}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
          <span>{deployment.author}</span>
          <span>·</span>
          <span>{formatDate(deployment.deployedAt)}</span>
          <span>·</span>
          <span className="font-mono">{deployment.ref}</span>
          <span
            title={src?.title}
            className="text-gray-300 border border-gray-200 rounded px-1 py-px text-[10px]"
          >
            {src?.label}
          </span>
        </p>
      </div>

      {/* Status badge */}
      <div className="shrink-0">
        {isCurrent ? (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">
            current
          </span>
        ) : (
          <span className={`text-xs font-medium px-2 py-0.5 rounded border transition-colors ${
            isSelected
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-400 border-gray-200'
          }`}>
            {isSelected ? 'Selected ✓' : 'Roll back'}
          </span>
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

const RISK_STYLES: Record<string, { badge: string; border: string; bg: string }> = {
  low:      { badge: 'bg-green-100 text-green-700',   border: 'border-green-200', bg: 'bg-green-50' },
  medium:   { badge: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-200', bg: 'bg-yellow-50' },
  high:     { badge: 'bg-orange-100 text-orange-700', border: 'border-orange-200', bg: 'bg-orange-50' },
  critical: { badge: 'bg-red-100 text-red-700',       border: 'border-red-300',   bg: 'bg-red-50' },
}

function AnalysisResult({
  analysis,
  onReanalyze,
}: {
  analysis: RollbackAnalysis
  onReanalyze: () => void
}) {
  const style = RISK_STYLES[analysis.riskLevel] ?? RISK_STYLES['medium']

  return (
    <div className="space-y-4">
      {/* Risk level + summary */}
      <div className={`rounded-lg border ${style.border} ${style.bg} px-4 py-3`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide ${style.badge}`}>
            {analysis.riskLevel} risk
          </span>
          <span className="text-xs text-gray-500">{analysis.riskReason}</span>
        </div>
        <p className="text-sm text-gray-800">{analysis.summary}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Affected areas */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Affected Areas
          </h4>
          <ul className="space-y-1">
            {analysis.affectedAreas.map((area, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-gray-400 mt-0.5">•</span>
                {area}
              </li>
            ))}
          </ul>
        </div>

        {/* Verification steps */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            After Rollback, Verify
          </h4>
          <ol className="space-y-1">
            {analysis.verificationSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-gray-400 shrink-0 font-mono text-xs mt-0.5">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <button
        onClick={onReanalyze}
        className="text-xs text-purple-600 hover:underline"
      >
        Re-analyze
      </button>
    </div>
  )
}
