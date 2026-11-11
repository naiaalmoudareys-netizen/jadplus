/**
 * A consultation on the partner office's job page (ADR 0031; O5, P5, S4): what the owner asked (answers, best
 * time to call), the consent they gave, the owner's contact details (only with that consent, every view audited),
 * the stages so far, and the office's next step. Shown only for consultation requests; the visit steps do not
 * apply to them. The steps offered are the ones the API allows (consultation.actions); the API checks each again.
 */
import {
  consultationResponse,
  consultationTimeline,
  nextStages,
  type ConsultationView,
} from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { apiPath } from '../../lib/api';
import { answerLines, bestTimeText, consentLine, stepName } from '../../lib/consultation';
import { dateTime } from '../../lib/format';
import { useConsole, useLoad } from '../../ui/hooks';
import { Fact, Notice } from '../../ui/parts';
import {
  CloseConsultation,
  ContactMade,
  MoveStage,
  OwnerContact,
  type ConsultationFormProps,
} from './ConsultationForms';

type Step = ConsultationView['actions'][number];

const STEP_BUTTONS: Readonly<Record<Step, string>> = {
  contact_made: 'Contact made',
  move_stage: 'Next stage',
  close: 'Close (done / did not proceed)',
};

function Stages({ v }: { v: ConsultationView }): ReactNode {
  return (
    <ol className="tracker" aria-label="Stages">
      {consultationTimeline(v.serviceCode, v.status, v.steps).map((item) => (
        <li
          key={item.id}
          className={`tracker-step tracker-${item.state === 'done' ? 'done' : item.state === 'current' ? 'current' : 'next'}`}
          aria-current={item.state === 'current' ? 'step' : undefined}
          title={
            item.at === null
              ? undefined
              : `${dateTime(item.at)}${item.note === null ? '' : ` · ${item.note}`}`
          }
        >
          {stepName(v.serviceCode, item.id)}
        </li>
      ))}
    </ol>
  );
}

function Form({
  open,
  v,
  props,
}: {
  open: Step;
  v: ConsultationView;
  props: ConsultationFormProps;
}): ReactNode {
  switch (open) {
    case 'contact_made':
      return <ContactMade {...props} />;
    case 'move_stage':
      return (
        <MoveStage
          {...props}
          stages={nextStages(
            v.serviceCode,
            v.steps.map((s) => s.step),
          )}
        />
      );
    case 'close':
      return <CloseConsultation {...props} />;
  }
}

function Panel({ id, v, onChanged }: { id: string; v: ConsultationView; onChanged: () => void }): ReactNode {
  const [open, setOpen] = useState<Step | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const notes = v.steps.filter((s) => s.note !== null);
  const props: ConsultationFormProps = {
    jobId: id,
    serviceCode: v.serviceCode,
    onDone: (message) => {
      setOpen(null);
      setDone(message);
      onChanged();
    },
    onCancel: () => {
      setOpen(null);
    },
  };
  return (
    <>
      <section className="card">
        <h2 className="section-title">Consultation</h2>
        <Stages v={v} />
        <dl className="facts">
          {answerLines(v).map((a) => (
            <Fact key={a.question} label={a.question}>
              {a.answer}
            </Fact>
          ))}
          <Fact label="Best time to call">{bestTimeText(v)}</Fact>
          <Fact label="Consent">{consentLine(v)}</Fact>
          <Fact label="Owner's contact details">
            {v.contactShared ? (
              <OwnerContact jobId={id} />
            ) : (
              'Not shared with your office. Write to the owner through Messages.'
            )}
          </Fact>
        </dl>
        {notes.length === 0 ? null : (
          <>
            <h3 className="label">Notes the owner sees</h3>
            <ul>
              {notes.map((s) => (
                <li key={s.step}>
                  {stepName(v.serviceCode, s.step)} ({dateTime(s.at)}): {s.note}
                </li>
              ))}
            </ul>
          </>
        )}
        {v.actions.length === 0 ? null : (
          <div className="row-actions">
            {v.actions.map((a) => (
              <button
                key={a}
                type="button"
                className={open === a ? 'btn' : 'btn btn-outline'}
                aria-pressed={open === a}
                onClick={() => {
                  setDone(null);
                  setOpen(open === a ? null : a);
                }}
              >
                {STEP_BUTTONS[a]}
              </button>
            ))}
          </div>
        )}
      </section>
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      {open === null ? null : <Form key={open} open={open} v={v} props={props} />}
    </>
  );
}

/** Nothing for a request that is not a consultation. */
export function ConsultationSteps({ id, onChanged }: { id: string; onChanged: () => void }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(apiPath('requests', id, 'consultation'), consultationResponse),
    id,
  );
  if (state.status !== 'ready' || state.data.consultation === null) return null;
  return (
    <Panel
      id={id}
      v={state.data.consultation}
      onChanged={() => {
        reload();
        onChanged();
      }}
    />
  );
}
