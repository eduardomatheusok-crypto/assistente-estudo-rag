import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEFAULT_TOP_K, SEARCH_STRATEGIES, type SearchService } from '../services/search-service.ts';
import { idParams } from './schemas.ts';

const searchBody = z.object({
  query: z.string().trim().min(1).max(2000),
  strategy: z.enum(SEARCH_STRATEGIES).default('hybrid'),
  k: z.number().int().min(1).max(50).default(DEFAULT_TOP_K),
});

export function searchRoutes(app: FastifyInstance, service: SearchService): void {
  app.post('/notebooks/:id/search', (request) => {
    const { id } = idParams.parse(request.params);
    return service.search({ notebookId: id, ...searchBody.parse(request.body) });
  });
}
