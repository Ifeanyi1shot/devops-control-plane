import type { FastifyInstance } from 'fastify';
import type { MetricsRepository } from '../../db/repositories/metrics';

export async function metricsRoutes(app: FastifyInstance, metrics: MetricsRepository) {
  app.get('/metrics', async (_req, reply) => {
    const summary = metrics.getSummary();
    const deploymentFrequency = metrics.getDeploymentFrequency(30);
    const mttrTrend = metrics.getMttrTrend(30);
    const topActors = metrics.getTopActors(5);
    const actionBreakdown = metrics.getActionBreakdown();

    return reply.send({
      summary,
      deploymentFrequency,
      mttrTrend,
      topActors,
      actionBreakdown,
    });
  });
}
