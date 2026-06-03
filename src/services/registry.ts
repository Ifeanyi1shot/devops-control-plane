import type { Service } from '../types/index';

const registry = new Map<string, Service>([
  [
    'devops-control-plane',
    {
      id: 'devops-control-plane',
      name: 'DevOps Control Plane',
      repo: 'Ifeanyi1shot/devops-control-plane',
      namespace: 'production',
      deployment: 'devops-control-plane',
      owner: 'Ifeanyi1shot',
      runbookUrl: 'https://github.com/Ifeanyi1shot/devops-control-plane/blob/main/README.md',
      tags: { team: 'platform', tier: 'critical' },
    },
  ],
  [
    'payments-service',
    {
      id: 'payments-service',
      name: 'Payments Service',
      repo: 'your-org/payments-service',
      namespace: 'production',
      deployment: 'payments-service',
      owner: 'payments-team',
      onCall: 'payments-oncall',
      runbookUrl: 'https://wiki.internal/runbooks/payments-service',
      tags: { team: 'payments', tier: 'critical' },
    },
  ],
  [
    'api-gateway',
    {
      id: 'api-gateway',
      name: 'API Gateway',
      repo: 'your-org/api-gateway',
      namespace: 'production',
      deployment: 'api-gateway',
      owner: 'platform-team',
      runbookUrl: 'https://wiki.internal/runbooks/api-gateway',
      tags: { team: 'platform', tier: 'critical' },
    },
  ],
]);

export function getService(id: string): Service | undefined {
  return registry.get(id);
}

export function getAllServices(): Service[] {
  return Array.from(registry.values());
}

export function registerService(service: Service): void {
  registry.set(service.id, service);
}

export { registry };
