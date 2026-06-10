export type ActionStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rolled_back'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ServiceLock {
  id: string
  serviceId: string
  lockedBy: string
  reason: string
  lockedAt: string
}

export interface Service {
  id: string
  name: string
  repo: string
  namespace: string
  deployment: string
  owner: string
  onCall?: string
  runbookUrl?: string
  tags: Record<string, string>
  lock?: ServiceLock | null
}

export interface Deployment {
  id: string
  serviceId: string
  sha: string
  ref: string
  message: string
  author: string
  avatarUrl?: string
  commitUrl?: string
  deployedAt: string
  workflowRunId?: number
  environment: string
  source: 'deployment' | 'run' | 'commit'
}

export interface ActionPreview {
  actionId: string
  type: string
  service: Service
  description: string
  changes: string[]
  risks: string[]
  riskLevel: RiskLevel
  rollbackPlan: string
  policyName: string
  requiresApproval: boolean
  estimatedDurationSeconds: number
}

export interface Action {
  id: string
  type: string
  serviceId: string
  requestedBy: string
  environment: string
  params: Record<string, unknown>
  status: ActionStatus
  preview: ActionPreview
  approvedBy?: string
  rejectedBy?: string
  rejectionReason?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface PolicyDecision {
  allowed: boolean
  requiresApproval: boolean
  approverRole?: string
  matchedRule: string
  reason: string
}

export type PreviewStatus = 'creating' | 'running' | 'destroying' | 'destroyed' | 'failed'

export interface PreviewEnvironment {
  id: string
  serviceId: string
  serviceName: string
  branch: string
  commitSha: string
  image: string
  namespace: string
  url: string
  status: PreviewStatus
  createdAt: string
  createdBy: string
  destroyedAt?: string
  destroyedBy?: string
  error?: string
}

export interface RollbackNavigationState {
  serviceId: string
  serviceName: string
  targetDeployment: Deployment
  targetImage: string
  containerName: string
  environment: string
  requestedBy: string
  requestedByRole: string
  reason: string
}
