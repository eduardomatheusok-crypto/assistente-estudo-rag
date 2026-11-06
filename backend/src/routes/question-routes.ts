import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { QuestionService } from '../services/question-service.ts';
import { SEARCH_STRATEGIES } from '../services/search-service.ts';
import { idParams } from './schemas.ts';

const askBody = z.object({
  question: z.string().trim().min(1).max(2000),
  strategy: z.enum(SEARCH_STRATEGIES).default('hybrid'),
});

export function questionRoutes(app: FastifyInstance, service: QuestionService): void {
  app.post('/notebooks/:id/questions', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    return reply.code(201).send(await service.ask({ notebookId: id, ...askBody.parse(request.body) }));
  });

  app.get('/notebooks/:id/questions', (request) => {
    const { id } = idParams.parse(request.params);
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    return service.listByNotebook(id, limit);
  });

  app.get('/questions/:id', (request) => {
    const { id } = idParams.parse(request.params);
    return service.get(id);
  });

  /** Ao clicar numa citação: o trecho original, a página e a posição exata no documento. */
  app.get('/citations/:id', (request) => {
    const { id } = idParams.parse(request.params);
    return service.getCitation(id);
  });
}
