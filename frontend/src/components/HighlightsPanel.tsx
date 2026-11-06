import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import type { Criterion, Highlight, HighlightRun, StudyDocument } from '../api/types.ts';
import { usePolling } from '../hooks/usePolling.ts';
import { criterionColor } from '../lib/colors.ts';
import { useToast } from './Toasts.tsx';

type Props = {
  notebookId: string;
  document: StudyDocument | null;
  highlights: Highlight[];
  onReloadHighlights: () => void;
  hidden: Set<string>;
  onToggleCriterion: (criterionId: string) => void;
  onOpenHighlight: (highlight: Highlight) => void;
};

/** "255, 214, 0" → "255 214 0" (formato usado com rgb(var(--c) / alfa)). */
const rgbVar = (key: string) => criterionColor(key).replaceAll(',', '');

export function HighlightsPanel(props: Props) {
  const { notebookId, document, highlights } = props;
  const notify = useToast();
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [runs, setRuns] = useState<HighlightRun[]>([]);
  const [label, setLabel] = useState('');
  const [instruction, setInstruction] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listCriteria(notebookId).then(setCriteria).catch((e: Error) => notify(e.message, 'error'));
  }, [notebookId, notify]);

  useEffect(() => setRuns([]), [document?.id]);

  const processing = runs.some((run) => run.status === 'processing');
  usePolling(
    async () => {
      const updated = await Promise.all(runs.map((run) => (run.status === 'processing' ? api.getRun(run.id) : run)));
      setRuns(updated);
      if (!updated.some((run) => run.status === 'processing')) {
        props.onReloadHighlights();
        const found = updated.reduce((sum, r) => sum + r.highlightCount, 0);
        const rejected = updated.reduce((sum, r) => sum + r.rejectedCount, 0);
        const failed = updated.filter((r) => r.status === 'failed');
        if (failed.length) notify(`Falha ao grifar: ${failed[0]!.error}`, 'error');
        else notify(`${found} grifo${found === 1 ? '' : 's'} encontrado${found === 1 ? '' : 's'} · ${rejected} descartado${rejected === 1 ? '' : 's'}`);
      }
    },
    1500,
    processing,
  );

  async function start() {
    if (!document || selected.size === 0) return;
    try {
      setRuns(await api.startHighlights(document.id, [...selected]));
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function createCriterion(event: FormEvent) {
    event.preventDefault();
    try {
      const criterion = await api.createCriterion(notebookId, label.trim(), instruction.trim());
      setCriteria((list) => [...list, criterion]);
      setSelected((set) => new Set(set).add(criterion.id));
      setLabel('');
      setInstruction('');
      setCreating(false);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  const toggle = (id: string) =>
    setSelected((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!document || document.status !== 'ready') {
    return <p className="muted" style={{ padding: 16 }}>Abra um documento pronto para grifar.</p>;
  }

  const total = runs.reduce((s, r) => s + Math.max(1, r.batchesTotal), 0);
  const done = runs.reduce((s, r) => s + (r.status === 'processing' ? r.batchesDone : Math.max(1, r.batchesTotal)), 0);
  const groups = criteria
    .map((criterion) => ({ criterion, items: highlights.filter((h) => h.criterion.id === criterion.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="hl">
      <h3>O que grifar em “{document.title}”?</h3>
      <div className="crit">
        {criteria.map((c) => (
          <label
            key={c.id}
            className={selected.has(c.id) ? 'on' : ''}
            style={{ ['--c' as string]: rgbVar(c.key) }}
            title={c.instruction}
          >
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="dot" />
            {c.label}
            {!c.builtin && <small className="muted">(seu)</small>}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <motion.button className="primary" onClick={start} disabled={selected.size === 0 || processing} whileTap={{ scale: 0.95 }}>
          {processing ? 'Grifando…' : `Grifar${selected.size ? ` (${selected.size})` : ''}`}
        </motion.button>
        <button className="link" onClick={() => setCreating((c) => !c)}>{creating ? 'Cancelar' : 'Criar meu critério'}</button>
      </div>

      <AnimatePresence initial={false}>
        {creating && (
          <motion.form
            className="custom"
            onSubmit={createCriterion}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <label className="visually-hidden" htmlFor="crit-label">Nome do critério</label>
            <input id="crit-label" placeholder="Nome (ex.: Cai na prova)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <label className="visually-hidden" htmlFor="crit-instr">O que grifar</label>
            <textarea
              id="crit-instr"
              rows={3}
              placeholder="O que grifar? (ex.: conceitos que o professor disse que caem na prova)"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <button className="primary" type="submit" disabled={!label.trim() || instruction.trim().length < 10}>Criar critério</button>
          </motion.form>
        )}
      </AnimatePresence>

      {runs.length > 0 && (
        <div className="runs">
          <div className="progress" aria-label="Progresso dos grifos">
            <motion.i animate={{ width: `${Math.round((done / total) * 100)}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
          </div>
          {runs.map((run) => (
            <span key={run.id}>
              <b>{run.criterion.label}</b>{' '}
              {run.status === 'processing' && `lote ${run.batchesDone} de ${run.batchesTotal || '?'}`}
              {run.status === 'ready' &&
                `${run.highlightCount} grifo(s) · ${run.rejectedCount} descartado(s) · ${(run.latencyMs / 1000).toFixed(1)} s · US$ ${run.usage.costUsd.toFixed(5)}`}
              {run.status === 'failed' && <span className="error">falhou: {run.error}</span>}
            </span>
          ))}
        </div>
      )}

      {groups.length === 0 && !processing && <p className="muted">Nenhum grifo neste documento ainda.</p>}
      {groups.map(({ criterion, items }) => (
        <div key={criterion.id} className="hgroup">
          <label className="hgroup-title" style={{ ['--c' as string]: rgbVar(criterion.key) }}>
            <input
              type="checkbox"
              checked={!props.hidden.has(criterion.id)}
              onChange={() => props.onToggleCriterion(criterion.id)}
              aria-label={`Mostrar grifos de ${criterion.label} no documento`}
            />
            <span className="dot" />
            {criterion.label} ({items.length})
          </label>
          {items.map((h, i) => (
            <motion.button
              key={h.id}
              className="hitem"
              style={{ ['--c' as string]: rgbVar(criterion.key) }}
              onClick={() => props.onOpenHighlight(h)}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: Math.min(i, 10) * 0.06, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ x: -2 }}
            >
              “{h.text}”
              <small>
                p. {h.pageNumber} · {h.justification}
              </small>
            </motion.button>
          ))}
        </div>
      ))}
    </div>
  );
}
