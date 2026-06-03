import type { Service } from '../types/index';

// In MVP, services are registered here as config.
// Phase 2 replaces this with auto-discovery from GitHub + Kubernetes labels.
const registry = new Map<string, Service>([
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
  [
    'user-service',
    {
      id: 'user-service',
      name: 'User Service',
      repo: 'your-org/user-service',
      namespace: 'production',
      deployment: 'user-service',
      owner: 'identity-team',
      tags: { team: 'identity', tier: 'high' },
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
