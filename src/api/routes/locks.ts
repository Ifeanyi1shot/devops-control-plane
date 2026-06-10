import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuditStore } from '../../core/audit/store';
import type { LocksRepository } from '../../db/repositories/locks';
import { getService } from '../../services/registry';

const lockBody = z.object({
  lockedBy: z.string().min(1),
  reason: z.string().min(1),
});

const unlockBody = z.object({
  unlockedBy: z.string().min(1),
});

export async function locksRoutes(
  app: FastifyInstance,
  locks: LocksRepository,
  auditStore: AuditStore,
) {
  // GET /services/:id/lock — get current lock for a service
  app.get<{ Params: { id: string } }>('/services/:id/lock', async (req, reply) => {
    const svc = getService(req.params.id);
    if (!svc) return reply.code(404).send({ error: 'Service not found' });
    const lock = locks.findByServiceId(req.params.id);
    return reply.send({ lock });
  });

  // POST /services/:id/lock — lock a service
  app.post<{ Params: { id: string } }>('/services/:id/lock', async (req, reply) => {
    const svc = getService(req.params.id);
    if (!svc) return reply.code(404).send({ error: 'Service not found' });

    const existing = locks.findByServiceId(req.params.id);
    if (existing) {
      return reply.code(409).send({
        error: `Service is already locked by ${existing.lockedBy}`,
        lock: existing,
      });
    }

    const parsed = lockBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const lock = locks.lock(req.params.id, parsed.data.lockedBy, parsed.data.reason);

    auditStore.log(
      lock.id,
      'deploy',
      req.params.id,
      parsed.data.lockedBy,
      'service.locked',
      { reason: parsed.data.reason, serviceId: req.params.id },
    );

    return reply.code(201).send({ lock });
  });

  // DELETE /services/:id/lock — unlock a service
  app.delete<{ Params: { id: string } }>('/services/:id/lock', async (req, reply) => {
    const svc = getService(req.params.id);
    if (!svc) return reply.code(404).send({ error: 'Service not found' });

    const parsed = unlockBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const existing = locks.findByServiceId(req.params.id);
    if (!existing) {
      return reply.code(404).send({ error: 'Service is not locked' });
    }

    locks.unlock(req.params.id);

    auditStore.log(
      existing.id,
      'deploy',
      req.params.id,
      parsed.data.unlockedBy,
      'service.unlocked',
      { serviceId: req.params.id, previousLockedBy: existing.lockedBy },
    );

    return reply.send({ message: `${svc.name} unlocked by ${parsed.data.unlockedBy}` });
  });

  // GET /locks — all currently locked services
  app.get('/locks', async (_req, reply) => {
    return reply.send({ locks: locks.findAll() });
  });
}
