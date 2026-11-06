/** Erros de negócio; a camada de rotas os traduz em status HTTP. */
export class ServiceError extends Error {
  readonly statusCode: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(statusCode: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const notFound = (what: string) => new ServiceError(404, `${what} não encontrado.`);
export const badRequest = (message: string) => new ServiceError(400, message);
export const conflict = (message: string, details?: Record<string, unknown>) =>
  new ServiceError(409, message, details);
export const unsupportedMedia = (message: string) => new ServiceError(415, message);
