import 'dotenv/config';
import path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import staticFiles from '@fastify/static';

import { createDatabase } from './db/index';
import { PolicyEngine } from './core/policy/engine';
import { AuditStore } from './core/audit/store';
import { ActionOrchestrator } from './core/action/orchestrator';
import { AiClient } from './integrations/ai/client';
import { GitHubClient } from './integrations/github/client';
import { KubernetesClient } from './integrations/kubernetes/client';
import { SlackClient } from './integrations/slack/client';
import { RollbackService } from './services/rollback/service';
import { PreviewEnvService } from './services/preview/service';
import { registry } from './services/registry';

import { authRoutes } from './api/routes/auth';
import { analyzeRoutes } from './api/routes/analyze';
import { locksRoutes } from './api/routes/locks';
import { metricsRoutes } from './api/routes/metrics';
import { servicesRoutes } from './api/routes/services';
import { rollbackRoutes } from './api/routes/rollback';
import { actionsRoutes } from './api/routes/actions';
import { auditRoutes } from './api/routes/audit';
import { slackRoutes } from './api/routes/slack';
import { previewEnvRoutes } from './api/routes/preview';

const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'] ?? '';
const GITHUB_CLIENT_ID = process.env['GITHUB_CLIENT_ID'] ?? '';
const GITHUB_CLIENT_SECRET = process.env['GITHUB_CLIENT_SECRET'] ?? '';
const GITHUB_CALLBACK_URL = process.env['GITHUB_CALLBACK_URL'] ?? 'http://localhost:3002/auth/github/callback';
const APP_URL = process.env['APP_URL'] ?? 'http://localhost:5173';
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'change-me-in-production';
const ADMIN_GITHUB_LOGINS = (process.env['ADMIN_GITHUB_LOGINS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT = parseInt(process.env['PORT'] ?? '3002', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const GITHUB_TOKEN = process.env['GITHUB_TOKEN'] ?? '';
const POLICY_DIR = process.env['POLICY_DIR'] ?? path.join(process.cwd(), 'policies');
const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'] ?? '';
const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? '';
const SLACK_APPROVAL_CHANNEL = process.env['SLACK_APPROVAL_CHANNEL'] ?? '#platform-approvals';
const IS_PROD = process.env['NODE_ENV'] === 'production';

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

  const ai = ANTHROPIC_API_KEY ? new AiClient(ANTHROPIC_API_KEY) : null;

  const rollbackService = new RollbackService(orchestrator, github, k8s, registry, auditStore);
  const previewEnvService = new PreviewEnvService(k8s, db.previews);

  // ── Fastify server ────────────────────────────────────────────────────────
  const app = Fastify({ logger: { level: process.env['LOG_LEVEL'] ?? 'info' } });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: process.env['CORS_ORIGIN'] ?? '*' });

  // In production, serve the compiled React app as static files
  if (IS_PROD) {
    const frontendDist = path.join(process.cwd(), 'frontend', 'dist');
    await app.register(staticFiles, {
      root: frontendDist,
      prefix: '/',
      wildcard: false,
    });
  }

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

  // Health check (outside /api so load balancers can reach it)
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Auth routes (outside /api — GitHub redirects back here)
  await authRoutes(app, {
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackUrl: GITHUB_CALLBACK_URL,
    jwtSecret: JWT_SECRET,
    appUrl: APP_URL,
    adminLogins: ADMIN_GITHUB_LOGINS,
  });

  // Slack interactions webhook (outside /api — URL is set in Slack app settings)
  await slackRoutes(app, slack, orchestrator);

  // All API routes under /api prefix (matches frontend's BASE = '/api')
  await app.register(async (api) => {
    await analyzeRoutes(api, github, ai);
    await metricsRoutes(api, db.metrics);
    await locksRoutes(api, db.locks, auditStore);
    await servicesRoutes(api, github, db.locks);
    await rollbackRoutes(api, rollbackService, slack, db.locks);
    await actionsRoutes(api, orchestrator);
    await auditRoutes(api, auditStore);
    await previewEnvRoutes(api, previewEnvService);
  }, { prefix: '/api' });

  // SPA fallback — serve index.html for all unmatched routes in production
  if (IS_PROD) {
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/slack') || req.url.startsWith('/health')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n  DevOps Control Plane running at http://localhost:${PORT}`);
    console.log(`  Mode: ${IS_PROD ? 'production' : 'development'}`);
    console.log(`  Policy directory: ${POLICY_DIR}`);
    if (slack.isConfigured()) {
      console.log(`  Slack notifications → ${SLACK_APPROVAL_CHANNEL}`);
    }
    console.log(`  AI analysis        → ${ai ? 'enabled (claude-haiku)' : 'disabled (set ANTHROPIC_API_KEY)'}`);
    console.log('');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
