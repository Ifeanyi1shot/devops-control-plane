import * as k8s from '@kubernetes/client-node';

export class KubernetesClient {
  private appsApi!: k8s.AppsV1Api;
  private dryRun: boolean;

  constructor() {
    this.dryRun = process.env['K8S_DRY_RUN'] === 'true';

    const kc = new k8s.KubeConfig();
    try {
      kc.loadFromDefault();
    } catch {
      console.warn('[K8s] Could not load kubeconfig — switching to dry-run mode.');
      this.dryRun = true;
    }

    if (!this.dryRun) {
      this.appsApi = kc.makeApiClient(k8s.AppsV1Api);
      const inner = this.appsApi as unknown as { defaultHeaders?: Record<string, string> };
      if (inner.defaultHeaders) {
        inner.defaultHeaders['Content-Type'] = 'application/strategic-merge-patch+json';
      }
    }

    if (this.dryRun) {
      console.log('[K8s] Running in DRY-RUN mode — Kubernetes calls will be simulated.');
    }
  }

  async getDeployment(namespace: string, name: string): Promise<k8s.V1Deployment> {
    if (this.dryRun) {
      // Return a minimal stub so callers can read image/replica fields safely
      return {
        metadata: { name, namespace },
        spec: { selector: {}, template: { spec: { containers: [{ name: 'app', image: 'unknown' }] } } },
        status: { replicas: 0, readyReplicas: 0, availableReplicas: 0 },
      } as k8s.V1Deployment;
    }
    return this.appsApi.readNamespacedDeployment({ name, namespace });
  }

  async setImage(
    namespace: string,
    deploymentName: string,
    containerName: string,
    image: string
  ): Promise<void> {
    if (this.dryRun) {
      console.log(`[K8s DRY-RUN] Would patch ${namespace}/${deploymentName} container=${containerName} -> ${image}`);
      return;
    }

    const patch = {
      spec: {
        template: {
          spec: {
            containers: [{ name: containerName, image }],
          },
        },
      },
    };

    await this.appsApi.patchNamespacedDeployment({
      name: deploymentName,
      namespace,
      body: patch as object,
    });

    console.log(`[K8s] Patched ${namespace}/${deploymentName} -> image: ${image}`);
  }

  async getDeploymentStatus(
    namespace: string,
    deploymentName: string
  ): Promise<{ ready: number; desired: number; available: number }> {
    const dep = await this.getDeployment(namespace, deploymentName);
    return {
      ready: dep.status?.readyReplicas ?? 0,
      desired: dep.status?.replicas ?? 0,
      available: dep.status?.availableReplicas ?? 0,
    };
  }

  async createPreviewDeployment(namespace: string, deploymentName: string, image: string): Promise<void> {
    if (this.dryRun) {
      console.log(`[K8s DRY-RUN] Would create namespace ${namespace} and deploy ${deploymentName} image=${image}`);
      return;
    }
    // Real implementation would: create namespace, then create Deployment manifest
    throw new Error('createPreviewDeployment not implemented for live cluster');
  }

  async destroyPreviewDeployment(namespace: string): Promise<void> {
    if (this.dryRun) {
      console.log(`[K8s DRY-RUN] Would delete namespace ${namespace}`);
      return;
    }
    throw new Error('destroyPreviewDeployment not implemented for live cluster');
  }
}
