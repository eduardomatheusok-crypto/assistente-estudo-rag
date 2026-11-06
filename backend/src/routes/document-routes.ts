import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DocumentRecord } from '../repositories/document-repository.ts';
import type { DocumentService } from '../services/document-service.ts';
import { badRequest } from '../services/errors.ts';
import { idParams } from './schemas.ts';

const pageParams = idParams.extend({ pageNumber: z.coerce.number().int().min(1) });
const chunkQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** O caminho interno de armazenamento não é exposto na API. */
function toDto({ storagePath: _storagePath, ...document }: DocumentRecord) {
  return document;
}

export function documentRoutes(app: FastifyInstance, service: DocumentService): void {
  app.post('/notebooks/:id/documents', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const file = await request.file();
    if (!file) throw badRequest('Envie o arquivo no campo "file" (multipart/form-data).');

    const bytes = await file.toBuffer();
    const titleField = file.fields.title;
    const title =
      titleField && !Array.isArray(titleField) && titleField.type === 'field'
        ? String(titleField.value)
        : undefined;

    const document = await service.upload({ notebookId: id, filename: file.filename, bytes, title });
    return reply.code(202).send(toDto(document));
  });

  app.get('/notebooks/:id/documents', async (request) => {
    const { id } = idParams.parse(request.params);
    return (await service.listByNotebook(id)).map(toDto);
  });

  app.get('/documents/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    return toDto(await service.get(id));
  });

  app.get('/documents/:id/file', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { document, stream } = await service.openFile(id);
    return reply
      .type(document.mimeType === 'application/pdf' ? 'application/pdf' : `${document.mimeType}; charset=utf-8`)
      .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(document.originalFilename)}`)
      .send(stream);
  });

  app.get('/documents/:id/pages/:pageNumber', (request) => {
    const { id, pageNumber } = pageParams.parse(request.params);
    return service.getPage(id, pageNumber);
  });

  app.get('/documents/:id/chunks', (request) => {
    const { id } = idParams.parse(request.params);
    return service.listChunks(id, chunkQuery.parse(request.query));
  });

  app.delete('/documents/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await service.delete(id);
    return reply.code(204).send();
  });
}
