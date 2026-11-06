# Assistente de Aprendizagem com RAG

## Rodando localmente

```bash
docker compose up -d            # PostgreSQL + pgvector na porta 5433 (5432 costuma ser do Postgres local)
cd backend
cp .env.example .env            # preencha GEMINI_API_KEY (https://aistudio.google.com/apikey)
npm install
npm run dev                     # aplica as migrações e sobe a API na porta 3333
```

Em outro terminal, a interface:

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173 (repassa /api para o backend na 3333)
```

Com `EMBEDDING_PROVIDER=fake`, o upload e a busca não gastam cota de embeddings (vetores locais, sem semântica real). Perguntas e grifos continuam usando o Gemini.

## Testes

```bash
npm test                        # unitários (backend/ e frontend/)
npm run typecheck

# integração (SQL real); cria o banco de teste uma única vez:
docker compose exec postgres createdb -U notebook notebook_test
npm run test:integration
```

## Exemplo

```bash
curl -X POST localhost:3333/notebooks -H 'content-type: application/json' \
  -d '{"name": "Cálculo I", "discipline": "Matemática"}'

curl -F file=@apostila.pdf localhost:3333/notebooks/<id>/documents   # 202, status "processing"
curl localhost:3333/documents/<docId>                                # status "ready" | "failed"
curl localhost:3333/documents/<docId>/pages/1                        # texto + coordenadas
curl "localhost:3333/documents/<docId>/chunks?limit=20&offset=0"

# busca: strategy = "hybrid" (padrão) | "vector" | "lexical"; k = 5 por padrão
curl -X POST localhost:3333/notebooks/<id>/search -H 'content-type: application/json' \
  -d '{"query": "o que é derivada?", "strategy": "hybrid"}'

# pergunta com resposta citada (ou "Não encontrei no material.")
curl -X POST localhost:3333/notebooks/<id>/questions -H 'content-type: application/json' \
  -d '{"question": "O que a derivada mede?"}'
curl localhost:3333/citations/<citationId>                           # trecho original da citação
```
