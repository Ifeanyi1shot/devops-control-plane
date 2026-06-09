import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { approveAction, executeRollback, previewRollback } from '../api/client'
import { RiskBadge } from '../components/RiskBadge'
import { Spinner } from '../components/Spinner'
import { StatusBadge } from '../components/StatusBadge'
import type { Action, PolicyDecision, RollbackNavigationState } from '../types'

type Phase =
  | { name: 'loading' }
  | { name: 'denied'; decision: PolicyDecision }
  | { name: 'preview'; action: Action; decision: PolicyDecision }
  | { name: 'pending_approval'; action: Action; decision: PolicyDecision }
  | { name: 'approving' }
  | { name: 'executing' }
  | { name: 'completed'; action: Action }
  | { name: 'error'; message: string }

export function RollbackPreviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as RollbackNavigationState | null

  const [phase, setPhase] = useState<Phase>({ name: 'loading' })
  const [approverName, setApproverName] = useState('')

  useEffect(() => {
    if (!state) {
      navigate('/', { replace: true })
      return
    }

    previewRollback({
      serviceId: state.serviceId,
      environment: state.environment,
      requestedBy: state.requestedBy,
      requestedByRole: state.requestedByRole,
      targetDeploymentId: state.targetDeployment.id,
      targetSha: state.targetDeployment.sha,
      targetImage: state.targetImage,
      containerName: state.containerName,
      reason: state.reason,
    })
      .then(({ action, decision }) => {
        if (!decision.allowed) {
          setPhase({ name: 'denied', decision })
        } else if (action.status === 'pending_approval') {
          setPhase({ name: 'pending_approval', action, decision })
        } else {
          setPhase({ name: 'preview', action, decision })
        }
      })
      .catch((e: unknown) =>
        setPhase({ name: 'error', message: e instanceof Error ? e.message : 'Preview failed' }),
      )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExecute(actionId: string) {
    setPhase({ name: 'executing' })
    try {
      const { action } = await executeRollback(actionId)
      setPhase({ name: 'completed', action })
    } catch (e: unknown) {
      setPhase({ name: 'error', message: e instanceof Error ? e.message : 'Execute failed' })
    }
  }

  async function handleApproveAndExecute(actionId: string) {
    if (!approverName.trim()) return
    setPhase({ name: 'approving' })
    try {
      await approveAction(actionId, approverName.trim())
      await handleExecute(actionId)
    } catch (e: unknown) {
      setPhase({ name: 'error', message: e instanceof Error ? e.message : 'Approval failed' })
    }
  }

  if (!state) return null

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/" className="text-blue-600 hover:underline">Services</Link>
        <span className="text-gray-300">/</span>
        <Link
          to={`/services/${state.serviceId}`}
          className="text-blue-600 hover:underline"
        >
          {state.serviceName}
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-600">Rollback Preview</span>
      </div>

      {/* Loading */}
      {phase.name === 'loading' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-6 py-12 flex flex-col items-center gap-3">
          <Spinner />
          <p className="text-sm text-gray-500">
            Fetching diff and evaluating policies...
          </p>
        </div>
      )}

      {/* Denied */}
      {phase.name === 'denied' && (
        <DeniedPanel decision={phase.decision} serviceId={state.serviceId} />
      )}

      {/* Preview — self-service (no approval needed) */}
      {phase.name === 'preview' && (
        <PreviewPanel
          action={phase.action}
          decision={phase.decision}
          state={state}
          footer={
            <div className="flex justify-between items-center">
              <Link
                to={`/services/${state.serviceId}`}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </Link>
              <button
                onClick={() => handleExecute(phase.action.id)}
                className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-md hover:bg-blue-700 transition-colors"
              >
                Execute Rollback →
              </button>
            </div>
          }
        />
      )}

      {/* Preview — requires approval */}
      {phase.name === 'pending_approval' && (
        <PreviewPanel
          action={phase.action}
          decision={phase.decision}
          state={state}
          footer={
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-dashed border-yellow-300 bg-yellow-50 p-4">
                <div className="flex items-start gap-2 mb-3">
                  <span className="text-yellow-600 text-lg leading-none mt-0.5">⏳</span>
                  <div>
                    <p className="font-semibold text-yellow-800 text-sm">Approval Required</p>
                    <p className="text-sm text-yellow-700 mt-0.5">
                      This action requires sign-off from a{' '}
                      <strong>{phase.decision.approverRole}</strong> before it can execute.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    placeholder="Approver's name"
                    className="border border-yellow-400 bg-white rounded-md px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                  <button
                    onClick={() => handleApproveAndExecute(phase.action.id)}
                    disabled={!approverName.trim()}
                    className="bg-yellow-600 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-yellow-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    Approve & Execute
                  </button>
                </div>
                <p className="text-xs text-yellow-600 mt-2">
                  In production, this approval request would be sent to Slack.
                </p>
              </div>
              <div className="flex justify-between items-center">
                <Link
                  to={`/services/${state.serviceId}`}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </Link>
                <StatusBadge status="pending_approval" />
              </div>
            </div>
          }
        />
      )}

      {/* Approving / Executing */}
      {(phase.name === 'approving' || phase.name === 'executing') && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-6 py-12 flex flex-col items-center gap-3">
          <Spinner />
          <p className="text-sm text-gray-500">
            {phase.name === 'approving' ? 'Processing approval...' : 'Executing rollback in Kubernetes...'}
          </p>
        </div>
      )}

      {/* Completed */}
      {phase.name === 'completed' && (
        <CompletedPanel action={phase.action} state={state} />
      )}

      {/* Error */}
      {phase.name === 'error' && (
        <div className="bg-white rounded-lg border border-red-200 shadow-sm p-6 space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-red-500 text-xl">✗</span>
            <div>
              <h2 className="font-semibold text-red-800">Action Failed</h2>
              <p className="text-sm text-red-600 mt-1">{phase.message}</p>
            </div>
          </div>
          <Link
            to={`/services/${state.serviceId}`}
            className="inline-block text-sm text-blue-600 hover:underline"
          >
            ← Back to {state.serviceName}
          </Link>
        </div>
      )}
    </div>
  )
}

function PreviewPanel({
  action,
  decision,
  state,
  footer,
}: {
  action: Action
  decision: PolicyDecision
  state: RollbackNavigationState
  footer: React.ReactNode
}) {
  const { preview } = action

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className="text-xl font-bold text-gray-900">Rollback Preview</h1>
          <RiskBadge level={preview.riskLevel} />
        </div>
        <p className="text-sm text-gray-600">{preview.description}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-600 border border-gray-200">
            Policy: <strong>{decision.matchedRule}</strong>
          </span>
          {decision.requiresApproval ? (
            <span className="text-xs px-2.5 py-1 rounded bg-yellow-100 text-yellow-700 border border-yellow-200">
              Requires approval from <strong>{decision.approverRole}</strong>
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded bg-green-100 text-green-700 border border-green-200">
              Self-service — no approval needed
            </span>
          )}
          <span className="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-500 border border-gray-200">
            ~{preview.estimatedDurationSeconds}s to complete
          </span>
        </div>
      </div>

      {/* Changes + Risks side by side */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">
            What Will Change
          </h2>
          <ul className="space-y-1.5">
            {preview.changes.map((change, i) => (
              <li key={i} className="text-xs font-mono text-gray-700 bg-gray-50 rounded px-2.5 py-1.5 border border-gray-100">
                {change}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">
            Risks
          </h2>
          <ul className="space-y-2">
            {preview.risks.map((risk, i) => {
              const isWarning = risk.startsWith('WARNING')
              return (
                <li
                  key={i}
                  className={`text-xs rounded px-3 py-2 ${
                    isWarning
                      ? 'bg-orange-50 text-orange-800 border border-orange-200'
                      : 'bg-gray-50 text-gray-700 border border-gray-100'
                  }`}
                >
                  {isWarning && <span className="font-bold">⚠ </span>}
                  {risk}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* Rollback plan */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-2">
          Rollback Plan
        </h2>
        <p className="text-sm text-gray-600">{preview.rollbackPlan}</p>
      </div>

      {/* Reason */}
      <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-5 py-4">
        <div className="flex items-start gap-2">
          <span className="text-gray-400 text-sm shrink-0 mt-0.5">Reason:</span>
          <span className="text-sm text-gray-700 italic">"{state.reason}"</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-gray-400 text-sm">Requested by:</span>
          <span className="text-sm text-gray-700 font-medium">{state.requestedBy}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{state.requestedByRole}</span>
        </div>
      </div>

      {/* Footer with action buttons */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
        {footer}
      </div>
    </div>
  )
}

function DeniedPanel({
  decision,
  serviceId,
}: {
  decision: PolicyDecision
  serviceId: string
}) {
  return (
    <div className="bg-white rounded-lg border border-red-200 shadow-sm p-6 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-red-500 text-2xl leading-none">✗</span>
        <div>
          <h2 className="text-xl font-bold text-red-800">Action Denied by Policy</h2>
          <p className="text-sm text-red-600 mt-2">{decision.reason}</p>
        </div>
      </div>

      <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 space-y-1">
        <div>
          <span className="text-red-500">Matched rule: </span>
          <strong>{decision.matchedRule}</strong>
        </div>
        <div className="text-xs text-red-500">
          No action was created. Nothing was modified.
        </div>
      </div>

      <Link
        to={`/services/${serviceId}`}
        className="inline-block text-sm text-blue-600 hover:underline"
      >
        ← Back
      </Link>
    </div>
  )
}

function CompletedPanel({
  action,
  state,
}: {
  action: Action
  state: RollbackNavigationState
}) {
  const sha = (action.params['targetSha'] as string | undefined) ?? '—'
  const image = (action.params['targetImage'] as string | undefined) ?? '—'

  return (
    <div className="bg-white rounded-lg border border-green-200 shadow-sm p-6 space-y-5">
      <div className="flex items-start gap-3">
        <span className="text-green-500 text-2xl leading-none">✓</span>
        <div>
          <h2 className="text-xl font-bold text-green-800">Rollback Initiated</h2>
          <p className="text-sm text-green-700 mt-1">
            Kubernetes is rolling out the new image. Monitor the deployment for rollout progress.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-gray-400 text-xs">Action ID</dt>
          <dd className="font-mono text-gray-700 text-xs mt-0.5">{action.id}</dd>
        </div>
        <div>
          <dt className="text-gray-400 text-xs">Service</dt>
          <dd className="text-gray-700 mt-0.5">{state.serviceName}</dd>
        </div>
        <div>
          <dt className="text-gray-400 text-xs">Rolled back to SHA</dt>
          <dd className="font-mono text-gray-700 text-xs mt-0.5">{sha.substring(0, 7)}</dd>
        </div>
        <div>
          <dt className="text-gray-400 text-xs">Image</dt>
          <dd className="font-mono text-gray-700 text-xs mt-0.5 truncate">{image}</dd>
        </div>
        <div>
          <dt className="text-gray-400 text-xs">Requested by</dt>
          <dd className="text-gray-700 mt-0.5">{action.requestedBy}</dd>
        </div>
        {action.approvedBy && (
          <div>
            <dt className="text-gray-400 text-xs">Approved by</dt>
            <dd className="text-gray-700 mt-0.5">{action.approvedBy}</dd>
          </div>
        )}
      </dl>

      <div className="flex gap-3 pt-1">
        <Link
          to={`/services/${state.serviceId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to {state.serviceName}
        </Link>
      </div>
    </div>
  )
}
