import type { Action, Deployment, PolicyDecision, PolicyFile, PreviewEnvironment, Service, ServiceLock } from '../types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options)
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed: ${res.status}`)
  }
  return data as T
}

export async function getServices(): Promise<{ services: Service[] }> {
  return request('/services')
}

export async function getService(id: string): Promise<{ service: Service }> {
  return request(`/services/${id}`)
}

export async function lockService(
  serviceId: string,
  lockedBy: string,
  reason: string,
  targetEnvironment?: string | null,
  targetBranch?: string | null,
): Promise<{ lock: ServiceLock }> {
  return request(`/services/${serviceId}/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lockedBy, reason, targetEnvironment, targetBranch }),
  })
}

export async function unlockService(
  serviceId: string,
  unlockedBy: string,
): Promise<{ message: string }> {
  return request(`/services/${serviceId}/lock`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unlockedBy }),
  })
}

export async function getDeployments(
  serviceId: string,
  environment = 'production',
  limit = 10,
): Promise<{ deployments: Deployment[] }> {
  return request(`/services/${serviceId}/deployments?environment=${environment}&limit=${limit}`)
}

export interface PreviewRollbackParams {
  serviceId: string
  environment: string
  requestedBy: string
  requestedByRole: string
  targetDeploymentId: string
  targetSha: string
  targetImage: string
  containerName: string
  reason: string
}

export async function previewRollback(
  params: PreviewRollbackParams,
): Promise<{ action: Action; decision: PolicyDecision; status: number }> {
  const res = await fetch(`${BASE}/rollback/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as { action: Action; decision: PolicyDecision }
  return { ...data, status: res.status }
}

export async function executeRollback(actionId: string): Promise<{ action: Action }> {
  return request(`/rollback/${actionId}/execute`, { method: 'POST' })
}

export async function approveAction(
  actionId: string,
  approvedBy: string,
): Promise<{ action: Action }> {
  return request(`/actions/${actionId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvedBy }),
  })
}

export async function rejectAction(
  actionId: string,
  rejectedBy: string,
  reason: string,
): Promise<{ action: Action }> {
  return request(`/actions/${actionId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejectedBy, reason }),
  })
}

export interface CreatePreviewParams {
  serviceId: string
  branch: string
  commitSha: string
  image: string
  createdBy: string
}

export async function createPreviewEnv(
  params: CreatePreviewParams,
): Promise<{ preview: PreviewEnvironment }> {
  return request('/preview-env', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

export async function listPreviewEnvs(
  serviceId?: string,
): Promise<{ previews: PreviewEnvironment[] }> {
  const qs = serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : ''
  return request(`/preview-env${qs}`)
}

export async function getPreviewEnv(id: string): Promise<{ preview: PreviewEnvironment }> {
  return request(`/preview-env/${id}`)
}

export async function destroyPreviewEnv(
  id: string,
  destroyedBy: string,
): Promise<{ preview: PreviewEnvironment }> {
  return request(`/preview-env/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destroyedBy }),
  })
}

export interface RollbackAnalysis {
  summary: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  riskReason: string
  affectedAreas: string[]
  verificationSteps: string[]
}

export async function analyzeRollback(
  serviceId: string,
  currentSha: string,
  targetSha: string,
  reason: string,
): Promise<{ analysis: RollbackAnalysis }> {
  return request('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceId, currentSha, targetSha, reason }),
  })
}

export interface AuditEntry {
  id: string
  actionId: string
  actionType: string
  serviceId: string
  actor: string
  event: string
  detail: Record<string, unknown>
  timestamp: string
}

export async function getAuditLog(limit = 100): Promise<{ entries: AuditEntry[] }> {
  return request(`/audit?limit=${limit}`)
}

export async function getAuditByService(
  serviceId: string,
  limit = 50,
): Promise<{ entries: AuditEntry[] }> {
  return request(`/audit/services/${serviceId}?limit=${limit}`)
}

export interface MetricsSummary {
  totalCompleted: number
  totalRollbacks: number
  changeFailureRate: number
  avgMttrMinutes: number | null
  deploymentsLast7Days: number
  deploymentsLast30Days: number
}

export interface DailyCount {
  date: string
  count: number
}

export interface MetricsData {
  summary: MetricsSummary
  deploymentFrequency: DailyCount[]
  mttrTrend: DailyCount[]
  topActors: Array<{ actor: string; count: number }>
  actionBreakdown: Array<{ actionType: string; count: number }>
}

export async function getMetrics(): Promise<MetricsData> {
  return request('/metrics')
}

export interface PolicyFileInfo {
  filename: string
  version: string
  ruleCount: number
  error?: string
}

export async function getPolicyFiles(): Promise<{ files: PolicyFileInfo[] }> {
  return request('/policy/files')
}

export async function getPolicyFile(filename: string): Promise<{ policy: PolicyFile }> {
  return request(`/policy/${encodeURIComponent(filename)}`)
}

export async function savePolicyFile(filename: string, policy: PolicyFile): Promise<{ message: string }> {
  return request(`/policy/${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(policy),
  })
}

export async function deletePolicyFile(filename: string): Promise<{ message: string }> {
  return request(`/policy/${encodeURIComponent(filename)}`, { method: 'DELETE' })
}

export interface SimulatePolicyRequest {
  type: 'rollback' | 'deploy' | 'restart' | 'scale' | 'preview_env'
  serviceId: string
  requestedBy: string
  requestedByRole: string
  environment: string
  params: Record<string, unknown>
}

export async function simulatePolicy(payload: SimulatePolicyRequest): Promise<{ decision: PolicyDecision; request: SimulatePolicyRequest }> {
  return request('/policy/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
