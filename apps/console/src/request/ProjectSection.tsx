/**
 * After the owner approves the quote (ADR 0034; S4, O5): the furnishing delivery date and window (set, or moved
 * with a reason the owner sees), and the interior design stages (Concept → Design approved → Fit-out →
 * Handover, forward only, with an optional note). The forms show only when the API allows the step
 * (canSetDelivery / canMoveStage); JAD+ staff see the same section read only.
 */
import {
  PROJECT_STAGE_LABELS,
  VISIT_SLOTS,
  deliveryBody,
  projectStageBody,
  requestProjectResponse,
  type ProjectStage,
  type RequestProject,
  type VisitSlot,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { z } from 'zod';
import { apiPath } from '../lib/api';
import { dateTime, preferredText } from '../lib/format';
import { useAction } from '../ui/actions';
import { useConsole, useLoad } from '../ui/hooks';
import { Fact, Loaded, Notice, Section } from '../ui/parts';

const answer = z.object({ id: z.string() });

function DeliveryForm({ id, p, onDone }: { id: string; p: RequestProject; onDone: () => void }): ReactNode {
  const { api } = useConsole();
  const moving = p.delivery !== null;
  const [date, setDate] = useState(p.delivery?.date ?? '');
  const [slot, setSlot] = useState<VisitSlot>(p.delivery?.slot ?? 'morning');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = deliveryBody.safeParse({ date, slot, reason: reason.trim() === '' ? null : reason });
    if (!body.success || (moving && body.data.reason === null)) {
      setProblem(moving ? 'Choose the day and give the reason for the change.' : 'Choose the delivery day.');
      return;
    }
    setProblem(null);
    action.run(async () => {
      await api.put(apiPath('partner', 'jobs', id, 'delivery'), body.data, answer);
      setReason('');
      onDone();
    });
  };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span className="label">Delivery day</span>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Time window</span>
          <select
            value={slot}
            onChange={(e) => {
              const s = VISIT_SLOTS.find((v) => v.key === e.target.value);
              if (s !== undefined) setSlot(s.key);
            }}
          >
            {VISIT_SLOTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} ({s.hours})
              </option>
            ))}
          </select>
        </label>
      </div>
      {moving ? (
        <label className="field">
          <span className="label">Reason for the change (the owner sees it)</span>
          <textarea
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
          />
        </label>
      ) : null}
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Saving…' : moving ? 'Change delivery date' : 'Set delivery date'}
        </button>
      </div>
    </form>
  );
}

function Delivery({ id, p, onDone }: { id: string; p: RequestProject; onDone: () => void }): ReactNode {
  if (p.delivery === null && !p.canSetDelivery) return null;
  return (
    <Section title="Delivery">
      {p.delivery === null ? (
        <p className="muted">No delivery date yet. Set it in writing for the owner (S4).</p>
      ) : (
        <dl className="facts">
          <Fact label="Delivery">{preferredText(p.delivery)}</Fact>
          <Fact label="Set on">{dateTime(p.delivery.setAt)}</Fact>
          {p.delivery.reason === null ? null : (
            <Fact label="Reason for the last change">{p.delivery.reason}</Fact>
          )}
          {p.delivery.moves === 0 ? null : <Fact label="Changes">{p.delivery.moves}</Fact>}
        </dl>
      )}
      {p.canSetDelivery ? <DeliveryForm key={p.delivery?.setAt ?? 0} id={id} p={p} onDone={onDone} /> : null}
    </Section>
  );
}

function StageForm({
  id,
  next,
  onDone,
}: {
  id: string;
  next: readonly ProjectStage[];
  onDone: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [stage, setStage] = useState<ProjectStage | ''>(next[0] ?? '');
  const [note, setNote] = useState('');
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = projectStageBody.safeParse({ stage, note: note.trim() === '' ? null : note });
    if (!body.success) return;
    action.run(async () => {
      await api.post(apiPath('partner', 'jobs', id, 'project-stage'), body.data, answer);
      setNote('');
      onDone();
    });
  };
  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span className="label">Move to stage</span>
        <select
          value={stage}
          onChange={(e) => {
            setStage(next.find((s) => s === e.target.value) ?? '');
          }}
        >
          {next.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Note for the owner (optional)</span>
        <textarea
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </label>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy || stage === ''}>
          {action.busy ? 'Saving…' : 'Save the stage'}
        </button>
      </div>
    </form>
  );
}

function Stages({ id, p, onDone }: { id: string; p: RequestProject; onDone: () => void }): ReactNode {
  if (p.stages.length === 0 && !p.canMoveStage) return null;
  return (
    <Section title="Project stages">
      <ol className="plain stack">
        {p.stages.map((s) => (
          <li key={s.stage}>
            <strong>{PROJECT_STAGE_LABELS[s.stage]}</strong>{' '}
            <span className="hint">{s.at === null ? 'Not yet' : dateTime(s.at)}</span>
            {s.note === null ? null : <span className="block">{s.note}</span>}
          </li>
        ))}
      </ol>
      {p.canMoveStage ? (
        <StageForm key={p.nextStages.join()} id={id} next={p.nextStages} onDone={onDone} />
      ) : null}
    </Section>
  );
}

/** Nothing shows for other services, or before there is anything to show or do. */
export function ProjectSection({ id, onChanged }: { id: string; onChanged: () => void }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(apiPath('requests', id, 'project'), requestProjectResponse),
    id,
  );
  const done = (): void => {
    reload();
    onChanged();
  };
  return (
    <Loaded state={state} reload={reload}>
      {(p) => (
        <>
          <Delivery id={id} p={p} onDone={done} />
          <Stages id={id} p={p} onDone={done} />
        </>
      )}
    </Loaded>
  );
}
