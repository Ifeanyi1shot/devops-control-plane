import type { FastifyInstance } from 'fastify';
import type { AuditStore } from '../../core/audit/store';

export async function auditRoutes(app: FastifyInstance, auditStore: AuditStore) {
  // GET /audit — recent audit entries across all actions
  app.get<{ Querystring: { limit?: string } }>('/audit', async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? '100', 10), 500);
    return reply.send({ entries: auditStore.getAll(limit) });
  });

  // GET /audit/actions/:actionId — all audit entries for a specific action
  app.get<{ Params: { actionId: string } }>('/audit/actions/:actionId', async (req, reply) => {
    return reply.send({ entries: auditStore.getByActionId(req.params.actionId) });
  });

  // GET /audit/services/:serviceId — audit entries for a specific service
  app.get<{ Params: { serviceId: string }; Querystring: { limit?: string } }>(
    '/audit/services/:serviceId',
    async (req, reply) => {
      const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
      return reply.send({ entries: auditStore.getByServiceId(req.params.serviceId, limit) });
    }
  );
}
