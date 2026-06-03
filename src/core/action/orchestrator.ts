import { v4 as uuidv4 } from 'uuid';
import type {
  Action,
  ActionPreview,
  ActionRequest,
  ActionStatus,
  PolicyDecision,
  Service,
} from '../../types/index';
import { PolicyEngine } from '../policy/engine';
import { auditStore } from '../audit/store';

// In-memory action store — swap for DB later
const actions = new Map<string, Action>();

export class ActionOrchestrator {
  private policy: PolicyEngine;

  constructor(policy: PolicyEngine) {
    this.policy = policy;
  }

  // Step 1 — evaluate the request and return a preview (no side effects yet)
  async preview(
    request: ActionRequest,
    service: Service,
    buildPreviewDetail: (actionId: string, decision: PolicyDecision) => Promise<Omit<ActionPreview, 'actionId' | 'requiresApproval' | 'policyName'>>
  ): Promise<{ action: Action; decision: PolicyDecision }> {
    const decision = this.policy.evaluate(request);

    const actionId = uuidv4();

    const detail = await buildPreviewDetail(actionId, decision);

    const preview: ActionPreview = {
      actionId,
      requiresApproval: decision.requiresApproval,
      policyName: decision.matchedRule,
      ...detail,
    };

    const status: ActionStatus = decision.allowed
      ? decision.requiresApproval
        ? 'pending_approval'
        : 'approved'
      : 'rejected';

    const action: Action = {
      id: actionId,
      type: request.type,
      serviceId: request.serviceId,
      requestedBy: request.requestedBy,
      environment: request.environment,
      params: request.params,
      status,
      preview,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    actions.set(actionId, action);

    auditStore.log(actionId, request.type, request.serviceId, request.requestedBy, 'action.previewed', {
      decision,
      status,
    });

    if (!decision.allowed) {
      auditStore.log(actionId, request.type, request.serviceId, 'system', 'action.denied', {
        reason: decision.reason,
      });
    }

    return { action, decision };
  }

  // Step 2 — approve a pending action
  approve(actionId: string, approvedBy: string): Action {
    const action = this.getOrThrow(actionId);

    if (action.status !== 'pending_approval') {
      throw new Error(`Cannot approve action in state "${action.status}"`);
    }

    action.status = 'approved';
    action.approvedBy = approvedBy;
    action.updatedAt = new Date();

    auditStore.log(actionId, action.type, action.serviceId, approvedBy, 'action.approved');
    return action;
  }

  // Step 2 (alt) — reject a pending action
  reject(actionId: string, rejectedBy: string, reason: string): Action {
    const action = this.getOrThrow(actionId);

    if (action.status !== 'pending_approval') {
      throw new Error(`Cannot reject action in state "${action.status}"`);
    }

    action.status = 'rejected';
    action.rejectedBy = rejectedBy;
    action.rejectionReason = reason;
    action.updatedAt = new Date();

    auditStore.log(actionId, action.type, action.serviceId, rejectedBy, 'action.rejected', { reason });
    return action;
  }

  // Step 3 — execute an approved action
  async execute(
    actionId: string,
    executeFn: (action: Action) => Promise<Record<string, unknown>>
  ): Promise<Action> {
    const action = this.getOrThrow(actionId);

    if (action.status !== 'approved') {
      throw new Error(`Cannot execute action in state "${action.status}". Must be "approved".`);
    }

    action.status = 'executing';
    action.updatedAt = new Date();
    auditStore.log(actionId, action.type, action.serviceId, 'system', 'action.executing');

    try {
      const result = await executeFn(action);

      action.status = 'completed';
      action.completedAt = new Date();
      action.updatedAt = new Date();

      auditStore.log(actionId, action.type, action.serviceId, 'system', 'action.completed', result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      action.status = 'failed';
      action.error = message;
      action.updatedAt = new Date();

      auditStore.log(actionId, action.type, action.serviceId, 'system', 'action.failed', { error: message });
      throw err;
    }

    return action;
  }

  getById(actionId: string): Action | undefined {
    return actions.get(actionId);
  }

  getAll(): Action[] {
    return Array.from(actions.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  private getOrThrow(actionId: string): Action {
    const action = actions.get(actionId);
    if (!action) throw new Error(`Action not found: ${actionId}`);
    return action;
  }
}
