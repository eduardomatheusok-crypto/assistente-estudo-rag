# Assistente de Aprendizagem com RAG

Assistente de estudos que trabalha **só com o seu material**. Você envia apostilas e anotações (PDF, Markdown ou TXT), organizadas em cadernos por disciplina, e pode:

- **Perguntar ao material:** cada resposta cita a fonte [documento, página]. Clicar na citação abre o trecho original destacado. Se a resposta não está no material, o assistente diz *"Não encontrei no material."* e não inventa.
- **Grifar por critério:** definições, fórmulas, datas, exemplos, conceitos fundamentais ou um critério seu. Cada grifo vem com a justificativa e aparece pintado sobre o PDF.
- **Treinar:** a partir de qualquer resposta, gerar **flashcards** (estilo Gemini) ou uma **simulação** de prova ou de entrevista, com correção e link para o trecho do material.

Tudo foi pensado para caber na **cota gratuita** do Gemini.

---

## Sumário

1. [Requisitos](#requisitos)
2. [Instalação](#instalação)
3. [Como usar](#como-usar)
4. [Cota do Gemini: quanto cada ação gasta](#cota-do-gemini-quanto-cada-ação-gasta)
5. [Configuração (.env)](#configuração-env)
6. [Avaliação automática](#avaliação-automática)
7. [Testes](#testes)
8. [Problemas comuns](#problemas-comuns)
9. [Como o projeto funciona](#como-o-projeto-funciona)
10. [API](#api)

---

## Requisitos

| Ferramenta | Versão | Para quê |
|---|---|---|
| [Node.js](https://nodejs.org) | 24 ou mais | Backend e frontend (o backend roda TypeScript direto no Node) |
| [Docker](https://www.docker.com/) (Docker Desktop) | qualquer recente | Banco PostgreSQL com pgvector |
| Chave da API do Gemini | gratuita | Embeddings e respostas. Crie em <https://aistudio.google.com/apikey> |
| Navegador | Chrome, Firefox, Edge | Interface |

## Instalação

**1. Suba o banco de dados** (na raiz do projeto):

```bash
docker compose up -d
```

O PostgreSQL fica na porta **5433**, e não na 5432 padrão, para não conflitar com um Postgres instalado no seu computador.

**2. Configure o backend:**

```bash
cd backend
cp .env.example .env
```

Abra o `.env` e preencha a sua chave em `GEMINI_API_KEY=`. O resto já vem pronto.

**3. Instale e inicie o backend:**

```bash
npm install
npm run dev
```

Na primeira vez, as tabelas são criadas sozinhas. A API fica em `http://localhost:3333`.

**4. Em outro terminal, instale e inicie a interface:**

```bash
cd frontend
npm install
npm run dev
```

**5. Abra <http://localhost:5173>.**

Nas próximas vezes, basta: `docker compose up -d`, depois `npm run dev` no `backend/` e no `frontend/`.

---

## Como usar

A tela tem três áreas: **cadernos e documentos** à esquerda, o **documento** no centro e, à direita, as abas **Perguntas** e **Grifos**. A barra da esquerda recolhe no **⟨** (o sistema lembra da escolha).

### 1. Crie um caderno

Na barra da esquerda, clique no **+** ao lado de *Cadernos*, digite o nome (ex.: *Cálculo I*) e, se quiser, a disciplina. Clique em **Criar caderno**.

Ao clicar num caderno, abre a **tela inicial** dele: perguntas feitas, grifos, flashcards revisados, média nas simulações, os documentos, a atividade recente (*Continue de onde parou*) e os **acertos por assunto**.

### 2. Envie seus documentos

Clique em **Enviar PDF, MD ou TXT**, no rodapé da barra da esquerda, ou arraste os arquivos até lá.

- O documento aparece como **processando** e, em alguns segundos, fica **pronto**.
- Clique nele para abrir no centro. O zoom do PDF fica na pílula do canto inferior direito (− / +).
- O mesmo arquivo não pode ser enviado duas vezes no mesmo caderno.
- **PDF escaneado** (imagem, sem texto selecionável) não é aceito: o sistema não faz OCR.

### 3. Pergunte ao material (aba Perguntas)

Digite a pergunta e tecle **Enter**.

- A resposta traz marcadores como **[S1]**. Clique no marcador ou na citação embaixo da resposta: o documento abre na página certa, com o trecho pintado de vermelho.
- Se o material não tiver a resposta, você recebe *"Não encontrei no material."* Isso é intencional: o assistente não usa conhecimento de fora.

### 4. Grife o documento (aba Grifos)

Com um documento pronto aberto:

1. Marque um ou mais critérios: **Definições**, **Fórmulas**, **Datas**, **Exemplos**, **Conceitos fundamentais**.
2. Clique em **Grifar**. O progresso aparece na tela (lotes, tempo e custo estimado).
3. Os grifos ficam pintados no PDF, cada critério com uma cor, e listados com a **justificativa**. Clique num grifo da lista para ir até ele. A caixa ao lado de cada critério mostra ou esconde as cores no documento.

**Critério próprio:** em *Criar meu critério*, dê um nome (ex.: *Cai na prova*) e descreva o que grifar.

Todo grifo é conferido: se o texto não existe **literalmente** no documento, ele é descartado.

### 5. Escolha o objetivo do caderno

No topo da aba Perguntas, em **Objetivo**, escolha:

| Objetivo | Flashcards | Simulação |
|---|---|---|
| **Prova** | Frente com um termo para explicar ("Mitocôndria", "DTO") | Até 10 questões de múltipla escolha (Examinador), corrigidas na hora |
| **Entrevista** | Frente com uma pergunta curta para pensar | Até 5 perguntas abertas (Entrevistador), com nota de 0 a 10 e comentário |

### 6. Treine a partir de uma resposta

Embaixo de cada resposta com citações aparece **Treinar este assunto: [Flashcards] [Simulação]**.

**Flashcards:**
- Clique no cartão para **virar** e ver a resposta.
- Marque **Errei** ou **Acertei**. O que você errou volta antes (repetição espaçada).
- Use **‹ ›** para navegar e **⤨** para embaralhar.
- No fim, **Gerar mais cartões: +5, +10 ou +15**, sem repetir os que já existem.
- Clique em **Fechar** para encerrar a rodada.

**Simulação de prova (Examinador):** escolha a alternativa e clique em **Responder**. A certa fica verde, a sua fica vermelha se estiver errada, e aparece a explicação. No fim, o resultado com cada questão.

**Simulação de entrevista (Entrevistador):** uma conversa, uma pergunta por vez.
- Escolha como responder:
  - **Livre:** um campo só;
  - **Guiada:** *Definição → Exemplo → Por que importa*, para perguntas sobre conceitos;
  - **STAR:** *Situação → Tarefa → Ação → Resultado*, para "conte uma vez em que…".
- O **medidor de fala** estima quanto tempo você levaria falando (~130 palavras por minuto). O ideal é entre 45 s e 2 min.
- O rascunho fica salvo neste navegador.
- Ao enviar, você recebe:
  - a **nota geral**;
  - notas de **Precisão, Estrutura, Clareza e Exemplo**;
  - **o que faltou**;
  - uma **resposta-modelo** tirada do material.
- **Tentar de novo** reavalia a mesma pergunta (1 chamada a mais). No fim, a média por critério mostra o seu ponto a melhorar.

**Modo foco:** nos treinos, o chat da direita recolhe para não atrapalhar. O botão **Chat** o traz de volta, e **Fechar** encerra o treino.

Em todas as questões, **Ver no material** abre o trecho que fundamenta a resposta. Para voltar ao treino, use **Voltar à prática** na barra do documento.

---

## Cota do Gemini: quanto cada ação gasta

O projeto usa só a **cota gratuita**. O limite é de **requisições por minuto e por dia**, e cada modelo tem a sua cota. Acompanhe o uso em <https://ai.dev/rate-limit>.

| Ação | Chamadas ao Gemini |
|---|---|
| Enviar um documento | 1 por lote de até 100 trechos (embeddings) |
| Fazer uma pergunta | 2 (embedding da pergunta + resposta) |
| Grifar um documento | 1 por critério a cada ~6.000 caracteres |
| Flashcards de uma resposta | 1 (ou 0, se reaproveitar cartões ainda não revisados) |
| Gerar mais cartões | 1 por clique |
| Simulação de prova | 1 (ou 0, se reaproveitar questões) |
| Simulação de entrevista | 1 para gerar + 1 por resposta avaliada |
| Virar, Acertei/Errei, embaralhar, abrir citações | 0 |

**Dicas:**
- Se aparecer *"Provedor de IA indisponível ou no limite de uso"*, a cota do minuto ou do dia acabou. O sistema já tenta de novo sozinho algumas vezes; a cota diária renova à meia-noite do horário do Pacífico (por volta das 4h–5h em Brasília).
- Para ver quanto cada operação custaria no plano pago, consulte a tabela `llm_calls`:

  ```bash
  docker compose exec postgres psql -U notebook -d notebook -c "
  SELECT model, operation, count(*) AS chamadas, round(sum(cost_usd)::numeric, 5) AS custo_usd
    FROM llm_calls GROUP BY model, operation ORDER BY model, operation;"
  ```

**Privacidade:** na cota gratuita, o Google pode usar o conteúdo enviado para melhorar os produtos dele. Evite enviar documentos com dados sigilosos ou pessoais de terceiros.

---

## Configuração (.env)

Arquivo `backend/.env` (modelo em `backend/.env.example`):

| Variável | Padrão | O que faz |
|---|---|---|
| `GEMINI_API_KEY` | (obrigatória) | Sua chave do Gemini |
| `DATABASE_URL` | `postgres://notebook:notebook@localhost:5433/notebook` | Banco principal |
| `PORT` | `3333` | Porta da API |
| `STORAGE_DIR` | `./storage` | Pasta dos arquivos enviados (nome = hash SHA-256) |
| `MAX_UPLOAD_MB` | `50` | Tamanho máximo de upload |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | `1000` / `150` | Tamanho dos trechos e sobreposição, em caracteres |
| `EMBEDDING_PROVIDER` | `gemini` | `fake` gera vetores locais (não gasta cota, mas a busca por significado deixa de funcionar de verdade) |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-2` | Modelo de embeddings |
| `GEMINI_LLM_MODEL` | `gemini-3.5-flash-lite` | Modelo das respostas, grifos e treinos |
| `GEMINI_THINKING_LEVEL` | `LOW` | Quanto o modelo "pensa" antes (`MINIMAL`, `LOW`, `MEDIUM`, `HIGH`) |
| `HIGHLIGHT_BATCH_CHARS` | `6000` | Texto enviado por chamada ao grifar |
| `TEST_DATABASE_URL` | `…/notebook_test` | Banco dos testes de integração (**apagado** a cada execução) |
| `EVAL_DATABASE_URL` | `…/notebook_eval` | Banco das avaliações (**apagado** a cada execução) |
| `GEMINI_JUDGE_MODEL` | `gemini-3.8-flash` | Modelo que julga as respostas na avaliação |

---

## Avaliação automática

Scripts que medem a **qualidade técnica** da IA com datasets em JSON (pasta `backend/eval/datasets/`). Eles usam o Gemini real, então **gastam cota**. Antes da primeira execução, crie o banco de avaliação:

```bash
docker compose exec postgres createdb -U notebook notebook_eval
```

**Respostas (RAG):** Recall@5, precisão das citações, correção, recusa correta, taxa de alucinação, latência e custo por pergunta. Também compara tamanhos de trecho e estratégias de busca.

```bash
cd backend
npm run eval -- --dataset eval/datasets/calculo-exemplo/dataset.json --chunks 300:50 --strategies hybrid
npm run eval -- --dataset <arquivo> --retrieval-only     # só a busca: bem mais barato
```

**Grifos:** precisão, revocação e F1 por critério, e quantos grifos foram inventados (descartados).

```bash
npm run eval:highlights -- --dataset eval/datasets/calculo-exemplo/highlights.json
```

Os relatórios ficam em `backend/eval/results/` (Markdown e JSON). Para avaliar o seu material, copie a pasta `calculo-exemplo`, troque os documentos e escreva as perguntas, as respostas esperadas e os trechos que comprovam cada uma.

As **métricas de aprendizagem** (acertos e erros nos treinos) ficam separadas das técnicas, na tabela `attempts`.

---

## Testes

Os testes **não usam o Gemini**: o LLM e os embeddings são simulados.

```bash
cd backend
npm run typecheck
npm test                                   # unitários
docker compose exec postgres createdb -U notebook notebook_test   # só na primeira vez
npm run test:integration                   # integração, com PostgreSQL real

cd ../frontend
npm run typecheck
npm test
```

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `docker compose up` falha com *port is already allocated* | Outro serviço usa a porta 5433 | Defina `POSTGRES_HOST_PORT=5434` antes do comando e ajuste o `DATABASE_URL` |
| Backend: *ECONNREFUSED* ou *autenticação falhou* | Docker desligado, ou conectando no Postgres errado | Ligue o Docker Desktop, rode `docker compose up -d` e confira a porta 5433 no `.env` |
| Backend: *GEMINI_API_KEY é obrigatória* | `.env` sem a chave | Preencha `GEMINI_API_KEY` |
| *Provedor de IA indisponível ou no limite de uso* | Cota do Gemini esgotada (429) ou modelo sobrecarregado (503) | Espere alguns minutos ou a cota diária renovar |
| Documento fica como **falhou** | PDF escaneado, protegido por senha ou corrompido; ou falha nos embeddings | Passe o mouse sobre o documento para ver o motivo |
| *Este arquivo já existe no caderno* | O mesmo arquivo foi enviado de novo | Nada a fazer: ele já está lá |
| *Escolha o objetivo do caderno* ao treinar | O caderno ainda não tem objetivo | Escolha Prova ou Entrevista no topo da aba Perguntas |
| A interface diz que não fala com o backend | O backend não está rodando | `npm run dev` em `backend/` |

---

## Como o projeto funciona

```
Upload → extração (texto + coordenadas no PDF) → trechos (chunks) → embeddings → PostgreSQL + pgvector
Pergunta → busca híbrida (palavras + significado) → 5 trechos → Gemini responde em JSON → citações conferidas no texto original
```

- **Busca híbrida:** combina a busca por palavras (full-text em português, sem acentos) com a busca por significado (embeddings), pela posição de cada trecho nas duas listas (Reciprocal Rank Fusion).
- **Nada inventado:** toda citação, grifo, questão e flashcard precisa apontar para um trecho que existe **literalmente** no documento; o que não existe é descartado.
- **Coordenadas:** cada pedaço de texto do PDF guarda sua posição na página, e isso permite pintar citações e grifos exatamente sobre o texto.
- **Custo e latência:** toda etapa registra o tempo (`step_timings`) e toda chamada ao Gemini registra tokens e custo estimado (`llm_calls`).

**Stack:** TypeScript, Node.js 24, Fastify, Zod, PostgreSQL 17 + pgvector, PDF.js, React 19, Vite, Motion (animações), Vitest, Gemini (REST, sem SDK).

**Estrutura:**

```
backend/
  src/
    routes/         # HTTP: valida a entrada e chama os serviços
    services/       # regras e orquestração
    repositories/   # todo o SQL
    providers/      # Gemini (LLM e embeddings), armazenamento de arquivos
    domain/         # funções puras: chunking, busca, validação, grifos, prática
    db/migrations/  # arquivos .sql numerados, aplicados ao iniciar
  eval/             # avaliação automática e datasets
  tests/            # unitários e de integração
frontend/
  src/
    components/     # telas: chat, grifos, visualizador, prática
    lib/            # funções puras (coordenadas, marcações, embaralhar)
```

---

## API

Base: `http://localhost:3333` (pela interface, `/api/...`).

| Área | Endpoints |
|---|---|
| Cadernos | `GET/POST /notebooks` · `GET/PATCH/DELETE /notebooks/:id` |
| Documentos | `GET/POST /notebooks/:id/documents` · `GET/DELETE /documents/:id` · `GET /documents/:id/file` · `GET /documents/:id/pages/:n` · `GET /documents/:id/chunks` |
| Busca | `POST /notebooks/:id/search` `{ query, strategy: hybrid\|vector\|lexical, k }` |
| Perguntas | `GET/POST /notebooks/:id/questions` · `GET /questions/:id` · `GET /citations/:id` |
| Grifos | `GET/POST /notebooks/:id/highlight-criteria` · `DELETE /highlight-criteria/:id` · `POST /documents/:id/highlight-runs` · `GET /highlight-runs/:id` · `GET /documents/:id/highlights` |
| Prática | `GET /notebooks/:id/overview` · `GET/PUT /notebooks/:id/profile` · `POST /notebooks/:id/practice-sessions` · `GET /practice-sessions/:id` · `POST /practice-sessions/:id/answers` · `POST /practice-sessions/:id/reviews` · `POST /practice-sessions/:id/more` · `POST /practice-sessions/:id/finish` · `GET /practice-items/:id/source` · `GET /notebooks/:id/priorities` |

Exemplo:

```bash
curl -X POST localhost:3333/notebooks -H 'content-type: application/json' -d '{"name": "Cálculo I"}'
curl -F file=@apostila.pdf localhost:3333/notebooks/<id>/documents
curl -X POST localhost:3333/notebooks/<id>/questions -H 'content-type: application/json' \
  -d '{"question": "O que a derivada mede?"}'
```
