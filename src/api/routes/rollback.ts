import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SlackClient } from '../../integrations/slack/client';
import type { RollbackService } from '../../services/rollback/service';
import type { ActionRequest } from '../../types/index';

const previewBody = z.object({
  serviceId: z.string(),
  environment: z.string().default('production'),
  requestedBy: z.string(),
  requestedByRole: z.string().default('engineer'),
  targetDeploymentId: z.string(),
  targetSha: z.string(),
  targetImage: z.string(),
  containerName: z.string().default('app'),
  reason: z.string(),
});

export async function rollbackRoutes(
  app: FastifyInstance,
  rollbackService: RollbackService,
  slack: SlackClient
) {
  // POST /rollback/preview
  // Evaluate policy, build a diff-enriched preview, return before touching anything.
  // If the action requires approval, fire a Slack notification in the background.
  app.post('/rollback/preview', async (req, reply) => {
    const parsed = previewBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const body = parsed.data;

    const request: ActionRequest = {
      type: 'rollback',
      serviceId: body.serviceId,
      requestedBy: body.requestedBy,
      requestedByRole: body.requestedByRole,
      environment: body.environment,
      params: {
        targetDeploymentId: body.targetDeploymentId,
        targetSha: body.targetSha,
        targetImage: body.targetImage,
        containerName: body.containerName,
        reason: body.reason,
      },
    };

    try {
      const { action, decision } = await rollbackService.previewRollback(request, {
        targetDeploymentId: body.targetDeploymentId,
        targetSha: body.targetSha,
        targetImage: body.targetImage,
        containerName: body.containerName,
        reason: body.reason,
      });

      // Fire Slack approval notification without blocking the response
      if (action.status === 'pending_approval') {
        slack.sendApprovalRequest(action, decision).catch((err: unknown) => {
          app.log.warn({ err }, '[Slack] Failed to send approval notification');
        });
      }

      return reply.code(decision.allowed ? 200 : 403).send({ action, decision });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({ error: message });
    }
  });

  // POST /rollback/:actionId/execute
  // Execute a previously previewed + approved rollback
  app.post<{ Params: { actionId: string } }>('/rollback/:actionId/execute', async (req, reply) => {
    try {
      const action = await rollbackService.executeRollback(req.params.actionId);
      return reply.send({ action });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = message.includes('not found') ? 404 : message.includes('state') ? 409 : 500;
      return reply.code(code).send({ error: message });
    }
  });
}
