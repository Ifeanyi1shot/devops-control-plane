import type { FastifyInstance } from 'fastify';
import type { ActionOrchestrator } from '../../core/action/orchestrator';
import type { SlackClient } from '../../integrations/slack/client';

export async function slackRoutes(
  app: FastifyInstance,
  slack: SlackClient,
  orchestrator: ActionOrchestrator
) {
  // POST /slack/interactions — receives button clicks from Slack Block Kit messages.
  // Slack sends application/x-www-form-urlencoded with a `payload` field containing JSON.
  // Must respond with 200 within 3 seconds or Slack will retry.
  app.post('/slack/interactions', async (req, reply) => {
    const body = req.body as Record<string, string>;
    const rawPayload = body['payload'];

    if (!rawPayload) {
      return reply.code(400).send({ error: 'Missing payload' });
    }

    // Verify signature when the signing secret is configured
    if (slack.isConfigured()) {
      const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
      const signature = req.headers['x-slack-signature'] as string | undefined;
      const rawBody = (req as unknown as { rawBody?: string }).rawBody;

      if (!timestamp || !signature || !rawBody) {
        return reply.code(401).send({ error: 'Missing Slack verification headers' });
      }

      if (!slack.verifySignature(timestamp, rawBody, signature)) {
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawPayload) as Record<string, unknown>;
    } catch {
      return reply.code(400).send({ error: 'Invalid JSON in payload' });
    }

    if (payload['type'] !== 'block_actions') {
      return reply.code(200).send(); // Acknowledge unhandled payload types
    }

    const actions = payload['actions'] as Array<Record<string, string>> | undefined;
    const slackAction = actions?.[0];
    if (!slackAction) return reply.code(200).send();

    const actionId = slackAction['value'];
    const slackUser = payload['user'] as Record<string, string> | undefined;
    const actor = slackUser?.['real_name'] ?? slackUser?.['name'] ?? 'unknown';

    // Always respond 200 first — Slack requires acknowledgement within 3s
    void reply.code(200).send();

    // Process the approval/rejection asynchronously after acknowledging
    try {
      if (slackAction['action_id'] === 'approve_action') {
        const approved = orchestrator.approve(actionId, actor);
        await slack.resolveApprovalMessage(actionId, true, actor);
        app.log.info({ actionId, actor }, 'Action approved via Slack');

        // Execute the rollback immediately after Slack approval
        // (fire and forget — user monitors via the web UI)
        orchestrator.execute(actionId, async () => {
          app.log.info({ actionId }, 'Executing after Slack approval');
          return { approvedViaSlack: true, actor };
        }).catch((err: unknown) => {
          app.log.error({ err, actionId }, 'Post-Slack-approval execution failed');
        });

        return;
      }

      if (slackAction['action_id'] === 'reject_action') {
        orchestrator.reject(actionId, actor, 'Rejected via Slack');
        await slack.resolveApprovalMessage(actionId, false, actor, 'Rejected via Slack');
        app.log.info({ actionId, actor }, 'Action rejected via Slack');
      }
    } catch (err) {
      app.log.error({ err, actionId }, 'Slack interaction handler failed');
    }
  });
}
