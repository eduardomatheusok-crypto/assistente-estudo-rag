import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.ts';
import type { Attempt, PracticeItem, PracticeSession } from '../../api/types.ts';
import { confetti } from '../../lib/confetti.ts';
import { composeAnswer, FORMATS, IDEAL_SECONDS, speechEstimate, type AnswerFormat } from '../../lib/interview.ts';
import { CountUp } from '../CountUp.tsx';
import { useToast } from '../Toasts.tsx';

type Props = {
  session: PracticeSession;
  index: number;
  onIndex: (index: number) => void;
  onUpdate: (session: PracticeSession) => void;
  onOpenSource: (item: PracticeItem) => void;
};

const ease = [0.22, 1, 0.36, 1] as const;
const CRITERIA: Array<[keyof NonNullable<Attempt['rubric']>, string]> = [
  ['precisao', 'Precisão'],
  ['estrutura', 'Estrutura'],
  ['clareza', 'Clareza'],
  ['exemplo', 'Exemplo'],
];
const RING = 2 * Math.PI * 50;
const fmt1 = (n: number) => n.toFixed(1).replace('.', ',');
const rise = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease } };

/** Rascunho por pergunta e modo, guardado só neste navegador (some ao enviar). */
const draftKey = (sessionId: string, itemId: string, format: AnswerFormat) => `draft:${sessionId}:${itemId}:${format}`;
function loadDraft(key: string, size: number): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.from({ length: size }, (_, i) => parsed[i] ?? '');
  } catch {
    return Array(size).fill('');
  }
}
function saveDraft(key: string, values: string[]) {
  try {
    if (values.some((v) => v.trim())) localStorage.setItem(key, JSON.stringify(values));
    else localStorage.removeItem(key);
  } catch {
    // sem armazenamento local: o rascunho só não é guardado
  }
}
function preferredFormat(): AnswerFormat {
  try {
    const v = localStorage.getItem('answer-format');
    return v === 'free' || v === 'star' || v === 'guided' ? v : 'guided';
  } catch {
    return 'guided';
  }
}

/** Entrevista (Entrevistador): conversa, campo que ajuda a estruturar a resposta e avaliação por critérios. */
export function Interview({ session, index, onIndex, onUpdate, onOpenSource }: Props) {
  const notify = useToast();
  const item = session.items[index];
  const [format, setFormat] = useState<AnswerFormat>(preferredFormat);
  const [values, setValues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [typing, setTyping] = useState(true);
  const chatRef = useRef<HTMLDivElement>(null);

  const spec = FORMATS[format];
  const key = item ? draftKey(session.id, item.id, format) : '';

  // Nova pergunta: o entrevistador "digita" antes de aparecer.
  useEffect(() => {
    setRetrying(false);
    setTyping(true);
    const t = setTimeout(() => setTyping(false), 900);
    return () => clearTimeout(t);
  }, [item?.id]);

  useEffect(() => {
    if (item) setValues(loadDraft(key, spec.fields.length));
  }, [key, item, spec.fields.length]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [index, typing, session, busy]);

  const text = composeAnswer(format, values);
  const speech = speechEstimate(text);
  const answering = item && (!item.attempt || retrying);

  function change(i: number, value: string) {
    const next = values.map((v, j) => (j === i ? value : v));
    setValues(next);
    saveDraft(key, next);
  }

  function chooseFormat(f: AnswerFormat) {
    setFormat(f);
    try {
      localStorage.setItem('answer-format', f);
    } catch {
      // preferência só não é lembrada
    }
  }

  async function send() {
    if (!item || !text) return notify('Escreva sua resposta antes de enviar.');
    setBusy(true);
    try {
      const updated = await api.answer(session.id, { itemId: item.id, text, format });
      onUpdate(updated);
      saveDraft(key, []);
      setValues(Array(spec.fields.length).fill(''));
      setRetrying(false);
      const a = updated.items.find((i) => i.id === item.id)?.attempt;
      if (a && a.score >= 0.8) confetti(window.innerWidth - 160, 160);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const answeredItems = session.items.slice(0, index + 1);
  const meterColor = speech.status === 'short' ? 'var(--accent)' : speech.status === 'ideal' ? 'var(--good)' : 'var(--bad)';
  const maxSeconds = 160;

  return (
    <div className="iv">
      <div className="iv-main">
        <div className="iv-chat" ref={chatRef}>
          <motion.div className="iv-msg" {...rise}>
            <span className="avatar">EN</span>
            <div className="bubble">Olá! Vou fazer {session.items.length} perguntas sobre o seu material. Responda como numa entrevista de verdade.</div>
          </motion.div>
          {answeredItems.map((q, i) => {
            const current = i === index;
            const a = q.attempt;
            return (
              <div key={q.id} style={{ display: 'contents' }}>
                {current && typing ? (
                  <motion.div className="iv-msg" {...rise}>
                    <span className="avatar">EN</span>
                    <div className="bubble" aria-label="O entrevistador está digitando">
                      <span className="typing"><i /><i /><i /></span>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div className="iv-msg" {...rise}>
                    <span className="avatar">EN</span>
                    <div className="bubble">
                      <b>{q.prompt}</b>
                    </div>
                  </motion.div>
                )}
                {a && !(current && typing) && (
                  <>
                    <motion.div className="iv-msg me" {...rise}>
                      <span className="avatar">VC</span>
                      <div className="bubble">{a.answerText}</div>
                    </motion.div>
                    <motion.div className="iv-msg" {...rise} transition={{ ...rise.transition, delay: 0.25 }}>
                      <span className="avatar">EN</span>
                      <div className="bubble">
                        {a.feedback} <b>Nota {fmt1(a.score * 10)}/10.</b>
                        {a.tries > 1 && <small className="muted"> ({a.tries}ª tentativa)</small>}
                      </div>
                    </motion.div>
                  </>
                )}
              </div>
            );
          })}
          {!item && (
            <motion.div className="iv-msg" {...rise}>
              <span className="avatar">EN</span>
              <div className="bubble">Obrigado! A entrevista terminou. Veja ao lado como você foi em cada critério.</div>
            </motion.div>
          )}
          {busy && (
            <motion.div className="iv-msg" {...rise}>
              <span className="avatar">EN</span>
              <div className="bubble"><span className="typing"><i /><i /><i /></span></div>
            </motion.div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {answering && !typing && (
            <motion.div
              className="composer"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.35, ease }}
            >
              <div className="modes">
                Responder:
                <div className="seg" role="radiogroup" aria-label="Modo de resposta">
                  {(Object.keys(FORMATS) as AnswerFormat[]).map((f) => (
                    <button key={f} role="radio" aria-checked={format === f} className={format === f ? 'active' : ''} onClick={() => chooseFormat(f)}>
                      {format === f && <motion.span layoutId="format-knob" className="seg-knob" transition={{ type: 'spring', stiffness: 520, damping: 30 }} />}
                      <span>{FORMATS[f].label}</span>
                    </button>
                  ))}
                </div>
                <span>{spec.hint}</span>
              </div>
              <div className={`fields ${spec.fields.length === 3 ? 'cols-3' : spec.fields.length === 4 ? 'cols-4' : ''}`}>
                {spec.fields.map((field, i) => (
                  <motion.div
                    key={`${format}-${i}`}
                    className="field"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3, ease }}
                  >
                    <label htmlFor={`field-${i}`}>{field.label}</label>
                    <textarea
                      id={`field-${i}`}
                      rows={spec.fields.length === 1 ? 5 : 3}
                      placeholder={field.placeholder}
                      value={values[i] ?? ''}
                      onChange={(e) => change(i, e.target.value)}
                      disabled={busy}
                    />
                  </motion.div>
                ))}
              </div>
              <div className="meter">
                <span>
                  {speech.words} palavra{speech.words === 1 ? '' : 's'}
                </span>
                <div className="track">
                  <span className="ideal" style={{ left: `${(IDEAL_SECONDS.min / maxSeconds) * 100}%`, width: `${((IDEAL_SECONDS.max - IDEAL_SECONDS.min) / maxSeconds) * 100}%` }} />
                  <motion.span
                    className="fill"
                    animate={{ width: `${Math.min(100, (speech.seconds / maxSeconds) * 100)}%`, backgroundColor: meterColor }}
                    transition={{ duration: 0.3, ease }}
                  />
                </div>
                <span>
                  ~{speech.seconds} s falando · ideal {IDEAL_SECONDS.min} s a 2 min
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                <small className="muted" style={{ marginRight: 'auto' }}>Rascunho salvo automaticamente neste navegador</small>
                {retrying && <button onClick={() => setRetrying(false)}>Cancelar</button>}
                <motion.button className="primary" disabled={busy || !text} onClick={send} whileTap={{ scale: 0.96 }}>
                  {busy ? 'Avaliando…' : 'Enviar resposta'}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <aside className="iv-side">
        {busy ? (
          <>
            <b>Avaliando sua resposta…</b>
            <div className="skel" style={{ borderRadius: 12 }}>
              <i style={{ width: '60%' }} />
              <i style={{ width: '90%' }} />
              <i style={{ width: '75%' }} />
              <i style={{ width: '85%' }} />
            </div>
          </>
        ) : item ? (
          item.attempt && !retrying ? (
            <Evaluation
              key={`${item.id}-${item.attempt.tries}`}
              item={item}
              attempt={item.attempt}
              isLast={index === session.items.length - 1}
              onRetry={() => setRetrying(true)}
              onNext={() => onIndex(index + 1)}
              onOpenSource={() => onOpenSource(item)}
            />
          ) : (
            <>
              <b>Avaliação</b>
              <p className="muted">Responda à pergunta para ver a nota por critério, o que faltou e uma resposta-modelo tirada do material.</p>
            </>
          )
        ) : (
          <Summary session={session} />
        )}
      </aside>
    </div>
  );
}

function Ring({ score }: { score: number }) {
  return (
    <div className="ring" aria-label={`Nota ${fmt1(score * 10)} de 10`}>
      <svg width="120" height="120">
        <circle className="bg" cx="60" cy="60" r="50" />
        <motion.circle
          className="fg"
          cx="60"
          cy="60"
          r="50"
          strokeDasharray={RING}
          initial={{ strokeDashoffset: RING }}
          animate={{ strokeDashoffset: RING * (1 - score) }}
          transition={{ duration: 1.2, ease }}
          style={{ stroke: score >= 0.7 ? 'var(--good)' : score >= 0.5 ? 'var(--accent)' : 'var(--bad)' }}
        />
      </svg>
      <b><CountUp value={score * 10} format={fmt1} /></b>
    </div>
  );
}

function CriteriaBars({ rubric }: { rubric: Record<string, number | null> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {CRITERIA.map(([k, label], i) => {
        const value = rubric[k];
        if (value == null) {
          return (
            <div key={k} className="crit-row na" title="A pergunta não pedia exemplo: este critério não entra na nota.">
              <span>{label}</span>
              <small className="muted">não se aplica</small>
              <b>—</b>
            </div>
          );
        }
        const v = value;
        return (
          <div key={k} className="crit-row">
            <span>{label}</span>
            <div className="bar">
              <motion.i
                initial={{ width: 0 }}
                animate={{ width: `${v * 10}%` }}
                transition={{ duration: 0.9, delay: 0.2 + i * 0.08, ease }}
                style={{ background: v >= 7 ? 'var(--good)' : v >= 5 ? 'var(--accent)' : 'var(--bad)' }}
              />
            </div>
            <b>{Number.isInteger(v) ? v : fmt1(v)}</b>
          </div>
        );
      })}
    </div>
  );
}

function Evaluation(props: {
  item: PracticeItem;
  attempt: Attempt;
  isLast: boolean;
  onRetry: () => void;
  onNext: () => void;
  onOpenSource: () => void;
}) {
  const { attempt, item } = props;
  return (
    <motion.div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <b>Avaliação</b>
      <Ring score={attempt.score} />
      {attempt.rubric && <CriteriaBars rubric={attempt.rubric} />}
      {attempt.missingPoints && attempt.missingPoints.length > 0 && (
        <div>
          <small className="muted">O que faltou</small>
          <div className="miss">
            {attempt.missingPoints.map((p, i) => (
              <motion.span key={p} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.6 + i * 0.12 }}>
                {p}
              </motion.span>
            ))}
          </div>
        </div>
      )}
      {(attempt.modelAnswer ?? item.referenceAnswer) && (
        <details open>
          <summary>Resposta-modelo (do material)</summary>
          <div className="model">{attempt.modelAnswer ?? item.referenceAnswer}</div>
          <button className="link" onClick={props.onOpenSource} style={{ marginTop: 6 }}>
            Fonte: {item.source.documentTitle}, p. {item.source.pageNumber}
          </button>
        </details>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={props.onRetry} title="Reescreva a resposta: ela é avaliada de novo">Tentar de novo</button>
        <motion.button className="primary" style={{ flex: 1 }} onClick={props.onNext} whileTap={{ scale: 0.96 }}>
          {props.isLast ? 'Ver resultado' : 'Próxima pergunta'}
        </motion.button>
      </div>
    </motion.div>
  );
}

/** Fim da entrevista: média geral e por critério, para saber o que treinar. */
function Summary({ session }: { session: PracticeSession }) {
  const attempts = session.items.map((i) => i.attempt).filter((a): a is Attempt => !!a);
  if (attempts.length === 0) return <p className="muted">Nenhuma pergunta respondida.</p>;
  const avg = attempts.reduce((s, a) => s + a.score, 0) / attempts.length;
  // média por critério só das respostas em que ele se aplica (o exemplo pode ficar de fora)
  const rubric: Record<string, number | null> = {};
  for (const [k] of CRITERIA) {
    const values = attempts.map((a) => a.rubric?.[k]).filter((v): v is number => typeof v === 'number');
    rubric[k] = values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null;
  }
  const rated = CRITERIA.filter(([k]) => rubric[k] != null);
  const weakest = rated.length ? rated.reduce((w, c) => (rubric[c[0]]! < rubric[w[0]]! ? c : w)) : null;
  return (
    <motion.div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
      <b>Resultado da entrevista</b>
      <Ring score={avg} />
      <small className="muted" style={{ textAlign: 'center' }}>
        média de {attempts.length} resposta{attempts.length === 1 ? '' : 's'}
      </small>
      <CriteriaBars rubric={rubric} />
      {weakest && (
        <p>
          Ponto a melhorar: <b>{weakest[1]}</b>. Treine de novo pelas respostas do chat.
        </p>
      )}
    </motion.div>
  );
}
