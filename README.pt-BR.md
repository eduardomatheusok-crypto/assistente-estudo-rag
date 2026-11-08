[English](README.md) | **Português**

<p align="center">
  <img src="docs/assets/logo.svg" width="96" alt="Ícone do Assistente de Estudos com RAG">
</p>

<h1 align="center">Assistente de Estudos com RAG</h1>

<p align="center">
  <b>Estude só com o seu material.</b> Envie apostilas e anotações, faça perguntas e receba respostas com a página de onde vieram,
  grifos conferidos no texto original e treinos com flashcards, simulados e entrevistas com nota.
</p>

<p align="center">
  <a href="https://github.com/eduardomatheusok-crypto/assistente-estudo-rag/actions/workflows/ci.yml"><img src="https://github.com/eduardomatheusok-crypto/assistente-estudo-rag/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL com pgvector">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/Gemini-cota%20gratuita-8E75B2?logo=googlegemini&logoColor=white" alt="Gemini na cota gratuita">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-green" alt="Licença MIT"></a>
</p>

<p align="center">
  <a href="#-começo-rápido">Começo rápido</a> ·
  <a href="#-o-que-ele-faz">O que ele faz</a> ·
  <a href="#-como-usar">Como usar</a> ·
  <a href="#-como-funciona-por-dentro">Como funciona</a> ·
  <a href="#-quanto-custa-cada-ação">Custo</a> ·
  <a href="#-referência">Referência</a>
</p>

<p align="center">
  <img src="docs/assets/demo-citacao.gif" width="100%" alt="Clicar numa citação abre o PDF na página certa, com o trecho pintado">
  <br>
  <sub>Cada resposta cita a fonte. Um clique abre o PDF exatamente no trecho que comprova a resposta.</sub>
</p>

> [!NOTE]
> **Pensado para quem está começando em programação e vai fazer entrevistas.** Coloque o seu material (apostilas, resumos, documentação), pergunte, grife o que importa e treine respondendo como numa entrevista de verdade. O projeto roda **de graça**, na cota gratuita do Gemini.

---

## ✨ O que ele faz

<table>
  <tr>
    <td width="25%" valign="top">
      <h3>📎 Respostas com fonte</h3>
      Cada resposta cita [documento, página]. Se o material não tem a resposta, ele diz <i>"Não encontrei no material."</i> e não inventa.
    </td>
    <td width="25%" valign="top">
      <h3>🖍️ Grifos conferidos</h3>
      Definições, exemplos, datas ou um critério seu. Todo grifo precisa existir <b>literalmente</b> no texto; o que não existir é descartado.
    </td>
    <td width="25%" valign="top">
      <h3>🎤 Treino de entrevista</h3>
      Perguntas abertas sobre o seu material, com nota por critério, o que faltou e uma resposta-modelo.
    </td>
    <td width="25%" valign="top">
      <h3>💸 Custo zero</h3>
      Usa a cota gratuita do Gemini, com limite de pedidos por minuto para ela não acabar no meio do estudo.
    </td>
  </tr>
</table>

### 🎤 Simulação de entrevista

Responda no formato **Livre**, **Guiado** (definição → exemplo → por que importa) ou **STAR**. A avaliação mostra a nota geral, as notas de precisão, estrutura, clareza e exemplo, o que faltou e uma resposta-modelo tirada do material.

<p align="center"><img src="docs/assets/entrevista.png" width="100%" alt="Simulação de entrevista com a nota por critério e a resposta-modelo"></p>

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🃏 Flashcards</h3>
      Clique para virar, marque <b>Acertei</b> ou <b>Errei</b>: o que você errou volta antes (repetição espaçada). No fim, gere mais 5, 10 ou 15 cartões, sem repetir.
      <br><br>
      <img src="docs/assets/flashcards.gif" alt="Flashcard virando e sendo marcado como acertei">
    </td>
    <td width="50%" valign="top">
      <h3>🖍️ Grifos por critério</h3>
      Cada critério ganha uma cor no PDF, e cada grifo vem com a justificativa. Clique num grifo da lista para ir até ele.
      <br><br>
      <img src="docs/assets/grifos.png" alt="PDF com grifos coloridos e a lista de grifos com justificativas">
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <h3>📊 Tela inicial do caderno</h3>
      Perguntas respondidas, grifos, flashcards revisados, média nas simulações, a atividade recente e os acertos por assunto. Clicar numa pergunta antiga abre o trecho citado na resposta.
      <br><br>
      <img src="docs/assets/caderno.png" alt="Tela inicial do caderno com números de estudo e atividade recente">
    </td>
  </tr>
</table>

<sub>As imagens mostram respostas reais do Gemini sobre o <a href="docs/exemplo/guia-entrevista-dev.pdf">guia de exemplo</a> que vem no projeto.</sub>

---

## 🚀 Começo rápido

**Você vai precisar de:** [Docker](https://www.docker.com/) e uma [chave gratuita do Gemini](https://aistudio.google.com/apikey). Para só usar o app, não precisa instalar o Node nem abrir uma IDE.

```bash
# 1. Copie a configuração e coloque a sua chave em GEMINI_API_KEY
cp backend/.env.example backend/.env

# 2. Suba tudo (banco, API e interface), na raiz do projeto
docker compose up -d --build
```

Abra **<http://localhost:8080>**, crie um caderno e envie o [`docs/exemplo/guia-entrevista-dev.pdf`](docs/exemplo/guia-entrevista-dev.pdf) para testar.

| Para | Comando |
|---|---|
| Parar | `docker compose stop` |
| Ligar de novo | `docker compose up -d` |
| Atualizar depois de mudar o código | `docker compose up -d --build` |
| Ver os logs da API | `docker compose logs -f backend` |

> [!TIP]
> Os três containers usam juntos cerca de **200 MB de RAM**. As tabelas do banco são criadas sozinhas na primeira execução, e os seus cadernos e documentos continuam lá quando você desliga.

> [!IMPORTANT]
> A API não tem login. Por isso o app só aceita conexões **deste computador** (a porta é publicada em `127.0.0.1`). Não abra para a rede (`HOST=0.0.0.0` no modo de desenvolvimento, ou mudando as portas do `docker-compose.yml`) se você não controla essa rede: qualquer pessoa conectada a ela poderia usar a sua cota do Gemini.

<details>
<summary><b>Modo de desenvolvimento (para mexer no código)</b></summary>

<br>

Aqui o código recarrega sozinho a cada alteração. Precisa do [Node.js 24+](https://nodejs.org).

```bash
# 1. Só o banco no Docker, na raiz do projeto
docker compose up -d postgres

# 2. Backend (com o backend/.env já preenchido)
cd backend
npm install
npm run dev

# 3. Interface, em outro terminal
cd frontend
npm install
npm run dev
```

Abra **<http://localhost:5173>**. Os dois modos usam o mesmo banco e a mesma pasta de arquivos, então os cadernos aparecem nos dois. Se o modo Docker estiver ligado, pare a API e a interface antes (`docker compose stop backend web`) para economizar memória.

</details>

<details>
<summary><b>Usar menos memória no Linux</b></summary>

<br>

No Linux, o **Docker Desktop** roda uma máquina virtual que reserva vários GB de RAM, mesmo que os containers deste projeto usem só ~200 MB. Duas saídas:

- **Docker Engine nativo** (recomendado): no Linux, o Docker roda direto no sistema, sem máquina virtual, e os comandos `docker compose` continuam iguais. Siga o [guia oficial de instalação](https://docs.docker.com/engine/install/) da sua distribuição.
- **Diminuir o limite do Docker Desktop:** em *Settings → Resources → Memory*. 2 GB sobram para este projeto.

</details>

---

## 📖 Como usar

A tela tem três áreas: **cadernos e documentos** à esquerda, o **documento** no centro e, à direita, as abas **Perguntas** e **Grifos**. A barra da esquerda recolhe no **⟨**.

| Passo | Onde | O que acontece |
|---|---|---|
| **1. Crie um caderno** | **+** ao lado de *Cadernos* | Um caderno por assunto (ex.: *Entrevista Dev Júnior*). Ao clicar nele, abre a tela inicial |
| **2. Envie documentos** | *Enviar PDF, MD ou TXT*, ou arraste | Fica **processando** e, em segundos, **pronto**. PDF escaneado (só imagem) não é aceito |
| **3. Escolha o objetivo** | *Objetivo*, no topo da aba Perguntas | **Entrevista**: perguntas abertas com nota. **Prova**: questões de múltipla escolha |
| **4. Pergunte** | Aba **Perguntas** | Resposta com marcadores **[S1]**. Clique para abrir o trecho no documento |
| **5. Grife** | Aba **Grifos** | Marque os critérios e clique em **Grifar**. Dá para criar um critério seu (ex.: *Cai na entrevista*) |
| **6. Treine** | *Treinar este assunto*, embaixo de cada resposta | **Flashcards** ou **Simulação** sobre os trechos daquela resposta |

<details>
<summary><b>Detalhes dos treinos</b></summary>

<br>

| Objetivo | Flashcards | Simulação |
|---|---|---|
| **Entrevista** | Frente com uma pergunta curta para pensar | Até 5 perguntas abertas, com nota de 0 a 10 e comentário |
| **Prova** | Frente com um termo para explicar ("DTO", "Promise") | Até 10 questões de múltipla escolha, corrigidas na hora |

**Flashcards:** clique no cartão para virar. **Errei** ou **Acertei** define quando ele volta (repetição espaçada). **‹ ›** navega, **⤨** embaralha. No fim: *Gerar mais cartões* (+5, +10 ou +15).

**Entrevista:** uma pergunta por vez, numa conversa.
- **Livre:** um campo só.
- **Guiada:** *Definição → Exemplo → Por que importa*, para perguntas sobre conceitos.
- **STAR:** *Situação → Tarefa → Ação → Resultado*, para "conte uma vez em que…".
- O **medidor de fala** estima quanto tempo você levaria falando (o ideal é de 45 s a 2 min), e o rascunho fica salvo no navegador.
- **Tentar de novo** reavalia a mesma pergunta. No fim, a média por critério mostra o seu ponto a melhorar.

**Prova:** escolha a alternativa e clique em **Responder**. A certa fica verde e aparece a explicação.

Durante os treinos, o chat recolhe (**modo foco**); o botão **Chat** o traz de volta. Em toda questão, **Ver no material** abre o trecho que fundamenta a resposta.

</details>

---

## 🧠 Como funciona por dentro

**RAG** (*Retrieval-Augmented Generation*) quer dizer: antes de a IA responder, o sistema **busca** os trechos certos do seu material e manda **só eles** para o modelo. A IA não responde com o que "sabe"; ela responde com o que está nos trechos.

```mermaid
flowchart LR
    A[📄 PDF, MD ou TXT] --> B[Extrai o texto<br>e a posição na página]
    B --> C[Divide em trechos]
    C --> D[Gera embeddings<br>vetores de significado]
    D --> E[(PostgreSQL<br>+ pgvector)]

    Q[❓ Pergunta] --> S[Busca híbrida<br>palavras + significado]
    E --> S
    S --> L[Gemini responde<br>em JSON, só com os trechos]
    L --> V{A citação existe<br>no texto original?}
    V -- sim --> R[✅ Resposta com<br>documento e página]
    V -- não --> X[🗑️ Descartada]
```

- **Busca híbrida:** junta a busca por palavras (em português, ignorando acentos) com a busca por significado. As duas listas são combinadas pela posição de cada trecho (*Reciprocal Rank Fusion*). Assim, a busca acha tanto "rebase" escrito igual quanto "reescrever o histórico" dito de outro jeito.
- **Nada inventado:** citações, grifos, questões e flashcards precisam apontar para um texto que existe **literalmente** no documento. O código confere isso, e não a IA.
- **Qualidade medida:** num eval com 23 perguntas de entrevista, a busca achou o trecho certo em **100%** dos casos (Recall@5), a IA respondeu "Não encontrei no material" em **8 de 8** perguntas-armadilha e inventou **0** citações. Detalhes em *Avaliação automática da IA*, na Referência.
- **Saída validada:** o Gemini responde em JSON, conferido por um schema (Zod). Uma resposta fora do formato é recusada.
- **Nota da entrevista calculada pelo código:** a IA, no papel de entrevistador sênior exigente, só classifica a resposta. Ela diz quais pontos esperados foram cobertos (copiando o trecho da sua resposta que prova cada um), aponta os erros e classifica o exemplo como repetição, genérico ou caso concreto. O código confere os trechos e calcula a nota: 60% conteúdo e 40% forma. A forma nunca salva um conteúdo fraco, e um exemplo genérico nunca vale 10.
- **Coordenadas:** cada pedaço de texto do PDF guarda a posição na página. É isso que permite pintar citações e grifos exatamente sobre o texto.
- **Medição:** toda etapa registra o tempo, e toda chamada ao Gemini registra tokens e custo estimado.
- **Limite de pedidos:** as rotas que chamam o Gemini aceitam até 20 pedidos por minuto (`AI_RATE_LIMIT_PER_MINUTE`). O excesso recebe o erro 429 com o tempo de espera, e a interface não envia duas vezes o mesmo pedido num clique duplo. Assim a cota gratuita não acaba no meio do estudo.
- **Aprendizagem ≠ consulta:** ler uma resposta não conta como saber o assunto. Só o desempenho nos treinos entra nos acertos por assunto.

**Stack:** TypeScript · Node.js 24 · Fastify · Zod · PostgreSQL 17 + pgvector · PDF.js · React 19 · Vite · Motion · Vitest · Gemini (REST, sem SDK) · Docker + Nginx · GitHub Actions

---

## 💸 Quanto custa cada ação

O projeto usa só a **cota gratuita** do Gemini, que limita os pedidos **por minuto e por dia**. Acompanhe o uso em <https://ai.dev/rate-limit>.

| Ação | Chamadas ao Gemini |
|---|---|
| Enviar um documento | 1 por lote de até 100 trechos |
| Fazer uma pergunta | 2 (busca + resposta) |
| Grifar | 1 por critério a cada ~6.000 caracteres |
| Flashcards de uma resposta | 1 (0 se reaproveitar cartões ainda não revisados) |
| Gerar mais cartões | 1 por clique |
| Simulação de prova | 1 (0 se reaproveitar questões) |
| Simulação de entrevista | 1 para gerar + 1 por resposta avaliada |
| Virar cartão, Acertei/Errei, embaralhar, abrir citações | **0** |

> [!WARNING]
> Na cota gratuita, o Google pode usar o conteúdo enviado para melhorar os produtos dele. Não envie documentos com dados sigilosos ou dados pessoais de outras pessoas.

---

## 📚 Referência

<details>
<summary><b>Configuração (<code>backend/.env</code>)</b></summary>

<br>

O modelo está em `backend/.env.example`.

| Variável | Padrão | O que faz |
|---|---|---|
| `GEMINI_API_KEY` | (obrigatória) | Sua chave do Gemini |
| `DATABASE_URL` | `postgres://notebook:notebook@localhost:5433/notebook` | Banco principal |
| `PORT` | `3333` | Porta da API |
| `HOST` | `127.0.0.1` | Endereço em que a API escuta. O padrão aceita só este computador; `0.0.0.0` abre para a rede |
| `AI_RATE_LIMIT_PER_MINUTE` | `20` | Pedidos por minuto às rotas que chamam o Gemini |
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

</details>

<details>
<summary><b>Testes e CI</b></summary>

<br>

Os testes **não usam o Gemini**: o LLM e os embeddings são simulados. Por isso não precisam de chave nem gastam cota. O [GitHub Actions](.github/workflows/ci.yml) roda tudo a cada push e pull request, com um PostgreSQL de verdade, e confere se as imagens Docker constroem.

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

</details>

<details>
<summary><b>Avaliação automática da IA</b></summary>

<br>

Scripts que medem a **qualidade técnica** da IA com datasets em JSON (`backend/eval/datasets/`). Eles usam o Gemini real, então **gastam cota**. Antes da primeira execução:

```bash
docker compose exec postgres createdb -U notebook notebook_eval
```

**Respostas (RAG):** Recall@5, precisão das citações, correção, recusa correta, taxa de alucinação, latência e custo por pergunta.

```bash
cd backend
npm run eval -- --dataset eval/datasets/calculo-exemplo/dataset.json --chunks 300:50 --strategies hybrid
npm run eval -- --dataset <arquivo> --retrieval-only     # só a busca: bem mais barato
```

**Resultados: guia de entrevista** (`eval/datasets/entrevista-dev/`, busca híbrida, chunks 1000/150)

O dataset é um gabarito: cada pergunta vem com a resposta esperada e o **trecho exato** do guia que a comprova. São 15 perguntas com resposta no guia (várias com outras palavras, para que só a busca por significado as encontre), 8 **armadilhas** sobre assuntos próximos que o guia não cobre (ex.: status 401, closure, GraphQL) e 1 documento sem relação (biologia) como distrator.

| Métrica | Resultado | O que mede | Como é calculada |
|---|---|---|---|
| Recall@5 | **100%** (15/15) | Se a busca leva o trecho certo para a IA | O trecho do gabarito está entre os 5 recuperados? |
| Recusa correta | **100%** (8/8) | Se a IA admite que não sabe em vez de inventar | Nas armadilhas, a resposta é "Não encontrei no material"? |
| Recusa indevida | **0%** | Se a IA recusa perguntas que poderia responder | Perguntas com resposta no guia que receberam recusa |
| Citações inventadas | **0** | Se a IA cita texto que não existe | Citações não encontradas literalmente no documento (são descartadas antes de chegar ao estudante) |
| Citações no trecho esperado | 81% (17/21) | Se a IA cita o trecho que comprova a resposta | A citação encosta no trecho do gabarito? As outras 4 citam trechos vizinhos do mesmo guia que também sustentam a resposta: o gabarito é mais rígido do que precisava |
| Latência / custo | ~2 s / ~US$ 0,0007 | Se é rápido e barato o suficiente | Média por pergunta, a partir dos tempos e tokens registrados em cada chamada |

> [!NOTE]
> Dataset pequeno (um guia de 2 páginas). A **correção** (a resposta está certa e completa?) normalmente é medida por um juiz LLM, mas ele atingiu o limite diário do plano gratuito. As 15 respostas foram conferidas à mão: 14 completas e 1 incompleta (busca binária: explicou o O(log n), mas não comparou com o O(n)).

```bash
npm run eval -- --dataset eval/datasets/entrevista-dev/dataset.json --strategies hybrid
```

**Grifos:** precisão, revocação e F1 por critério, e quantos grifos foram inventados (e descartados).

```bash
npm run eval:highlights -- --dataset eval/datasets/calculo-exemplo/highlights.json
```

Os relatórios ficam em `backend/eval/results/`. As **métricas de aprendizagem** (acertos nos treinos) ficam separadas das técnicas, na tabela `attempts`.

Para ver quanto cada operação custaria no plano pago:

```bash
docker compose exec postgres psql -U notebook -d notebook -c "
SELECT model, operation, count(*) AS chamadas, round(sum(cost_usd)::numeric, 5) AS custo_usd
  FROM llm_calls GROUP BY model, operation ORDER BY model, operation;"
```

</details>

<details>
<summary><b>Problemas comuns</b></summary>

<br>

| Sintoma | Causa provável | Solução |
|---|---|---|
| `docker compose up` falha com *port is already allocated* | Outro serviço usa a porta 8080 (app) ou 5433 (banco) | Defina `APP_PORT=8081` ou `POSTGRES_HOST_PORT=5434` antes do comando. No modo de desenvolvimento, ajuste também o `DATABASE_URL` |
| Backend: *ECONNREFUSED* ou *autenticação falhou* | Docker desligado, ou conectando no Postgres errado | Ligue o Docker Desktop, rode `docker compose up -d` e confira a porta 5433 no `.env` |
| Backend: *GEMINI_API_KEY é obrigatória* | `.env` sem a chave | Preencha `GEMINI_API_KEY` em `backend/.env`. No modo Docker, rode `docker compose up -d` de novo |
| *Provedor de IA indisponível ou no limite de uso* | Cota do Gemini esgotada (429) ou modelo sobrecarregado (503) | Espere alguns minutos. A cota diária renova à meia-noite do horário do Pacífico (4h–5h em Brasília) |
| *Muitos pedidos à IA em pouco tempo* | Mais de 20 pedidos à IA no mesmo minuto | Espere os segundos indicados |
| Documento fica como **falhou** | PDF escaneado, protegido por senha ou corrompido | Passe o mouse sobre o documento para ver o motivo |
| *Escolha o objetivo do caderno* ao treinar | O caderno ainda não tem objetivo | Escolha Entrevista ou Prova no topo da aba Perguntas |
| A interface diz que não fala com o backend | O backend não está rodando ou parou com erro | Modo Docker: `docker compose logs backend` mostra o motivo (por exemplo, falta a `GEMINI_API_KEY`). Modo de desenvolvimento: `npm run dev` em `backend/` |

</details>

<details>
<summary><b>Estrutura do código</b></summary>

<br>

```
backend/
  src/
    routes/         # HTTP: valida a entrada e chama os serviços
    services/       # regras e orquestração
    repositories/   # todo o SQL
    providers/      # Gemini (LLM e embeddings), armazenamento de arquivos
    domain/         # funções puras: chunking, busca, validação, grifos, prática
    http/           # limite de pedidos às rotas de IA
    db/migrations/  # arquivos .sql numerados, aplicados ao iniciar
  eval/             # avaliação automática e datasets
  tests/            # unitários e de integração
  Dockerfile        # imagem da API
frontend/
  Dockerfile        # compila o React e serve com Nginx
  nginx.conf        # serve a interface e repassa /api para a API
  src/
    components/     # telas: chat, grifos, visualizador, prática
    lib/            # funções puras (coordenadas, marcações, embaralhar)
docker-compose.yml  # banco, API e interface
docs/
  assets/           # imagens deste README
  exemplo/          # PDF de exemplo para testar
```

</details>

<details>
<summary><b>API</b></summary>

<br>

Base: `http://localhost:8080/api` no modo Docker, ou `http://localhost:3333` no modo de desenvolvimento.

| Área | Endpoints |
|---|---|
| Cadernos | `GET/POST /notebooks` · `GET/PATCH/DELETE /notebooks/:id` |
| Documentos | `GET/POST /notebooks/:id/documents` · `GET/DELETE /documents/:id` · `GET /documents/:id/file` · `GET /documents/:id/pages/:n` · `GET /documents/:id/chunks` |
| Busca | `POST /notebooks/:id/search` `{ query, strategy: hybrid\|vector\|lexical, k }` |
| Perguntas | `GET/POST /notebooks/:id/questions` · `GET /questions/:id` · `GET /citations/:id` |
| Grifos | `GET/POST /notebooks/:id/highlight-criteria` · `DELETE /highlight-criteria/:id` · `POST /documents/:id/highlight-runs` · `GET /highlight-runs/:id` · `GET /documents/:id/highlights` |
| Prática | `GET /notebooks/:id/overview` · `GET/PUT /notebooks/:id/profile` · `POST /notebooks/:id/practice-sessions` · `GET /practice-sessions/:id` · `POST /practice-sessions/:id/answers` · `POST /practice-sessions/:id/reviews` · `POST /practice-sessions/:id/more` · `POST /practice-sessions/:id/finish` · `GET /practice-items/:id/source` · `GET /notebooks/:id/priorities` |

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
  <sub>Licença <a href="LICENSE">MIT</a> · Feito por Eduardo Matheus · O guia de exemplo foi escrito para este projeto</sub>
</p>
