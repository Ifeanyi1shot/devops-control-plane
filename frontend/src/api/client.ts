import type { Action, Deployment, PolicyDecision, PreviewEnvironment, Service } from '../types'

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
