import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PracticeService } from '../services/practice-service.ts';
import { idParams } from './schemas.ts';

const profileBody = z.object({ goalType: z.enum(['prova', 'entrevista']) });

const startBody = z
  .object({
    mode: z.enum(['simulation', 'flashcards']),
    focus: z.enum(['general', 'errors', 'question']),
    questionId: z.uuid().optional(),
  })
  .refine((b) => b.focus !== 'question' || b.questionId, 'Informe questionId quando focus = question.');

const answerBody = z
  .object({
    itemId: z.uuid(),
    option: z.number().int().min(0).max(3).optional(),
    text: z.string().max(5000).optional(),
  })
  .refine((b) => b.option !== undefined || b.text !== undefined, 'Envie option (prova) ou text (entrevista).');

const reviewBody = z.object({ itemId: z.uuid(), correct: z.boolean() });

export function practiceRoutes(app: FastifyInstance, service: PracticeService): void {
  app.get('/notebooks/:id/profile', (request) => {
    const { id } = idParams.parse(request.params);
    return service.getProfile(id);
  });

  app.put('/notebooks/:id/profile', (request) => {
    const { id } = idParams.parse(request.params);
    return service.setProfile(id, profileBody.parse(request.body).goalType);
  });

  app.post('/notebooks/:id/practice-sessions', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    return reply.code(201).send(await service.start({ notebookId: id, ...startBody.parse(request.body) }));
  });

  app.get('/practice-sessions/:id', (request) => {
    const { id } = idParams.parse(request.params);
    return service.get(id);
  });

  app.post('/practice-sessions/:id/answers', (request) => {
    const { id } = idParams.parse(request.params);
    return service.answer(id, answerBody.parse(request.body));
  });

  app.post('/practice-sessions/:id/reviews', (request) => {
    const { id } = idParams.parse(request.params);
    return service.review(id, reviewBody.parse(request.body));
  });

  app.post('/practice-sessions/:id/finish', (request) => {
    const { id } = idParams.parse(request.params);
    return service.finish(id);
  });

  app.get('/notebooks/:id/priorities', (request) => {
    const { id } = idParams.parse(request.params);
    return service.priorities(id);
  });

  app.get('/practice-items/:id/source', (request) => {
    const { id } = idParams.parse(request.params);
    return service.itemSource(id);
  });
}
