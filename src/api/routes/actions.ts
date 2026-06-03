import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ActionOrchestrator } from '../../core/action/orchestrator';

const approveBody = z.object({ approvedBy: z.string() });
const rejectBody = z.object({ rejectedBy: z.string(), reason: z.string() });

export async function actionsRoutes(app: FastifyInstance, orchestrator: ActionOrchestrator) {
  // GET /actions — list all actions (most recent first)
  app.get('/actions', async (_req, reply) => {
    return reply.send({ actions: orchestrator.getAll() });
  });

  // GET /actions/:id — get a single action with full preview detail
  app.get<{ Params: { id: string } }>('/actions/:id', async (req, reply) => {
    const action = orchestrator.getById(req.params.id);
    if (!action) return reply.code(404).send({ error: 'Action not found' });
    return reply.send({ action });
  });

  // POST /actions/:id/approve — approve a pending action
  app.post<{ Params: { id: string } }>('/actions/:id/approve', async (req, reply) => {
    const parsed = approveBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Missing approvedBy', details: parsed.error.flatten() });
    }

    try {
      const action = orchestrator.approve(req.params.id, parsed.data.approvedBy);
      return reply.send({ action });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = message.includes('not found') ? 404 : 409;
      return reply.code(code).send({ error: message });
    }
  });

  // POST /actions/:id/reject — reject a pending action
  app.post<{ Params: { id: string } }>('/actions/:id/reject', async (req, reply) => {
    const parsed = rejectBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Missing fields', details: parsed.error.flatten() });
    }

    try {
      const action = orchestrator.reject(req.params.id, parsed.data.rejectedBy, parsed.data.reason);
      return reply.send({ action });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = message.includes('not found') ? 404 : 409;
      return reply.code(code).send({ error: message });
    }
  });
}
