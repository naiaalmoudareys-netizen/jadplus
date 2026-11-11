/**
 * One handover checklist (O2; ADR 0033): every step with its date and note, "Mark done" or "Put back" (with an
 * optional note the owner sees), and the key collection appointment (a working day and a time window), booked
 * after the final payment has cleared. The keys are collected last, which completes and locks the checklist.
 * JAD+ Admin and the handover team change it; a viewer reads.
 */
import {
  HANDOVER_NOTE_MAX,
  VISIT_SLOTS,
  handoverChangedResponse,
  staffHandoversResponse,
  stepChange,
  type HandoverChecklist,
  type HandoverStep,
  type VisitSlot,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { apiPath } from '../lib/api';
import { dateTime } from '../lib/format';
import { appointmentText, handoverProgressText, staffBase, stepLabel, unitText } from '../lib/owner-journey';
import { canChange } from '../lib/session';
import { useAction } from '../ui/actions';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Fact, Link, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';

function StepRow({
  h,
  step,
  editable,
  onSaved,
}: {
  h: HandoverChecklist;
  step: HandoverChecklist['steps'][number];
  editable: boolean;
  onSaved: () => void;
}): ReactNode {
  const { api, session } = useConsole();
  const [note, setNote] = useState(step.note ?? '');
  const action = useAction();
  const done = step.doneAt !== null;
  const allowed = stepChange(h, step.step, !done) === null;
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      await api.post(
        apiPath(staffBase(session.role), 'handovers', h.id, 'steps'),
        { step: step.step, done: !done, note: note.trim() === '' ? null : note },
        handoverChangedResponse,
      );
      onSaved();
    });
  };
  return (
    <tr>
      <td>{stepLabel(step.step)}</td>
      <td>
        {done && step.doneAt !== null ? (
          <Tag tone="good">Done {dateTime(step.doneAt)}</Tag>
        ) : (
          <Tag tone="calm">To do</Tag>
        )}
      </td>
      <td>{step.note ?? ''}</td>
      {editable ? (
        <td>
          {allowed ? (
            <form className="inline-form" onSubmit={save}>
              <input
                aria-label={`Note for ${stepLabel(step.step)}`}
                value={note}
                maxLength={HANDOVER_NOTE_MAX}
                placeholder="Note for the owner (optional)"
                onChange={(e) => {
                  setNote(e.target.value);
                }}
              />
              <button type="submit" className="btn btn-small" disabled={action.busy}>
                {action.busy ? 'Saving…' : done ? 'Put back' : 'Mark done'}
              </button>
            </form>
          ) : (
            <span className="hint">{hintFor(step.step, h)}</span>
          )}
          {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
        </td>
      ) : null}
    </tr>
  );
}

function hintFor(step: HandoverStep, h: HandoverChecklist): string {
  if (h.completedAt !== null) return 'Complete';
  if (step === 'key_appointment') return 'Done by booking the key collection below';
  return 'After every other step';
}

function Appointment({ h, onSaved }: { h: HandoverChecklist; onSaved: () => void }): ReactNode {
  const { api, session } = useConsole();
  const [date, setDate] = useState(h.appointment?.date ?? '');
  const [slot, setSlot] = useState<VisitSlot>(h.appointment?.slot ?? 'morning');
  const action = useAction();
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      await api.put(
        apiPath(staffBase(session.role), 'handovers', h.id, 'appointment'),
        { date, slot },
        handoverChangedResponse,
      );
      onSaved();
    });
  };
  return (
    <form className="stack" onSubmit={save}>
      <div className="form-grid">
        <label className="field">
          <span className="label">Day</span>
          <input
            type="date"
            value={date}
            required
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
              const found = VISIT_SLOTS.find((s) => s.key === e.target.value);
              if (found !== undefined) setSlot(found.key);
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
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Saving…' : h.appointment === null ? 'Book key collection' : 'Move key collection'}
        </button>
      </div>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </form>
  );
}

export function HandoverPage({ id }: { id: string }): ReactNode {
  const { api, session } = useConsole();
  const editable = canChange(session.role);
  const { state, reload } = useLoad(
    () => api.get(apiPath(staffBase(session.role), 'handovers'), staffHandoversResponse),
    `handover:${id}`,
  );
  return (
    <Loaded state={state} reload={reload}>
      {({ handovers }) => {
        const h = handovers.find((x) => x.id === id);
        if (h === undefined) return <Empty>This handover is not in your list.</Empty>;
        const locked = h.completedAt !== null;
        return (
          <>
            <PageHeader
              eyebrow="Handover"
              title={unitText(h)}
              tags={<Tag tone={locked ? 'good' : 'warn'}>{handoverProgressText(h)}</Tag>}
            />
            <section className="card">
              <dl className="facts">
                <Fact label="Request">
                  <Link to={{ name: 'request', id: h.requestId }}>{h.requestRef}</Link>
                </Fact>
                <Fact label="Started">{dateTime(h.startedAt)}</Fact>
                <Fact label="Team">{h.partnerName ?? 'No team'}</Fact>
                <Fact label="Key collection">{appointmentText(h)}</Fact>
              </dl>
              <p className="hint">
                The owner sees every step, its date and your note. To ask for another key collection time, the
                owner writes on the handover request.
              </p>
            </section>
            <Section title="Steps">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Step</th>
                    <th scope="col">State</th>
                    <th scope="col">Note for the owner</th>
                    {editable ? <th scope="col">Change</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {h.steps.map((s) => (
                    <StepRow
                      key={`${s.step}:${String(s.doneAt)}:${s.note ?? ''}`}
                      h={h}
                      step={s}
                      editable={editable}
                      onSaved={reload}
                    />
                  ))}
                </tbody>
              </table>
            </Section>
            {editable && !locked ? (
              <Section title="Key collection appointment">
                <p className="hint">
                  A working day, after the final payment has cleared. The owner sees it at once.
                </p>
                <Appointment key={appointmentText(h)} h={h} onSaved={reload} />
              </Section>
            ) : null}
          </>
        );
      }}
    </Loaded>
  );
}
