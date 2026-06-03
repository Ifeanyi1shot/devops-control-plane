import * as k8s from '@kubernetes/client-node';

export class KubernetesClient {
  private appsApi: k8s.AppsV1Api;

  constructor() {
    const kc = new k8s.KubeConfig();

    try {
      kc.loadFromDefault();
    } catch {
      console.warn('[K8s] Could not load kubeconfig. Kubernetes operations will fail.');
    }

    this.appsApi = kc.makeApiClient(k8s.AppsV1Api);

    // v1.4.0 SDK uses fetch under the hood; set the strategic-merge-patch
    // content-type as a default header so all patch calls use it.
    const inner = this.appsApi as unknown as { defaultHeaders?: Record<string, string> };
    if (inner.defaultHeaders) {
      inner.defaultHeaders['Content-Type'] = 'application/strategic-merge-patch+json';
    }
  }

  async getDeployment(namespace: string, name: string): Promise<k8s.V1Deployment> {
    return this.appsApi.readNamespacedDeployment({ name, namespace });
  }

  async setImage(
    namespace: string,
    deploymentName: string,
    containerName: string,
    image: string
  ): Promise<void> {
    // Partial patch body — only the fields we want to change
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
}
