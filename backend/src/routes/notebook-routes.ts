import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { NotebookService } from '../services/notebook-service.ts';
import { idParams } from './schemas.ts';

const createBody = z.object({
  name: z.string().trim().min(1).max(200),
  discipline: z.string().trim().max(200).nullish(),
});

const updateBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    discipline: z.string().trim().max(200).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Informe ao menos um campo.');

export function notebookRoutes(app: FastifyInstance, service: NotebookService): void {
  app.post('/notebooks', async (request, reply) => {
    const body = createBody.parse(request.body);
    return reply.code(201).send(await service.create(body));
  });

  app.get('/notebooks', () => service.list());

  app.get('/notebooks/:id', (request) => {
    const { id } = idParams.parse(request.params);
    return service.get(id);
  });

  app.patch('/notebooks/:id', (request) => {
    const { id } = idParams.parse(request.params);
    return service.update(id, updateBody.parse(request.body));
  });

  app.delete('/notebooks/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await service.delete(id);
    return reply.code(204).send();
  });
}
