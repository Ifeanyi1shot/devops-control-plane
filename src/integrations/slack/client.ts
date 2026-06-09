import { WebClient } from '@slack/web-api';
import crypto from 'crypto';
import type { Action, PolicyDecision } from '../../types/index';

interface PendingMessage {
  channel: string;
  ts: string;
  serviceName: string;
}

export class SlackClient {
  private web: WebClient | null = null;
  private signingSecret: string;
  private approvalChannel: string;
  // actionId → message reference so we can update it after approve/reject
  private pendingMessages = new Map<string, PendingMessage>();

  constructor(botToken: string, signingSecret: string, approvalChannel: string) {
    this.signingSecret = signingSecret;
    this.approvalChannel = approvalChannel || '#platform-approvals';

    if (botToken) {
      this.web = new WebClient(botToken);
      console.log('[Slack] Client initialized.');
    } else {
      console.warn('[Slack] SLACK_BOT_TOKEN not set — approval notifications disabled.');
    }
  }

  isConfigured(): boolean {
    return this.web !== null;
  }

  async sendApprovalRequest(action: Action, decision: PolicyDecision): Promise<void> {
    if (!this.web) return;

    const { preview } = action;
    const riskEmoji = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' }[preview.riskLevel] ?? '⚪';
    const targetSha = String(action.params['targetSha'] ?? '').substring(0, 7);

    const result = await this.web.chat.postMessage({
      channel: this.approvalChannel,
      text: `Rollback approval required for ${preview.service.name} (${action.environment})`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '⚠️ Rollback Approval Required', emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Service:*\n${preview.service.name}` },
            { type: 'mrkdwn', text: `*Environment:*\n\`${action.environment}\`` },
            { type: 'mrkdwn', text: `*Requested by:*\n${action.requestedBy}` },
            { type: 'mrkdwn', text: `*Risk:*\n${riskEmoji} ${preview.riskLevel.toUpperCase()}` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*What will change:*\n${preview.changes.slice(0, 3).map((c) => `• \`${c}\``).join('\n')}` },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Risks:*\n${preview.risks.map((r) => `• ${r}`).join('\n')}` },
        },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              style: 'primary',
              text: { type: 'plain_text', text: '✓ Approve', emoji: true },
              action_id: 'approve_action',
              value: action.id,
              confirm: {
                title: { type: 'plain_text', text: 'Approve this rollback?' },
                text: {
                  type: 'mrkdwn',
                  text: `Approve rollback of *${preview.service.name}* to \`${targetSha}\` in *${action.environment}*?`,
                },
                confirm: { type: 'plain_text', text: 'Yes, approve' },
                deny: { type: 'plain_text', text: 'Cancel' },
              },
            },
            {
              type: 'button',
              style: 'danger',
              text: { type: 'plain_text', text: '✗ Reject', emoji: true },
              action_id: 'reject_action',
              value: action.id,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Action ID: \`${action.id}\` · Policy: \`${decision.matchedRule}\` · Required approver role: \`${decision.approverRole ?? 'senior-engineer'}\``,
            },
          ],
        },
      ],
    });

    if (result.ts && result.channel) {
      this.pendingMessages.set(action.id, {
        channel: result.channel,
        ts: result.ts,
        serviceName: preview.service.name,
      });
      console.log(`[Slack] Approval request sent for action ${action.id}`);
    }
  }

  async resolveApprovalMessage(
    actionId: string,
    approved: boolean,
    actor: string,
    reason?: string
  ): Promise<void> {
    if (!this.web) return;

    const pending = this.pendingMessages.get(actionId);
    if (!pending) return;

    const statusLine = approved
      ? `✅ Approved by *${actor}* — rollback is executing.`
      : `❌ Rejected by *${actor}*.${reason ? ` Reason: _${reason}_` : ''}`;

    await this.web.chat.update({
      channel: pending.channel,
      ts: pending.ts,
      text: statusLine,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*${pending.serviceName}* rollback\n${statusLine}` },
        },
      ],
    });

    this.pendingMessages.delete(actionId);
  }

  // Verifies the X-Slack-Signature header to prevent spoofed callbacks
  verifySignature(timestamp: string, rawBody: string, signature: string): boolean {
    if (!this.signingSecret) return false;

    const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
    if (age > 300) return false; // reject replays older than 5 min

    const baseString = `v0:${timestamp}:${rawBody}`;
    const expected = 'v0=' + crypto.createHmac('sha256', this.signingSecret).update(baseString).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}
