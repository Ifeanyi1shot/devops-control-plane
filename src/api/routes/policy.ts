import fs from 'fs';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { PolicyEngine } from '../../core/policy/engine';
import type { ActionRequest, PolicyFile } from '../../types/index';

function safeName(filename: string): string | null {
  const base = path.basename(filename);
  if (!base.match(/^[\w-]+\.ya?ml$/)) return null;
  return base;
}

const ruleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  match: z.object({
    actionType: z.union([z.string(), z.array(z.string())]),
    environment: z.union([z.string(), z.array(z.string())]).optional(),
    role: z.union([z.string(), z.array(z.string())]).optional(),
  }),
  allow: z.boolean(),
  requireApproval: z.boolean().optional(),
  approverRole: z.string().optional(),
  timeRestriction: z.object({
    denyDays: z.array(z.string()).optional(),
    denyAfterHour: z.number().int().min(0).max(23).optional(),
    denyBeforeHour: z.number().int().min(0).max(23).optional(),
  }).optional(),
});

const policyFileSchema = z.object({
  version: z.string().default('1.0'),
  rules: z.array(ruleSchema),
});

const simulateBodySchema = z.object({
  type: z.enum(['rollback', 'deploy', 'restart', 'scale', 'preview_env']),
  serviceId: z.string().default('*'),
  requestedBy: z.string().default('anonymous'),
  requestedByRole: z.string().default('engineer'),
  environment: z.string().default('production'),
  params: z.record(z.string(), z.unknown()).default({}),
});

export async function policyRoutes(
  app: FastifyInstance,
  policyDir: string,
  engine: PolicyEngine,
) {
  // GET /policy/files — list all policy files with metadata
  app.get('/policy/files', async (_req, reply) => {
    if (!fs.existsSync(policyDir)) return reply.send({ files: [] });

    const files = fs.readdirSync(policyDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    const result = files.map((filename) => {
      try {
        const content = fs.readFileSync(path.join(policyDir, filename), 'utf8');
        const parsed = yaml.load(content) as PolicyFile;
        return { filename, version: parsed?.version ?? '1.0', ruleCount: parsed?.rules?.length ?? 0 };
      } catch {
        return { filename, version: '?', ruleCount: 0, error: 'Failed to parse' };
      }
    });
    return reply.send({ files: result });
  });

  // GET /policy/:filename — fetch a parsed policy file
  app.get<{ Params: { filename: string } }>('/policy/:filename', async (req, reply) => {
    const name = safeName(req.params.filename);
    if (!name) return reply.code(400).send({ error: 'Invalid filename' });

    const filePath = path.join(policyDir, name);
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'File not found' });

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const policy = yaml.load(content) as PolicyFile;
      return reply.send({ policy });
    } catch {
      return reply.code(500).send({ error: 'Failed to parse policy file' });
    }
  });

  // POST /policy/:filename — save a policy file and hot-reload the engine
  app.post<{ Params: { filename: string } }>('/policy/:filename', async (req, reply) => {
    const name = safeName(req.params.filename);
    if (!name) return reply.code(400).send({ error: 'Invalid filename' });

    const body = req.body as { policy?: unknown };
    const parsed = policyFileSchema.safeParse(body?.policy);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid policy', details: parsed.error.flatten() });
    }

    if (!fs.existsSync(policyDir)) fs.mkdirSync(policyDir, { recursive: true });

    fs.writeFileSync(
      path.join(policyDir, name),
      yaml.dump(parsed.data, { lineWidth: 120, quotingType: '"' }),
      'utf8',
    );

    engine.reload();
    app.log.info(`[Policy] Saved ${name} and reloaded engine`);
    return reply.send({ message: `${name} saved and policy engine reloaded` });
  });

  // DELETE /policy/:filename — delete a file (default.yaml is protected)
  app.delete<{ Params: { filename: string } }>('/policy/:filename', async (req, reply) => {
    const name = safeName(req.params.filename);
    if (!name) return reply.code(400).send({ error: 'Invalid filename' });
    if (name === 'default.yaml') return reply.code(403).send({ error: 'Cannot delete default.yaml' });

    const filePath = path.join(policyDir, name);
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'File not found' });

    fs.unlinkSync(filePath);
    engine.reload();
    return reply.send({ message: `${name} deleted` });
  });

  // POST /policy/simulate — dry-run policy evaluation against the live engine
  app.post('/policy/simulate', async (req, reply) => {
    const parsed = simulateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const actionReq: ActionRequest = parsed.data;
    const decision = engine.evaluate(actionReq);
    return reply.send({ decision, request: parsed.data });
  });
}
