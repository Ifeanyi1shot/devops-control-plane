import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AiClient } from '../../integrations/ai/client';
import type { GitHubClient } from '../../integrations/github/client';
import { getService } from '../../services/registry';

const analyzeBody = z.object({
  serviceId: z.string(),
  currentSha: z.string(),
  targetSha: z.string(),
  reason: z.string().default(''),
});

export async function analyzeRoutes(
  app: FastifyInstance,
  github: GitHubClient,
  ai: AiClient | null,
) {
  app.post('/analyze', async (req, reply) => {
    if (!ai) {
      return reply.code(503).send({ error: 'AI analysis is not configured. Set ANTHROPIC_API_KEY to enable it.' });
    }

    const parsed = analyzeBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { serviceId, currentSha, targetSha, reason } = parsed.data;

    const svc = getService(serviceId);
    if (!svc) return reply.code(404).send({ error: 'Service not found' });

    if (currentSha === targetSha) {
      return reply.code(400).send({ error: 'currentSha and targetSha are the same — nothing to analyze' });
    }

    try {
      // base=target, head=current → shows what we're rolling back
      const diff = await github.getDetailedDiff(svc.repo, targetSha, currentSha);

      const analysis = await ai.analyzeRollback({
        repoName: svc.repo,
        currentSha,
        targetSha,
        reason,
        files: diff.files,
        commitMessages: diff.commitMessages,
        totalAdditions: diff.additions,
        totalDeletions: diff.deletions,
      });

      return reply.send({ analysis });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err }, '[AI] Rollback analysis failed');
      return reply.code(502).send({ error: `Analysis failed: ${message}` });
    }
  });
}
