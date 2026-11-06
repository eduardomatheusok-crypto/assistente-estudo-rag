import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import type { Criterion, Highlight, HighlightRun, StudyDocument } from '../api/types.ts';
import { usePolling } from '../hooks/usePolling.ts';
import { criterionColor } from '../lib/colors.ts';

type Props = {
  notebookId: string;
  document: StudyDocument | null;
  highlights: Highlight[];
  onReloadHighlights: () => void;
  hidden: Set<string>;
  onToggleCriterion: (criterionId: string) => void;
  onOpenHighlight: (highlight: Highlight) => void;
};

export function HighlightsPanel(props: Props) {
  const { notebookId, document, highlights } = props;
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [runs, setRuns] = useState<HighlightRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [instruction, setInstruction] = useState('');

  useEffect(() => {
    api.listCriteria(notebookId).then(setCriteria).catch((e: Error) => setError(e.message));
  }, [notebookId]);

  useEffect(() => {
    setRuns([]);
  }, [document?.id]);

  const processing = runs.some((run) => run.status === 'processing');
  usePolling(
    async () => {
      const updated = await Promise.all(runs.map((run) => (run.status === 'processing' ? api.getRun(run.id) : run)));
      setRuns(updated);
      if (!updated.some((run) => run.status === 'processing')) props.onReloadHighlights();
    },
    2000,
    processing,
  );

  async function start() {
    if (!document || selected.size === 0) return;
    setError(null);
    try {
      setRuns(await api.startHighlights(document.id, [...selected]));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createCriterion(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const criterion = await api.createCriterion(notebookId, label.trim(), instruction.trim());
      setCriteria((list) => [...list, criterion]);
      setSelected((set) => new Set(set).add(criterion.id));
      setLabel('');
      setInstruction('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const toggleSelected = (id: string) =>
    setSelected((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!document || document.status !== 'ready') {
    return <p className="muted panel-pad">Abra um documento pronto para grifar.</p>;
  }

  const groups = criteria
    .map((criterion) => ({ criterion, items: highlights.filter((h) => h.criterion.id === criterion.id) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="highlights panel-pad">
      <section>
        <h3>O que grifar em “{document.title}”?</h3>
        <ul className="criteria">
          {criteria.map((c) => (
            <li key={c.id}>
              <label title={c.instruction}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} />
                <span className="swatch" style={{ background: `rgb(${criterionColor(c.key)})` }} />
                {c.label}
                {!c.builtin && <small className="muted"> (seu)</small>}
              </label>
            </li>
          ))}
        </ul>
        <button onClick={start} disabled={selected.size === 0 || processing}>
          {processing ? 'Grifando…' : `Grifar (${selected.size})`}
        </button>
        <details className="custom-criterion">
          <summary>Criar meu critério</summary>
          <form className="stack" onSubmit={createCriterion}>
            <input placeholder="Nome (ex.: Cai na prova)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <textarea
              placeholder="O que grifar? (ex.: conceitos que o professor disse que caem na prova)"
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <button type="submit" disabled={!label.trim() || instruction.trim().length < 10}>Criar critério</button>
          </form>
        </details>
      </section>

      {runs.length > 0 && (
        <section>
          <h3>Execuções</h3>
          <ul className="runs">
            {runs.map((run) => (
              <li key={run.id}>
                <strong>{run.criterion.label}</strong>{' '}
                {run.status === 'processing' && `processando lote ${run.batchesDone} de ${run.batchesTotal || '?'}`}
                {run.status === 'ready' &&
                  `${run.highlightCount} grifo(s) · ${run.rejectedCount} descartado(s) · ${(run.latencyMs / 1000).toFixed(1)} s · US$ ${run.usage.costUsd.toFixed(5)}`}
                {run.status === 'failed' && <span className="error">falhou: {run.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      <section>
        <h3>Grifos</h3>
        {groups.length === 0 && <p className="muted">Nenhum grifo neste documento ainda.</p>}
        {groups.map(({ criterion, items }) => (
          <div key={criterion.id} className="highlight-group">
            <label className="group-title">
              <input
                type="checkbox"
                checked={!props.hidden.has(criterion.id)}
                onChange={() => props.onToggleCriterion(criterion.id)}
                aria-label={`Mostrar grifos de ${criterion.label} no documento`}
              />
              <span className="swatch" style={{ background: `rgb(${criterionColor(criterion.key)})` }} />
              {criterion.label} ({items.length})
            </label>
            <ul>
              {items.map((h) => (
                <li key={h.id}>
                  <button className="highlight-item" onClick={() => props.onOpenHighlight(h)}>
                    <q>{h.text}</q>
                    <small>
                      p. {h.pageNumber} · {h.justification}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
