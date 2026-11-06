# Projeto: Assistente de Aprendizagem com RAG

## Objetivo

Construir um assistente de aprendizagem com RAG que transforma materiais enviados pelos estudantes em experiências de estudo personalizadas.

Os estudantes organizam documentos (PDF, Markdown e TXT) em cadernos por disciplina e podem:

1. **Consultar materiais:** fazer perguntas com respostas fundamentadas nos documentos, citações de páginas e acesso aos trechos originais.
2. **Grifar por critérios:** identificar definições, fórmulas, datas, exemplos e outros conteúdos definidos pelo estudante, com justificativas.
3. **Priorizar conteúdos:** identificar assuntos relevantes considerando objetivos, prazos, preferências e características do material.
4. **Organizar estudos:** receber recomendações e planos de estudo personalizados.
5. **Avaliar aprendizagem:** resolver exercícios, identificar dificuldades e acompanhar a evolução do conhecimento.

## Stack

- Backend: TypeScript, Node.js, APIs REST.
- Frontend: React + TypeScript, PDF.js para exibir o PDF.
- Banco: PostgreSQL com pgvector.
- LLM e embeddings atrás de uma interface (provedor trocável).

## Regras de engenharia

- Arquitetura em camadas (rotas, serviços, repositórios, provedores).
- Nas respostas, o LLM usa SOMENTE os trechos recuperados. Sem informação nos trechos = "não encontrei no material", nunca inventar.
- Todo grifo deve ser um texto que existe literalmente no documento; grifos que não forem encontrados no texto original são descartados.
- Saídas do LLM em JSON validado por schema.
- Toda etapa registra latência; toda chamada ao LLM registra tokens e custo.
- Testes unitários para chunking, busca, validação de saída e localização de grifos.
- As recomendações de estudo devem considerar os objetivos, o tempo disponível e as preferências do estudante. Prioridades identificadas pela IA devem possuir justificativas fundamentadas no material.
- Não confundir consulta ou visualização de conteúdo com domínio do assunto. Utilizar o desempenho em exercícios como evidência de aprendizagem.
- Separar métricas de qualidade técnica da IA (recuperação, precisão, alucinação, latência e custo) das métricas de aprendizagem (desempenho em exercícios, evolução e retenção).
- Implementar uma etapa por vez e aguardar minha revisão antes de seguir.
- Ao terminar cada etapa, explicar as decisões tomadas e as alternativas descartadas.