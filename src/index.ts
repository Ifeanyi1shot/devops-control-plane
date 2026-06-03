import 'dotenv/config';
import path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

import { PolicyEngine } from './core/policy/engine';
import { ActionOrchestrator } from './core/action/orchestrator';
import { GitHubClient } from './integrations/github/client';
import { KubernetesClient } from './integrations/kubernetes/client';
import { RollbackService } from './services/rollback/service';
import { registry } from './services/registry';

import { servicesRoutes } from './api/routes/services';
import { rollbackRoutes } from './api/routes/rollback';
import { actionsRoutes } from './api/routes/actions';
import { auditRoutes } from './api/routes/audit';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const GITHUB_TOKEN = process.env['GITHUB_TOKEN'] ?? '';
const POLICY_DIR = process.env['POLICY_DIR'] ?? path.join(process.cwd(), 'policies');

async function bootstrap() {
  // ── Infrastructure ────────────────────────────────────────────────────────
  const policy = new PolicyEngine(POLICY_DIR);
  const orchestrator = new ActionOrchestrator(policy);
  const github = new GitHubClient(GITHUB_TOKEN);
  const k8s = new KubernetesClient();

  const rollbackService = new RollbackService(orchestrator, github, k8s, registry);

  // ── Fastify server ────────────────────────────────────────────────────────
  const app = Fastify({ logger: { level: process.env['LOG_LEVEL'] ?? 'info' } });

  await app.register(helmet);
  await app.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? '*',
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Routes
  await servicesRoutes(app, github);
  await rollbackRoutes(app, rollbackService);
  await actionsRoutes(app, orchestrator);
  await auditRoutes(app);

  // ── Start ─────────────────────────────────────────────────────────────────
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n  DevOps Control Plane running at http://localhost:${PORT}`);
    console.log(`  Policy directory: ${POLICY_DIR}\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
