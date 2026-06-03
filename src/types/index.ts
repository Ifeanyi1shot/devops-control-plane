export type ActionStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Service {
  id: string;
  name: string;
  repo: string;       // "owner/repo"
  namespace: string;  // Kubernetes namespace
  deployment: string; // Kubernetes deployment name
  owner: string;
  onCall?: string;
  runbookUrl?: string;
  tags: Record<string, string>;
}

export interface Deployment {
  id: string;
  serviceId: string;
  sha: string;
  ref: string;
  message: string;
  author: string;
  deployedAt: Date;
  workflowRunId?: number;
  environment: string;
}

export interface ActionRequest {
  type: 'rollback' | 'deploy' | 'restart' | 'scale' | 'preview_env';
  serviceId: string;
  requestedBy: string;
  requestedByRole: string;
  environment: string;
  params: Record<string, unknown>;
}

export interface ActionPreview {
  actionId: string;
  type: ActionRequest['type'];
  service: Service;
  description: string;
  changes: string[];
  risks: string[];
  riskLevel: RiskLevel;
  rollbackPlan: string;
  policyName: string;
  requiresApproval: boolean;
  estimatedDurationSeconds: number;
}

export interface Action {
  id: string;
  type: ActionRequest['type'];
  serviceId: string;
  requestedBy: string;
  environment: string;
  params: Record<string, unknown>;
  status: ActionStatus;
  preview: ActionPreview;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface AuditEntry {
  id: string;
  actionId: string;
  actionType: ActionRequest['type'];
  serviceId: string;
  actor: string;
  event: string;
  detail: Record<string, unknown>;
  timestamp: Date;
}

export interface PolicyRule {
  name: string;
  description: string;
  match: {
    actionType: string | string[];
    environment?: string | string[];
    role?: string | string[];
  };
  allow: boolean;
  requireApproval?: boolean;
  approverRole?: string;
  timeRestriction?: {
    denyDays?: string[];   // e.g. ['Friday', 'Saturday', 'Sunday']
    denyAfterHour?: number;
    denyBeforeHour?: number;
  };
}

export interface PolicyFile {
  version: string;
  rules: PolicyRule[];
}

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  approverRole?: string;
  matchedRule: string;
  reason: string;
}
