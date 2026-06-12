import { useEffect, useState } from 'react'
import {
  type PolicyFileInfo,
  type SimulatePolicyRequest,
  deletePolicyFile,
  getPolicyFile,
  getPolicyFiles,
  savePolicyFile,
  simulatePolicy,
} from '../api/client'
import { Spinner } from '../components/Spinner'
import type { PolicyDecision, PolicyFile, PolicyRule } from '../types'

const ACTION_TYPES = ['*', 'rollback', 'deploy', 'restart', 'scale', 'preview_env']
const ENVIRONMENTS = ['*', 'production', 'staging', 'development', 'preview']
const ROLES = ['*', 'engineer', 'senior-engineer', 'admin', 'developer']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function emptyRule(): PolicyRule {
  return {
    name: 'new-rule',
    description: '',
    match: { actionType: '*' },
    allow: true,
  }
}

// ── Multi-value tag input ─────────────────────────────────────────────────────

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function fromArray(arr: string[]): string | string[] | undefined {
  if (arr.length === 0) return undefined
  if (arr.includes('*')) return '*'
  return arr.length === 1 ? arr[0] : arr
}

function TagSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string | string[] | undefined
  onChange: (v: string | string[] | undefined) => void
}) {
  const selected = toArray(value)
  function toggle(opt: string) {
    if (opt === '*') { onChange('*'); return }
    const next = selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected.filter((x) => x !== '*'), opt]
    onChange(fromArray(next))
  }
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = selected.includes(opt) || (opt !== '*' && selected.includes('*'))
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                active
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Rule card ─────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  index,
  total,
  onChange,
  onDelete,
  onMove,
}: {
  rule: PolicyRule
  index: number
  total: number
  onChange: (r: PolicyRule) => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const [expanded, setExpanded] = useState(false)

  function patch(updates: Partial<PolicyRule>) {
    onChange({ ...rule, ...updates })
  }

  const matchSummary = [
    toArray(rule.match.actionType).join(', ') || '*',
    toArray(rule.match.environment).join(', ') || 'all envs',
    toArray(rule.match.role).join(', ') || 'all roles',
  ].join(' · ')

  return (
    <div className={`rounded-lg border shadow-sm ${rule.allow ? 'border-gray-200' : 'border-red-200'}`}>
      {/* Collapsed header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Reorder */}
        <div className="flex flex-col gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none"
            title="Move up"
          >▲</button>
          <button
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none"
            title="Move down"
          >▼</button>
        </div>

        <span className="text-xs font-mono text-gray-300 w-5 shrink-0">{index + 1}</span>

        <span
          className={`text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${
            rule.allow ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {rule.allow ? 'allow' : 'deny'}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{rule.name}</p>
          <p className="text-xs text-gray-400 truncate">{matchSummary}</p>
        </div>

        {rule.requireApproval && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
            needs approval
          </span>
        )}

        <span className="text-gray-400 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50 rounded-b-lg">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rule name</label>
              <input
                type="text"
                value={rule.name}
                onChange={(e) => patch({ name: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <input
                type="text"
                value={rule.description}
                onChange={(e) => patch({ description: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <TagSelect
              label="Action type"
              options={ACTION_TYPES}
              value={rule.match.actionType}
              onChange={(v) => patch({ match: { ...rule.match, actionType: v ?? '*' } })}
            />
            <TagSelect
              label="Environment"
              options={ENVIRONMENTS}
              value={rule.match.environment}
              onChange={(v) => patch({ match: { ...rule.match, environment: v } })}
            />
            <TagSelect
              label="Role"
              options={ROLES}
              value={rule.match.role}
              onChange={(v) => patch({ match: { ...rule.match, role: v } })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-500">Decision</span>
              <button
                type="button"
                onClick={() => patch({ allow: !rule.allow, requireApproval: rule.allow ? undefined : rule.requireApproval })}
                className={`text-xs font-bold px-3 py-1 rounded border transition-colors ${
                  rule.allow
                    ? 'bg-green-100 text-green-700 border-green-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300'
                    : 'bg-red-100 text-red-700 border-red-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300'
                }`}
              >
                {rule.allow ? 'ALLOW' : 'DENY'} — click to toggle
              </button>
            </label>

            {rule.allow && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rule.requireApproval ?? false}
                  onChange={(e) => patch({ requireApproval: e.target.checked, approverRole: e.target.checked ? (rule.approverRole ?? 'senior-engineer') : undefined })}
                  className="rounded border-gray-300"
                />
                <span className="text-xs text-gray-600">Requires approval</span>
              </label>
            )}

            {rule.requireApproval && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Approver role</span>
                <select
                  value={rule.approverRole ?? 'senior-engineer'}
                  onChange={(e) => patch({ approverRole: e.target.value })}
                  className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="senior-engineer">senior-engineer</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            )}
          </div>

          {/* Time restriction */}
          <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white">
            <p className="text-xs font-medium text-gray-600">Time restriction (optional)</p>
            <div>
              <p className="text-xs text-gray-500 mb-1">Deny on days</p>
              <div className="flex flex-wrap gap-1">
                {DAYS.map((day) => {
                  const active = rule.timeRestriction?.denyDays?.includes(day) ?? false
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const current = rule.timeRestriction?.denyDays ?? []
                        const next = active ? current.filter((d) => d !== day) : [...current, day]
                        patch({
                          timeRestriction: {
                            ...rule.timeRestriction,
                            denyDays: next.length ? next : undefined,
                          },
                        })
                      }}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        active
                          ? 'bg-red-100 text-red-700 border-red-300'
                          : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-gray-500">Deny after hour (0-23)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  placeholder="—"
                  value={rule.timeRestriction?.denyAfterHour ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                    patch({ timeRestriction: { ...rule.timeRestriction, denyAfterHour: v } })
                  }}
                  className="block w-20 border border-gray-300 rounded-md px-2 py-1 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Deny before hour (0-23)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  placeholder="—"
                  value={rule.timeRestriction?.denyBeforeHour ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                    patch({ timeRestriction: { ...rule.timeRestriction, denyBeforeHour: v } })
                  }}
                  className="block w-20 border border-gray-300 rounded-md px-2 py-1 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onDelete}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Delete rule
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Simulate panel ────────────────────────────────────────────────────────────

function SimulatePanel() {
  const [form, setForm] = useState<SimulatePolicyRequest>({
    type: 'rollback',
    serviceId: 'devops-control-plane',
    requestedBy: 'engineer@example.com',
    requestedByRole: 'engineer',
    environment: 'production',
    params: {},
  })
  const [result, setResult] = useState<{ decision: PolicyDecision; request: SimulatePolicyRequest } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setError(null)
    try {
      setResult(await simulatePolicy(form))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed')
    } finally {
      setLoading(false)
    }
  }

  const DECISION_STYLE = {
    allowed: 'bg-green-50 border-green-200 text-green-800',
    denied: 'bg-red-50 border-red-200 text-red-800',
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Test a hypothetical action against the current live policy — no action is created.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Action type</label>
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as SimulatePolicyRequest['type'] }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {['rollback', 'deploy', 'restart', 'scale', 'preview_env'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Environment</label>
          <select
            value={form.environment}
            onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {['production', 'staging', 'development', 'preview'].map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Role</label>
          <select
            value={form.requestedByRole}
            onChange={(e) => setForm((f) => ({ ...f, requestedByRole: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {['engineer', 'senior-engineer', 'admin', 'developer'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Requested by</label>
          <input
            type="text"
            value={form.requestedBy}
            onChange={(e) => setForm((f) => ({ ...f, requestedBy: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-slate-700 disabled:opacity-40 transition-colors"
      >
        {loading ? 'Simulating…' : 'Run Simulation'}
      </button>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
      )}

      {result && (
        <div className={`rounded-lg border p-4 space-y-2 ${result.decision.allowed ? DECISION_STYLE.allowed : DECISION_STYLE.denied}`}>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold uppercase ${result.decision.allowed ? 'text-green-700' : 'text-red-700'}`}>
              {result.decision.allowed ? '✓ Allowed' : '✗ Denied'}
            </span>
            {result.decision.requiresApproval && (
              <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded px-2 py-0.5">
                requires {result.decision.approverRole ?? 'approval'}
              </span>
            )}
          </div>
          <p className="text-sm">{result.decision.reason}</p>
          <p className="text-xs opacity-70">Matched rule: <span className="font-mono">{result.decision.matchedRule}</span></p>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PolicyEditorPage() {
  const [files, setFiles] = useState<PolicyFileInfo[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [policy, setPolicy] = useState<PolicyFile | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'rules' | 'simulate'>('rules')

  useEffect(() => {
    getPolicyFiles()
      .then((r) => {
        setFiles(r.files)
        if (r.files.length > 0) selectFile(r.files[0]!.filename)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load files'))
      .finally(() => setLoadingFiles(false))
  }, [])

  async function selectFile(filename: string) {
    setSelectedFile(filename)
    setLoadingFile(true)
    setDirty(false)
    setSaveMsg(null)
    try {
      const r = await getPolicyFile(filename)
      setPolicy(r.policy)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load file')
    } finally {
      setLoadingFile(false)
    }
  }

  async function handleSave() {
    if (!selectedFile || !policy) return
    setSaving(true)
    setSaveMsg(null)
    try {
      await savePolicyFile(selectedFile, policy)
      setDirty(false)
      setSaveMsg('Saved — policy engine reloaded')
      setTimeout(() => setSaveMsg(null), 3000)
      // Refresh file list rule counts
      const r = await getPolicyFiles()
      setFiles(r.files)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteFile(filename: string) {
    if (!confirm(`Delete ${filename}? This cannot be undone.`)) return
    try {
      await deletePolicyFile(filename)
      const r = await getPolicyFiles()
      setFiles(r.files)
      if (selectedFile === filename) {
        setSelectedFile(null)
        setPolicy(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  function updateRule(index: number, rule: PolicyRule) {
    if (!policy) return
    const rules = [...policy.rules]
    rules[index] = rule
    setPolicy({ ...policy, rules })
    setDirty(true)
  }

  function deleteRule(index: number) {
    if (!policy) return
    const rules = policy.rules.filter((_, i) => i !== index)
    setPolicy({ ...policy, rules })
    setDirty(true)
  }

  function moveRule(index: number, dir: -1 | 1) {
    if (!policy) return
    const rules = [...policy.rules]
    const target = index + dir
    if (target < 0 || target >= rules.length) return
    ;[rules[index], rules[target]] = [rules[target]!, rules[index]!]
    setPolicy({ ...policy, rules })
    setDirty(true)
  }

  function addRule() {
    if (!policy) return
    setPolicy({ ...policy, rules: [...policy.rules, emptyRule()] })
    setDirty(true)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Policy Editor</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage authorization rules for deployments and rollbacks. Rules are evaluated top-to-bottom — first match wins.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <div className="flex gap-6">
        {/* File sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Files</p>
          {loadingFiles ? (
            <Spinner label="Loading…" />
          ) : (
            files.map((f) => (
              <div key={f.filename} className="group flex items-center gap-1">
                <button
                  onClick={() => selectFile(f.filename)}
                  className={`flex-1 text-left text-sm px-2 py-1.5 rounded-md transition-colors truncate ${
                    selectedFile === f.filename
                      ? 'bg-slate-900 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="block truncate">{f.filename}</span>
                  <span className={`text-xs ${selectedFile === f.filename ? 'text-slate-400' : 'text-gray-400'}`}>
                    {f.ruleCount} rule{f.ruleCount !== 1 ? 's' : ''}
                  </span>
                </button>
                {f.filename !== 'default.yaml' && (
                  <button
                    onClick={() => handleDeleteFile(f.filename)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity px-1"
                    title="Delete file"
                  >✕</button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Main editor */}
        <div className="flex-1 min-w-0">
          {!selectedFile && !loadingFiles && (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center text-gray-400 text-sm">
              Select a policy file to edit.
            </div>
          )}

          {selectedFile && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">{selectedFile}</h2>
                  {policy && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      v{policy.version} · {policy.rules.length} rule{policy.rules.length !== 1 ? 's' : ''} · first-match-wins
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
                  <button
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className="text-sm font-medium px-4 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-30 transition-colors"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="px-5 pt-3 flex gap-4 border-b border-gray-100">
                {(['rules', 'simulate'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`pb-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                      tab === t
                        ? 'border-slate-900 text-slate-900'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {t === 'simulate' ? 'Simulate' : 'Rules'}
                  </button>
                ))}
              </div>

              <div className="px-5 py-5">
                {loadingFile ? (
                  <Spinner label="Loading policy…" />
                ) : tab === 'simulate' ? (
                  <SimulatePanel />
                ) : policy ? (
                  <div className="space-y-2">
                    {policy.rules.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-6">No rules yet. Add one below.</p>
                    )}
                    {policy.rules.map((rule, i) => (
                      <RuleCard
                        key={i}
                        rule={rule}
                        index={i}
                        total={policy.rules.length}
                        onChange={(r) => updateRule(i, r)}
                        onDelete={() => deleteRule(i)}
                        onMove={(dir) => moveRule(i, dir)}
                      />
                    ))}
                    <button
                      onClick={addRule}
                      className="w-full mt-2 py-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      + Add Rule
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
