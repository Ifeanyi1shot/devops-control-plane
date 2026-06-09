import { randomUUID } from 'crypto';
import type { KubernetesClient } from '../../integrations/kubernetes/client';
import type { PreviewsRepository } from '../../db/repositories/previews';
import { getService } from '../registry';
import type { PreviewEnvironment } from '../../types/index';

export class PreviewEnvService {
  constructor(
    private k8s: KubernetesClient,
    private previewsRepo: PreviewsRepository,
  ) {}

  async create(
    serviceId: string,
    branch: string,
    commitSha: string,
    image: string,
    createdBy: string
  ): Promise<PreviewEnvironment> {
    const service = getService(serviceId);
    if (!service) throw new Error(`Service not found: ${serviceId}`);

    const id = randomUUID();
    const shortId = id.substring(0, 8);
    const namespace = `preview-${shortId}`;
    const slugName = service.name.toLowerCase().replace(/\s+/g, '-');
    const url = `https://preview-${shortId}.${slugName}.internal`;

    const preview: PreviewEnvironment = {
      id,
      serviceId,
      serviceName: service.name,
      branch,
      commitSha,
      image,
      namespace,
      url,
      status: 'creating',
      createdAt: new Date(),
      createdBy,
    };

    this.previewsRepo.save(preview);

    // Simulate K8s provisioning — transition to running after 3s
    this.k8s.createPreviewDeployment(namespace, service.deployment, image)
      .then(() => {
        setTimeout(() => {
          const p = this.previewsRepo.findById(id);
          if (p && p.status === 'creating') {
            p.status = 'running';
            this.previewsRepo.update(p);
          }
        }, 3000);
      })
      .catch((err: unknown) => {
        const p = this.previewsRepo.findById(id);
        if (p) {
          p.status = 'failed';
          p.error = err instanceof Error ? err.message : String(err);
          this.previewsRepo.update(p);
        }
      });

    return preview;
  }

  list(serviceId?: string): PreviewEnvironment[] {
    return this.previewsRepo.findActive(serviceId);
  }

  get(id: string): PreviewEnvironment {
    const p = this.previewsRepo.findById(id);
    if (!p) throw new Error(`Preview environment not found: ${id}`);
    return p;
  }

  async destroy(id: string, destroyedBy: string): Promise<PreviewEnvironment> {
    const p = this.get(id);
    if (p.status === 'destroyed' || p.status === 'destroying') {
      throw new Error(`Preview ${id} is already ${p.status}`);
    }

    p.status = 'destroying';
    this.previewsRepo.update(p);

    await this.k8s.destroyPreviewDeployment(p.namespace);

    p.status = 'destroyed';
    p.destroyedAt = new Date();
    p.destroyedBy = destroyedBy;
    this.previewsRepo.update(p);

    return p;
  }
}
