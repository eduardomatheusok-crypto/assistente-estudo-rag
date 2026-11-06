import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { HighlightService } from '../services/highlight-service.ts';
import { idParams } from './schemas.ts';

const criterionBody = z.object({
  label: z.string().trim().min(1).max(80),
  instruction: z.string().trim().min(10).max(1000),
});

const startBody = z.object({
  criterionIds: z.array(z.uuid()).min(1).max(10),
});

const listQuery = z.object({
  criterionId: z.uuid().optional(),
  runId: z.uuid().optional(),
});

export function highlightRoutes(app: FastifyInstance, service: HighlightService): void {
  app.get('/notebooks/:id/highlight-criteria', (request) => {
    const { id } = idParams.parse(request.params);
    return service.listCriteria(id);
  });

  app.post('/notebooks/:id/highlight-criteria', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    return reply.code(201).send(await service.createCriterion(id, criterionBody.parse(request.body)));
  });

  app.delete('/highlight-criteria/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await service.deleteCriterion(id);
    return reply.code(204).send();
  });

  /** Inicia os grifos (um run por critério). 202: o processamento continua em segundo plano. */
  app.post('/documents/:id/highlight-runs', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { criterionIds } = startBody.parse(request.body);
    return reply.code(202).send(await service.start(id, criterionIds));
  });

  app.get('/highlight-runs/:id', (request) => {
    const { id } = idParams.parse(request.params);
    return service.getRun(id);
  });

  app.get('/documents/:id/highlights', (request) => {
    const { id } = idParams.parse(request.params);
    return service.list(id, listQuery.parse(request.query));
  });
}
