# API (Fastify). O Node 24 roda o TypeScript direto, sem etapa de compilação.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

# Só as dependências de execução (sem TypeScript e Vitest): imagem menor.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
RUN mkdir -p /app/storage && chown node:node /app/storage

# Sem root dentro do container.
USER node
EXPOSE 3333
CMD ["node", "src/server.ts"]
