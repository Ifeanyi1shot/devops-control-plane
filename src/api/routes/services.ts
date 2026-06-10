import type { FastifyInstance } from 'fastify';
import type { LocksRepository } from '../../db/repositories/locks';
import { GitHubClient } from '../../integrations/github/client';
import { getAllServices, getService } from '../../services/registry';

export async function servicesRoutes(
  app: FastifyInstance,
  github: GitHubClient,
  locks: LocksRepository,
) {
  // GET /services — list all services, each enriched with current lock if any
  app.get('/services', async (_req, reply) => {
    const services = getAllServices()
    const allLocks = locks.findAll()
    const lockMap = new Map(allLocks.map((l) => [l.serviceId, l]))
    const enriched = services.map((svc) => ({
      ...svc,
      lock: lockMap.get(svc.id) ?? null,
    }))
    return reply.send({ services: enriched })
  })

  // GET /services/:id — single service with lock info
  app.get<{ Params: { id: string } }>('/services/:id', async (req, reply) => {
    const svc = getService(req.params.id)
    if (!svc) return reply.code(404).send({ error: 'Service not found' })
    const lock = locks.findByServiceId(req.params.id)
    return reply.send({ service: { ...svc, lock: lock ?? null } })
  })

  // GET /services/:id/deployments — deployment history from GitHub
  app.get<{
    Params: { id: string }
    Querystring: { environment?: string; limit?: string }
  }>('/services/:id/deployments', async (req, reply) => {
    const svc = getService(req.params.id)
    if (!svc) return reply.code(404).send({ error: 'Service not found' })

    const environment = req.query.environment ?? 'production'
    const limit = Math.min(parseInt(req.query.limit ?? '10', 10), 50)

    try {
      const deployments = await github.getDeploymentHistory(svc.repo, environment, limit)
      return reply.send({ deployments })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return reply.code(502).send({ error: `GitHub API error: ${message}` })
    }
  })
}
