import { motion, type Variants } from 'motion/react';
import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { Notebook, NotebookOverview, StudyDocument } from '../api/types.ts';
import { percent, relativeDay } from '../lib/format.ts';
import { CountUp } from './CountUp.tsx';

type Props = {
  notebook: Notebook;
  documents: StudyDocument[];
  /** Muda quando algo relevante acontece (upload, pergunta, treino) para recarregar os números. */
  refreshKey: number;
  onOpenDocument: (id: string) => void;
  onOpenSession: (id: string) => void;
  /** Abre o documento na citação, com o trecho pintado. */
  onOpenCitation: (citationId: string) => void;
};

const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

const STATUS: Record<StudyDocument['status'], [string, string]> = {
  ready: ['pronto', 'ok'],
  processing: ['processando', 'warn'],
  failed: ['falhou', 'bad'],
};

/** Linhas decorativas da miniatura; as amarelas indicam que o documento tem grifos. */
function Thumb({ highlighted }: { highlighted: boolean }) {
  const lines = [46, 78, 70, 58, 66];
  return (
    <div className="thumb" aria-hidden="true">
      {lines.map((w, i) => (
        <i key={i} className={highlighted && i % 2 === 1 ? 'h' : ''} style={{ top: 14 + i * 13, width: `${w}%` }} />
      ))}
    </div>
  );
}

export function NotebookHome({ notebook, documents, refreshKey, onOpenDocument, onOpenSession, onOpenCitation }: Props) {
  const [overview, setOverview] = useState<NotebookOverview | null>(null);

  useEffect(() => {
    api.overview(notebook.id).then(setOverview).catch(() => setOverview(null));
  }, [notebook.id, refreshKey]);

  const highlightsOf = (id: string) => overview?.documents.find((d) => d.documentId === id)?.highlights ?? 0;
  const goal = overview?.goalType === 'entrevista' ? 'Entrevista' : overview?.goalType === 'prova' ? 'Prova' : 'Objetivo não definido';
  const c = overview?.counts;

  return (
    <section className="scroll">
      <motion.div className="home-wrap" variants={list} initial="hidden" animate="show" key={notebook.id}>
        <motion.div className="hello" variants={item}>
          <h1>{notebook.name}</h1>
          <p>
            {goal} · {documents.length} documento{documents.length === 1 ? '' : 's'}
            {c ? ` · ${c.questions} pergunta${c.questions === 1 ? '' : 's'} · ${c.sessionsThisWeek} treino${c.sessionsThisWeek === 1 ? '' : 's'} esta semana` : ''}
          </p>
        </motion.div>

        <motion.div className="stats" variants={item}>
          <div className="stat"><b><CountUp value={c?.questions ?? 0} /></b><span>perguntas respondidas</span></div>
          <div className="stat"><b><CountUp value={c?.highlights ?? 0} /></b><span>grifos no material</span></div>
          <div className="stat"><b><CountUp value={c?.flashcardsReviewed ?? 0} /></b><span>flashcards revisados</span></div>
          <div className="stat">
            <b>{c?.simulationAverage == null ? '—' : <CountUp value={c.simulationAverage * 100} format={(n) => `${Math.round(n)}%`} />}</b>
            <span>média nas simulações</span>
          </div>
        </motion.div>

        <div className="grid2">
          <motion.div className="card" variants={item}>
            <h3>Documentos</h3>
            {documents.length === 0 ? (
              <p className="empty">Envie um PDF, Markdown ou TXT pela barra lateral.</p>
            ) : (
              <div className="docs">
                {documents.map((doc) => {
                  const [label, tone] = STATUS[doc.status];
                  const hl = highlightsOf(doc.id);
                  return (
                    <motion.button
                      key={doc.id}
                      className="doc-card"
                      onClick={() => onOpenDocument(doc.id)}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Thumb highlighted={hl > 0} />
                      <b>{doc.title}</b>
                      <div className="chips">
                        <span className={`chip ${tone}`}>{label}</span>
                        {doc.pageCount ? <span className="chip">{doc.pageCount} p.</span> : null}
                        {hl > 0 && <span className="chip">{hl} grifos</span>}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>

          <motion.div className="card" variants={item}>
            <h3>Continue de onde parou</h3>
            <div className="list">
              {overview?.recentSessions.map((s) => (
                <button key={s.id} className="row" onClick={() => onOpenSession(s.id)}>
                  <span className="ico">{s.mode === 'flashcards' ? 'F' : s.goalType === 'entrevista' ? 'E' : 'S'}</span>
                  <span>
                    {s.mode === 'flashcards' ? 'Flashcards' : s.goalType === 'entrevista' ? 'Entrevista' : 'Simulação de prova'}
                    {s.topic ? `: ${s.topic}` : ''}
                    <small>
                      {s.correct} de {s.total} {s.mode === 'flashcards' ? 'lembrados' : 'certas'} · {relativeDay(s.createdAt)}
                    </small>
                  </span>
                </button>
              ))}
              {overview?.recentQuestions.map((q) => (
                <button
                  key={q.id}
                  className="row"
                  disabled={!q.firstCitationId}
                  title={q.firstCitationId ? 'Abrir o trecho citado na resposta' : 'Sem citação: a pergunta não foi encontrada no material'}
                  onClick={() => q.firstCitationId && onOpenCitation(q.firstCitationId)}
                >
                  <span className="ico">?</span>
                  <span>
                    {q.question}
                    <small>
                      {q.status === 'answered' ? `Respondida com ${q.citations} citaç${q.citations === 1 ? 'ão' : 'ões'}` : 'Não encontrada no material'} ·{' '}
                      {relativeDay(q.createdAt)}
                    </small>
                  </span>
                </button>
              ))}
              {overview && overview.recentSessions.length + overview.recentQuestions.length === 0 && (
                <p className="empty">Abra um documento e faça sua primeira pergunta.</p>
              )}
            </div>

            {overview && overview.topics.length > 0 && (
              <div className="topic-bars">
                <small className="muted">Acertos por assunto</small>
                {overview.topics.map((t) => (
                  <div key={t.topic}>
                    <small>
                      {t.topic} · {percent(t.accuracy)}
                    </small>
                    <div className="bar">
                      <motion.i
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(t.accuracy * 100)}%` }}
                        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                        style={{ background: t.accuracy >= 0.7 ? 'var(--good)' : t.accuracy >= 0.5 ? 'var(--accent)' : 'var(--bad)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
