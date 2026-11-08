**English** | [Português](README.pt-BR.md)

<p align="center">
  <img src="docs/assets/logo.svg" width="96" alt="RAG Study Assistant icon">
</p>

<h1 align="center">RAG Study Assistant</h1>

<p align="center">
  <b>Study with your own material only.</b> Upload handouts and notes, ask questions and get answers with the page they came from,
  highlights checked against the original text, and practice with flashcards, mock exams and graded interviews.
</p>

<p align="center">
  <a href="https://github.com/eduardomatheusok-crypto/assistente-estudo-rag/actions/workflows/ci.yml"><img src="https://github.com/eduardomatheusok-crypto/assistente-estudo-rag/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL with pgvector">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/Gemini-free%20tier-8E75B2?logo=googlegemini&logoColor=white" alt="Gemini free tier">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#-quick-start">Quick start</a> ·
  <a href="#-what-it-does">What it does</a> ·
  <a href="#-how-to-use">How to use</a> ·
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-cost-of-each-action">Cost</a> ·
  <a href="#-reference">Reference</a>
</p>

<p align="center">
  <img src="docs/assets/demo-citacao.gif" width="100%" alt="Clicking a citation opens the PDF on the right page with the passage highlighted">
  <br>
  <sub>Every answer cites its source. One click opens the PDF exactly at the passage that backs the answer.</sub>
</p>

> [!NOTE]
> **Built for people who are starting out in programming and preparing for job interviews.** Add your material (handouts, summaries, documentation), ask questions, highlight what matters and practice answering as in a real interview. The project runs **for free** on the Gemini free tier.
>
> The interface, the AI prompts and the sample material are in **Brazilian Portuguese**.

---

## ✨ What it does

<table>
  <tr>
    <td width="25%" valign="top">
      <h3>📎 Sourced answers</h3>
      Every answer cites [document, page]. If the material does not contain the answer, it says <i>"Não encontrei no material."</i> ("I didn't find it in the material") and does not make anything up.
    </td>
    <td width="25%" valign="top">
      <h3>🖍️ Verified highlights</h3>
      Definitions, examples, dates or a criterion of your own. Every highlight must exist <b>verbatim</b> in the text; anything that does not is discarded.
    </td>
    <td width="25%" valign="top">
      <h3>🎤 Interview practice</h3>
      Open questions about your material, with a score per criterion, what was missing and a model answer.
    </td>
    <td width="25%" valign="top">
      <h3>💸 Zero cost</h3>
      Runs on the Gemini free tier, with a per-minute request limit so the quota does not run out in the middle of a study session.
    </td>
  </tr>
</table>

### 🎤 Mock interview

Answer in **Free**, **Guided** (definition → example → why it matters) or **STAR** format. The evaluation shows the overall score, scores for precision, structure, clarity and example, what was missing, and a model answer taken from the material.

<p align="center"><img src="docs/assets/entrevista.png" width="100%" alt="Mock interview with scores per criterion and the model answer"></p>

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🃏 Flashcards</h3>
      Click to flip, then mark <b>Acertei</b> (got it) or <b>Errei</b> (missed it): the ones you missed come back sooner (spaced repetition). At the end, generate 5, 10 or 15 more cards, with no repeats.
      <br><br>
      <img src="docs/assets/flashcards.gif" alt="A flashcard flipping and being marked as got it">
    </td>
    <td width="50%" valign="top">
      <h3>🖍️ Highlights by criterion</h3>
      Each criterion gets its own color on the PDF, and each highlight comes with a justification. Click a highlight in the list to jump to it.
      <br><br>
      <img src="docs/assets/grifos.png" alt="PDF with colored highlights and the list of highlights with justifications">
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <h3>📊 Notebook home</h3>
      Questions answered, highlights, flashcards reviewed, mock exam average, recent activity and accuracy by topic. Clicking an earlier question opens the passage cited in its answer.
      <br><br>
      <img src="docs/assets/caderno.png" alt="Notebook home screen with study numbers and recent activity">
    </td>
  </tr>
</table>

<sub>The screenshots show real Gemini answers about the <a href="docs/exemplo/guia-entrevista-dev.pdf">sample guide</a> that ships with the project (in Portuguese).</sub>

---

## 🚀 Quick start

**You will need:** [Docker](https://www.docker.com/) and a [free Gemini API key](https://aistudio.google.com/apikey). To just use the app, you do not need to install Node or open an IDE.

```bash
# 1. Copy the config and put your key in GEMINI_API_KEY
cp backend/.env.example backend/.env

# 2. Start everything (database, API and interface), from the project root
docker compose up -d --build
```

Open **<http://localhost:8080>**, create a notebook and upload [`docs/exemplo/guia-entrevista-dev.pdf`](docs/exemplo/guia-entrevista-dev.pdf) to try it out.

| To | Command |
|---|---|
| Stop | `docker compose stop` |
| Start again | `docker compose up -d` |
| Update after changing the code | `docker compose up -d --build` |
| See the API logs | `docker compose logs -f backend` |

> [!TIP]
> The three containers use about **200 MB of RAM** together. The database tables are created automatically on the first run, and your notebooks and documents are kept when you shut down.

> [!IMPORTANT]
> The API has no login. That is why the app only accepts connections from **this computer** (the port is published on `127.0.0.1`). Do not open it to the network (`HOST=0.0.0.0` in development mode, or by changing the ports in `docker-compose.yml`) unless you control that network: anyone on it could use your Gemini quota.

<details>
<summary><b>Development mode (to work on the code)</b></summary>

<br>

Here the code reloads automatically on every change. Requires [Node.js 24+](https://nodejs.org).

```bash
# 1. Only the database in Docker, from the project root
docker compose up -d postgres

# 2. Backend (with backend/.env already filled in)
cd backend
npm install
npm run dev

# 3. Interface, in another terminal
cd frontend
npm install
npm run dev
```

Open **<http://localhost:5173>**. Both modes use the same database and the same file folder, so your notebooks show up in both. If Docker mode is running, stop the API and the interface first (`docker compose stop backend web`) to save memory.

</details>

<details>
<summary><b>Using less memory on Linux</b></summary>

<br>

On Linux, **Docker Desktop** runs a virtual machine that reserves several GB of RAM, even though this project's containers use only ~200 MB. Two ways out:

- **Native Docker Engine** (recommended): on Linux, Docker runs directly on the system, with no virtual machine, and the `docker compose` commands stay the same. Follow the [official install guide](https://docs.docker.com/engine/install/) for your distribution.
- **Lower Docker Desktop's limit:** in *Settings → Resources → Memory*. 2 GB is plenty for this project.

</details>

---

## 📖 How to use

The screen has three areas: **notebooks and documents** on the left, the **document** in the middle and, on the right, the **Perguntas** (Questions) and **Grifos** (Highlights) tabs. The left sidebar collapses with **⟨**.

| Step | Where | What happens |
|---|---|---|
| **1. Create a notebook** | **+** next to *Cadernos* (Notebooks) | One notebook per subject (e.g. *Entrevista Dev Júnior*). Clicking it opens its home screen |
| **2. Upload documents** | *Enviar PDF, MD ou TXT*, or drag and drop | Shows as **processando** (processing) and, within seconds, **pronto** (ready). Scanned PDFs (images only) are not supported |
| **3. Choose the goal** | *Objetivo* (Goal), at the top of the Questions tab | **Entrevista** (Interview): open questions with a score. **Prova** (Exam): multiple-choice questions |
| **4. Ask** | **Perguntas** tab | Answer with **[S1]** markers. Click one to open the passage in the document |
| **5. Highlight** | **Grifos** tab | Pick the criteria and click **Grifar** (Highlight). You can create your own criterion (e.g. *Likely in the interview*) |
| **6. Practice** | *Treinar este assunto* (Practice this topic), below each answer | **Flashcards** or **Simulação** (mock exam) on the passages of that answer |

<details>
<summary><b>Practice details</b></summary>

<br>

| Goal | Flashcards | Mock exam |
|---|---|---|
| **Interview** | Front with a short question to think about | Up to 5 open questions, scored 0 to 10 with a comment |
| **Exam** | Front with a term to explain ("DTO", "Promise") | Up to 10 multiple-choice questions, graded instantly |

**Flashcards:** click the card to flip it. **Errei** (missed it) or **Acertei** (got it) decides when it comes back (spaced repetition). **‹ ›** navigates, **⤨** shuffles. At the end: *Gerar mais cartões* (generate more cards: +5, +10 or +15).

**Interview:** one question at a time, as a conversation.
- **Free:** a single field.
- **Guided:** *Definition → Example → Why it matters*, for questions about concepts.
- **STAR:** *Situation → Task → Action → Result*, for "tell me about a time when…".
- The **speaking meter** estimates how long you would take to say the answer (ideally 45 s to 2 min), and the draft is saved in the browser.
- **Tentar de novo** (try again) re-evaluates the same question. At the end, the average per criterion shows what to improve.

**Exam:** pick an option and click **Responder** (Answer). The right one turns green and the explanation appears.

During practice, the chat collapses (**focus mode**); the **Chat** button brings it back. On every question, **Ver no material** (see in the material) opens the passage that backs the answer.

</details>

---

## 🧠 How it works

**RAG** (*Retrieval-Augmented Generation*) means that, before the AI answers, the system **retrieves** the right passages from your material and sends **only those** to the model. The AI does not answer with what it "knows"; it answers with what is in the passages.

```mermaid
flowchart LR
    A[📄 PDF, MD or TXT] --> B[Extracts the text<br>and its position on the page]
    B --> C[Splits into chunks]
    C --> D[Creates embeddings<br>meaning vectors]
    D --> E[(PostgreSQL<br>+ pgvector)]

    Q[❓ Question] --> S[Hybrid search<br>keywords + meaning]
    E --> S
    S --> L[Gemini answers<br>in JSON, using only the chunks]
    L --> V{Does the citation exist<br>in the original text?}
    V -- yes --> R[✅ Answer with<br>document and page]
    V -- no --> X[🗑️ Discarded]
```

- **Hybrid search:** combines keyword search (in Portuguese, ignoring accents) with meaning-based search. The two result lists are merged by each chunk's rank (*Reciprocal Rank Fusion*). This way the search finds both "rebase" written exactly and "rewriting history" phrased differently.
- **Nothing made up:** citations, highlights, questions and flashcards must point to text that exists **verbatim** in the document. The code checks this, not the AI.
- **Measured quality:** in an eval with 23 interview questions, the search found the right passage in **100%** of cases (Recall@5), the AI answered "Não encontrei no material" (not found in the material) in **8 of 8** trap questions, and made up **0** citations. Details in *Automated AI evaluation*, under Reference.
- **Validated output:** Gemini answers in JSON, checked against a schema (Zod). Output in the wrong format is rejected.
- **Interview score computed by code:** the AI, acting as a demanding senior interviewer, only classifies the answer. It says which expected points were covered (copying the passage of your answer that proves each one), points out errors and classifies the example as a repetition, generic or a concrete case. The code checks the passages and computes the score: 60% content and 40% form. Good form never rescues weak content, and a generic example never scores 10.
- **Coordinates:** every piece of text in the PDF keeps its position on the page. That is what allows citations and highlights to be painted exactly over the text.
- **Measurement:** every step records its duration, and every Gemini call records tokens and estimated cost.
- **Request limit:** the routes that call Gemini accept up to 20 requests per minute (`AI_RATE_LIMIT_PER_MINUTE`). Extra requests get a 429 error with the wait time, and the interface does not send the same request twice on a double click. This keeps the free quota from running out in the middle of a study session.
- **Learning ≠ reading:** reading an answer does not count as knowing the topic. Only practice performance goes into accuracy by topic.

**Stack:** TypeScript · Node.js 24 · Fastify · Zod · PostgreSQL 17 + pgvector · PDF.js · React 19 · Vite · Motion · Vitest · Gemini (REST, no SDK) · Docker + Nginx · GitHub Actions

---

## 💸 Cost of each action

The project uses only the Gemini **free tier**, which limits requests **per minute and per day**. Track your usage at <https://ai.dev/rate-limit>.

| Action | Gemini calls |
|---|---|
| Upload a document | 1 per batch of up to 100 chunks |
| Ask a question | 2 (search + answer) |
| Highlight | 1 per criterion for every ~6,000 characters |
| Flashcards from an answer | 1 (0 when reusing cards not yet reviewed) |
| Generate more cards | 1 per click |
| Exam mock | 1 (0 when reusing questions) |
| Interview mock | 1 to generate + 1 per evaluated answer |
| Flip a card, got it/missed it, shuffle, open citations | **0** |

> [!WARNING]
> On the free tier, Google may use the content you send to improve its products. Do not upload documents with confidential data or other people's personal data.

---

## 📚 Reference

<details>
<summary><b>Configuration (<code>backend/.env</code>)</b></summary>

<br>

The template is in `backend/.env.example`.

| Variable | Default | What it does |
|---|---|---|
| `GEMINI_API_KEY` | (required) | Your Gemini key |
| `DATABASE_URL` | `postgres://notebook:notebook@localhost:5433/notebook` | Main database |
| `PORT` | `3333` | API port |
| `HOST` | `127.0.0.1` | Address the API listens on. The default accepts this computer only; `0.0.0.0` opens it to the network |
| `AI_RATE_LIMIT_PER_MINUTE` | `20` | Requests per minute to the routes that call Gemini |
| `STORAGE_DIR` | `./storage` | Folder for uploaded files (name = SHA-256 hash) |
| `MAX_UPLOAD_MB` | `50` | Maximum upload size |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | `1000` / `150` | Chunk size and overlap, in characters |
| `EMBEDDING_PROVIDER` | `gemini` | `fake` creates local vectors (no quota used, but meaning-based search stops really working) |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-2` | Embedding model |
| `GEMINI_LLM_MODEL` | `gemini-3.5-flash-lite` | Model for answers, highlights and practice |
| `GEMINI_THINKING_LEVEL` | `LOW` | How much the model "thinks" first (`MINIMAL`, `LOW`, `MEDIUM`, `HIGH`) |
| `HIGHLIGHT_BATCH_CHARS` | `6000` | Text sent per call when highlighting |
| `TEST_DATABASE_URL` | `…/notebook_test` | Integration test database (**wiped** on every run) |
| `EVAL_DATABASE_URL` | `…/notebook_eval` | Evaluation database (**wiped** on every run) |
| `GEMINI_JUDGE_MODEL` | `gemini-3.8-flash` | Model that judges the answers in the evaluation |

</details>

<details>
<summary><b>Tests and CI</b></summary>

<br>

The tests **do not use Gemini**: the LLM and the embeddings are simulated. So they need no key and use no quota. [GitHub Actions](.github/workflows/ci.yml) runs everything on every push and pull request, with a real PostgreSQL, and checks that the Docker images build.

```bash
cd backend
npm run typecheck
npm test                                   # unit
docker compose exec postgres createdb -U notebook notebook_test   # first time only
npm run test:integration                   # integration, with real PostgreSQL

cd ../frontend
npm run typecheck
npm test
```

</details>

<details>
<summary><b>Automated AI evaluation</b></summary>

<br>

Scripts that measure the AI's **technical quality** with JSON datasets (`backend/eval/datasets/`). They use the real Gemini, so they **use quota**. Before the first run:

```bash
docker compose exec postgres createdb -U notebook notebook_eval
```

**Answers (RAG):** Recall@5, citation precision, correctness, correct refusal, hallucination rate, latency and cost per question.

```bash
cd backend
npm run eval -- --dataset eval/datasets/calculo-exemplo/dataset.json --chunks 300:50 --strategies hybrid
npm run eval -- --dataset <file> --retrieval-only     # search only: much cheaper
```

**Results: interview guide** (`eval/datasets/entrevista-dev/`, hybrid search, 1000/150 chunks)

The dataset is an answer key: each question comes with the expected answer and the **exact passage** of the guide that proves it. There are 15 questions answered in the guide (several reworded, so that only search by meaning finds them), 8 **traps** on related topics the guide doesn't cover (e.g. status 401, closures, GraphQL), and 1 unrelated document (biology) as a distractor.

| Metric | Result | What it measures | How it is computed |
|---|---|---|---|
| Recall@5 | **100%** (15/15) | Whether the search brings the right passage to the AI | Is the answer key passage among the 5 retrieved chunks? |
| Correct refusal | **100%** (8/8) | Whether the AI admits it doesn't know instead of making things up | On trap questions, is the answer "Não encontrei no material"? |
| Unjustified refusal | **0%** | Whether the AI refuses questions it could answer | Questions with an answer in the guide that got a refusal |
| Fabricated citations | **0** | Whether the AI cites text that doesn't exist | Citations not found verbatim in the document (they are discarded before reaching the student) |
| Citations on the expected passage | 81% (17/21) | Whether the AI cites the passage that proves the answer | Does the citation overlap the answer key passage? The other 4 cite neighbouring passages from the same guide that also support the answer, so the answer key is stricter than needed |
| Latency / cost | ~2 s / ~US$0.0007 | Whether it is fast and cheap enough | Average per question, from the times and tokens recorded on every call |

> [!NOTE]
> Small dataset (a 2-page guide). **Correctness** (is the answer right and complete?) is normally measured by an LLM judge, but it hit the free-tier daily quota. The 15 answers were checked by hand: 14 complete and 1 incomplete (binary search: it explained O(log n) but didn't compare it with O(n)).

```bash
npm run eval -- --dataset eval/datasets/entrevista-dev/dataset.json --strategies hybrid
```

**Highlights:** precision, recall and F1 per criterion, and how many highlights were made up (and discarded).

```bash
npm run eval:highlights -- --dataset eval/datasets/calculo-exemplo/highlights.json
```

Reports are saved in `backend/eval/results/`. **Learning metrics** (practice results) are kept apart from the technical ones, in the `attempts` table.

To see what each operation would cost on the paid tier:

```bash
docker compose exec postgres psql -U notebook -d notebook -c "
SELECT model, operation, count(*) AS chamadas, round(sum(cost_usd)::numeric, 5) AS custo_usd
  FROM llm_calls GROUP BY model, operation ORDER BY model, operation;"
```

</details>

<details>
<summary><b>Troubleshooting</b></summary>

<br>

| Symptom | Likely cause | Fix |
|---|---|---|
| `docker compose up` fails with *port is already allocated* | Another service is using port 8080 (app) or 5433 (database) | Set `APP_PORT=8081` or `POSTGRES_HOST_PORT=5434` before the command. In development mode, also adjust `DATABASE_URL` |
| Backend: *ECONNREFUSED* or *authentication failed* | Docker is off, or connecting to the wrong Postgres | Start Docker Desktop, run `docker compose up -d` and check port 5433 in `.env` |
| Backend: *GEMINI_API_KEY é obrigatória* (is required) | `.env` without the key | Fill in `GEMINI_API_KEY` in `backend/.env`. In Docker mode, run `docker compose up -d` again |
| *Provedor de IA indisponível ou no limite de uso* (AI provider unavailable or at its limit) | Gemini quota used up (429) or model overloaded (503) | Wait a few minutes. The daily quota resets at midnight Pacific time |
| *Muitos pedidos à IA em pouco tempo* (too many AI requests) | More than 20 AI requests in the same minute | Wait the number of seconds shown |
| Document shows as **falhou** (failed) | Scanned, password-protected or corrupted PDF | Hover over the document to see why |
| *Escolha o objetivo do caderno* (choose the notebook goal) when practicing | The notebook has no goal yet | Pick Entrevista or Prova at the top of the Questions tab |
| The interface says it cannot reach the backend | The backend is not running or stopped with an error | Docker mode: `docker compose logs backend` shows why (for example, a missing `GEMINI_API_KEY`). Development mode: `npm run dev` in `backend/` |

</details>

<details>
<summary><b>Code structure</b></summary>

<br>

```
backend/
  src/
    routes/         # HTTP: validates input and calls the services
    services/       # rules and orchestration
    repositories/   # all the SQL
    providers/      # Gemini (LLM and embeddings), file storage
    domain/         # pure functions: chunking, search, validation, highlights, practice
    http/           # request limit for the AI routes
    db/migrations/  # numbered .sql files, applied on startup
  eval/             # automated evaluation and datasets
  tests/            # unit and integration
  Dockerfile        # API image
frontend/
  Dockerfile        # builds React and serves it with Nginx
  nginx.conf        # serves the interface and forwards /api to the API
  src/
    components/     # screens: chat, highlights, viewer, practice
    lib/            # pure functions (coordinates, marks, shuffle)
docker-compose.yml  # database, API and interface
docs/
  assets/           # images for this README
  exemplo/          # sample PDF to try out
```

</details>

<details>
<summary><b>API</b></summary>

<br>

Base: `http://localhost:8080/api` in Docker mode, or `http://localhost:3333` in development mode.

| Area | Endpoints |
|---|---|
| Notebooks | `GET/POST /notebooks` · `GET/PATCH/DELETE /notebooks/:id` |
| Documents | `GET/POST /notebooks/:id/documents` · `GET/DELETE /documents/:id` · `GET /documents/:id/file` · `GET /documents/:id/pages/:n` · `GET /documents/:id/chunks` |
| Search | `POST /notebooks/:id/search` `{ query, strategy: hybrid\|vector\|lexical, k }` |
| Questions | `GET/POST /notebooks/:id/questions` · `GET /questions/:id` · `GET /citations/:id` |
| Highlights | `GET/POST /notebooks/:id/highlight-criteria` · `DELETE /highlight-criteria/:id` · `POST /documents/:id/highlight-runs` · `GET /highlight-runs/:id` · `GET /documents/:id/highlights` |
| Practice | `GET /notebooks/:id/overview` · `GET/PUT /notebooks/:id/profile` · `POST /notebooks/:id/practice-sessions` · `GET /practice-sessions/:id` · `POST /practice-sessions/:id/answers` · `POST /practice-sessions/:id/reviews` · `POST /practice-sessions/:id/more` · `POST /practice-sessions/:id/finish` · `GET /practice-items/:id/source` · `GET /notebooks/:id/priorities` |

```bash
curl -X POST localhost:8080/api/notebooks -H 'content-type: application/json' -d '{"name": "Entrevista Dev Júnior"}'
curl -F file=@docs/exemplo/guia-entrevista-dev.pdf localhost:8080/api/notebooks/<id>/documents
curl -X POST localhost:8080/api/notebooks/<id>/questions -H 'content-type: application/json' \
  -d '{"question": "Qual a diferença entre merge e rebase?"}'
```

</details>

---

<p align="center">
  <img src="docs/assets/logo.svg" width="32" alt="">
  <br>
  <sub><a href="LICENSE">MIT</a> license · Made by Eduardo Matheus · The sample guide was written for this project</sub>
</p>
