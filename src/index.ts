import 'dotenv/config';
import path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

import { createDatabase } from './db/index';
import { PolicyEngine } from './core/policy/engine';
import { AuditStore } from './core/audit/store';
import { ActionOrchestrator } from './core/action/orchestrator';
import { GitHubClient } from './integrations/github/client';
import { KubernetesClient } from './integrations/kubernetes/client';
import { SlackClient } from './integrations/slack/client';
import { RollbackService } from './services/rollback/service';
import { PreviewEnvService } from './services/preview/service';
import { registry } from './services/registry';

import { servicesRoutes } from './api/routes/services';
import { rollbackRoutes } from './api/routes/rollback';
import { actionsRoutes } from './api/routes/actions';
import { auditRoutes } from './api/routes/audit';
import { slackRoutes } from './api/routes/slack';
import { previewEnvRoutes } from './api/routes/preview';

const PORT = parseInt(process.env['PORT'] ?? '3002', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const GITHUB_TOKEN = process.env['GITHUB_TOKEN'] ?? '';
const POLICY_DIR = process.env['POLICY_DIR'] ?? path.join(process.cwd(), 'policies');
const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'] ?? '';
const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? '';
const SLACK_APPROVAL_CHANNEL = process.env['SLACK_APPROVAL_CHANNEL'] ?? '#platform-approvals';

async function bootstrap() {
  // ── Database ──────────────────────────────────────────────────────────────
  const db = createDatabase();

  // ── Infrastructure ────────────────────────────────────────────────────────
  const policy = new PolicyEngine(POLICY_DIR);
  const auditStore = new AuditStore(db.audit);
  const orchestrator = new ActionOrchestrator(policy, db.actions, auditStore);
  const github = new GitHubClient(GITHUB_TOKEN);
  const k8s = new KubernetesClient();
  const slack = new SlackClient(SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_APPROVAL_CHANNEL);

  const rollbackService = new RollbackService(orchestrator, github, k8s, registry, auditStore);
  const previewEnvService = new PreviewEnvService(k8s, db.previews);

  // ── Fastify server ────────────────────────────────────────────────────────
  const app = Fastify({ logger: { level: process.env['LOG_LEVEL'] ?? 'info' } });

  await app.register(helmet);
  await app.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? '*',
  });

  // Parse URL-encoded bodies (required for Slack interactive payloads)
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (req, body, done) => {
      const parsed: Record<string, string> = {};
      for (const pair of (body as string).split('&')) {
        const [key, value] = pair.split('=');
        if (key) parsed[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
      }
      (req as unknown as { rawBody: string }).rawBody = body as string;
      done(null, parsed);
    }
  );

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Routes
  await servicesRoutes(app, github);
  await rollbackRoutes(app, rollbackService, slack);
  await actionsRoutes(app, orchestrator);
  await auditRoutes(app, auditStore);
  await slackRoutes(app, slack, orchestrator);
  await previewEnvRoutes(app, previewEnvService);

  // ── Start ─────────────────────────────────────────────────────────────────
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n  DevOps Control Plane running at http://localhost:${PORT}`);
    console.log(`  Policy directory: ${POLICY_DIR}`);
    if (slack.isConfigured()) {
      console.log(`  Slack notifications → ${SLACK_APPROVAL_CHANNEL}`);
    }
    console.log('');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
