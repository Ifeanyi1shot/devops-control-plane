import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PreviewEnvService } from '../../services/preview/service';

const createBody = z.object({
  serviceId: z.string(),
  branch: z.string().default('main'),
  commitSha: z.string(),
  image: z.string(),
  createdBy: z.string(),
});

const destroyBody = z.object({
  destroyedBy: z.string(),
});

export async function previewEnvRoutes(app: FastifyInstance, previewService: PreviewEnvService) {
  // POST /preview-env — spin up a new preview environment
  app.post('/preview-env', async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    try {
      const preview = await previewService.create(
        parsed.data.serviceId,
        parsed.data.branch,
        parsed.data.commitSha,
        parsed.data.image,
        parsed.data.createdBy
      );
      return reply.code(201).send({ preview });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: message });
    }
  });

  // GET /preview-env?serviceId=xxx — list active preview environments
  app.get('/preview-env', async (req, reply) => {
    const { serviceId } = req.query as { serviceId?: string };
    return reply.send({ previews: previewService.list(serviceId) });
  });

  // GET /preview-env/:id — get a single preview
  app.get<{ Params: { id: string } }>('/preview-env/:id', async (req, reply) => {
    try {
      return reply.send({ preview: previewService.get(req.params.id) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(404).send({ error: message });
    }
  });

  // DELETE /preview-env/:id — tear down a preview environment
  app.delete<{ Params: { id: string } }>('/preview-env/:id', async (req, reply) => {
    const parsed = destroyBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    try {
      const preview = await previewService.destroy(req.params.id, parsed.data.destroyedBy);
      return reply.send({ preview });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = message.includes('not found') ? 404 : 409;
      return reply.code(code).send({ error: message });
    }
  });
}
