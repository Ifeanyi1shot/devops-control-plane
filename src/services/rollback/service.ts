import type { Action, ActionPreview, ActionRequest, PolicyDecision, Service } from '../../types/index';
import { ActionOrchestrator } from '../../core/action/orchestrator';
import { GitHubClient } from '../../integrations/github/client';
import { KubernetesClient } from '../../integrations/kubernetes/client';
import type { AuditStore } from '../../core/audit/store';

export interface RollbackParams {
  targetDeploymentId: string;   // the deployment ID to roll back to
  targetSha: string;
  targetImage: string;           // full image tag e.g. "ghcr.io/org/svc:sha-abc123"
  containerName: string;
  reason: string;
}

export interface RollbackPreviewResult {
  action: Action;
  decision: PolicyDecision;
}

export class RollbackService {
  constructor(
    private orchestrator: ActionOrchestrator,
    private github: GitHubClient,
    private k8s: KubernetesClient,
    private services: Map<string, Service>,
    private auditStore: AuditStore,
  ) {}

  private getService(serviceId: string): Service {
    const svc = this.services.get(serviceId);
    if (!svc) throw new Error(`Service not found: ${serviceId}`);
    return svc;
  }

  async previewRollback(
    request: ActionRequest,
    params: RollbackParams
  ): Promise<RollbackPreviewResult> {
    const service = this.getService(request.serviceId);

    const buildDetail = async (
      _actionId: string,
      _decision: PolicyDecision
    ): Promise<Omit<ActionPreview, 'actionId' | 'requiresApproval' | 'policyName'>> => {
      // Fetch current deployment status from Kubernetes
      let currentImage = 'unknown';
      let k8sStatus = { ready: 0, desired: 0, available: 0 };
      try {
        const dep = await this.k8s.getDeployment(service.namespace, service.deployment);
        currentImage = dep.spec?.template?.spec?.containers?.[0]?.image ?? 'unknown';
        k8sStatus = await this.k8s.getDeploymentStatus(service.namespace, service.deployment);
      } catch (err) {
        console.warn(`[Rollback] Could not fetch K8s status: ${err}`);
      }

      // Get the diff between target SHA and current HEAD
      let diffSummary = 'Diff unavailable';
      let changedFiles: string[] = [];
      try {
        // We compare target (older) -> current (newer) to show what we're reverting
        const diff = await this.github.getCommitDiff(service.repo, params.targetSha, 'main');
        diffSummary = diff.summary;
        changedFiles = diff.files;
      } catch {
        console.warn('[Rollback] Could not fetch diff from GitHub');
      }

      const risks: string[] = [];

      // Flag DB migration risk
      if (changedFiles.some((f) => f.match(/migration|schema|migrate/i))) {
        risks.push(
          'WARNING: This rollback reverses commits that contain database migration files. ' +
          'Rolling back may leave the schema in an inconsistent state.'
        );
      }

      // Flag dependency changes
      if (changedFiles.some((f) => f.match(/package\.json|go\.mod|requirements\.txt|Cargo\.toml/i))) {
        risks.push('Dependency files changed. The rolled-back version may have different runtime dependencies.');
      }

      if (risks.length === 0) {
        risks.push('No high-risk file changes detected. Standard rollback risk applies.');
      }

      return {
        type: 'rollback',
        service,
        description: `Roll back ${service.name} in ${request.environment} from current image (${currentImage}) to ${params.targetImage}`,
        changes: [
          `Target image: ${params.targetImage}`,
          `Target SHA:   ${params.targetSha}`,
          `Namespace:    ${service.namespace}`,
          `Deployment:   ${service.deployment}`,
          `Commit diff:  ${diffSummary}`,
          `Replicas:     ${k8sStatus.ready}/${k8sStatus.desired} ready`,
        ],
        risks,
        riskLevel: risks.some((r) => r.startsWith('WARNING')) ? 'high' : 'medium',
        rollbackPlan:
          `To undo this rollback, re-deploy the current image (${currentImage}) ` +
          `to ${service.namespace}/${service.deployment}.`,
        estimatedDurationSeconds: 60,
      };
    };

    return this.orchestrator.preview(request, service, buildDetail);
  }

  async executeRollback(actionId: string): Promise<Action> {
    return this.orchestrator.execute(actionId, async (action) => {
      const params = action.params as unknown as RollbackParams;
      const service = this.getService(action.serviceId);

      this.auditStore.log(actionId, 'rollback', service.id, 'system', 'rollback.k8s.patch.start', {
        image: params.targetImage,
        namespace: service.namespace,
        deployment: service.deployment,
      });

      await this.k8s.setImage(
        service.namespace,
        service.deployment,
        params.containerName,
        params.targetImage
      );

      this.auditStore.log(actionId, 'rollback', service.id, 'system', 'rollback.k8s.patch.complete', {
        image: params.targetImage,
      });

      return {
        rolledBackTo: params.targetSha,
        image: params.targetImage,
        namespace: service.namespace,
        deployment: service.deployment,
      };
    });
  }
}
