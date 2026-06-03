import type { FastifyInstance } from 'fastify';
import { getAllServices, getService } from '../../services/registry';
import { GitHubClient } from '../../integrations/github/client';

export async function servicesRoutes(app: FastifyInstance, github: GitHubClient) {
  // GET /services — list all registered services
  app.get('/services', async (_req, reply) => {
    return reply.send({ services: getAllServices() });
  });

  // GET /services/:id — get a single service
  app.get<{ Params: { id: string } }>('/services/:id', async (req, reply) => {
    const svc = getService(req.params.id);
    if (!svc) return reply.code(404).send({ error: 'Service not found' });
    return reply.send({ service: svc });
  });

  // GET /services/:id/deployments — fetch deployment history from GitHub
  app.get<{
    Params: { id: string };
    Querystring: { environment?: string; limit?: string };
  }>('/services/:id/deployments', async (req, reply) => {
    const svc = getService(req.params.id);
    if (!svc) return reply.code(404).send({ error: 'Service not found' });

    const environment = req.query.environment ?? 'production';
    const limit = Math.min(parseInt(req.query.limit ?? '10', 10), 50);

    try {
      const deployments = await github.getDeploymentHistory(svc.repo, environment, limit);
      return reply.send({ deployments });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: `GitHub API error: ${message}` });
    }
  });
}
