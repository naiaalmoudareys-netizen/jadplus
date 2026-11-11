/**
 * The provider office's consultation step forms (ADR 0031; O5, P5): "Contact made", the next stage reached, and
 * closing as Done or Did not proceed (with the reason the owner sees). Each note is shown to the owner; contact
 * details in it are masked by the API. Also the owner's contact details, opened on request (every view is audited).
 */
import {
  closeConsultationBody,
  consultationContactResponse,
  consultationStageBody,
  consultationStepResponse,
  contactMadeBody,
  CONSULTATION_NOTE_MAX,
  type ConsultationContact,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { apiPath } from '../../lib/api';
import { stepName } from '../../lib/consultation';
import { useAction } from '../../ui/actions';
import { useConsole } from '../../ui/hooks';
import { Notice } from '../../ui/parts';
import { StepShell } from './shared';

export interface ConsultationFormProps {
  readonly jobId: string;
  readonly serviceCode: string;
  readonly onDone: (message: string) => void;
  readonly onCancel: () => void;
}

const path = (jobId: string, step: string) => apiPath('partner', 'jobs', jobId, 'consultation', step);

function NoteField({
  label,
  value,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  onChange: (v: string) => void;
}): ReactNode {
  return (
    <label className="field wide">
      <span className="label">{label}</span>
      <textarea
        value={value}
        maxLength={CONSULTATION_NOTE_MAX}
        required={required}
        rows={3}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

const optionalNote = (text: string) => (text.trim() === '' ? {} : { note: text.trim() });

export function ContactMade({ jobId, onDone, onCancel }: ConsultationFormProps): ReactNode {
  const { api } = useConsole();
  const action = useAction();
  const [note, setNote] = useState('');
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = contactMadeBody.safeParse(optionalNote(note));
    if (!body.success) return;
    action.run(async () => {
      await api.post(path(jobId, 'contact-made'), body.data, consultationStepResponse);
      onDone('Contact recorded. The owner sees it in the app.');
    });
  };
  return (
    <StepShell
      title="Contact made"
      action={action}
      submitLabel="Record contact"
      ready
      onSubmit={submit}
      onCancel={onCancel}
    >
      <NoteField label="Note for the owner (optional)" value={note} onChange={setNote} />
    </StepShell>
  );
}

export function MoveStage({
  jobId,
  serviceCode,
  stages,
  onDone,
  onCancel,
}: ConsultationFormProps & { stages: readonly string[] }): ReactNode {
  const { api } = useConsole();
  const action = useAction();
  const [stage, setStage] = useState(stages[0] ?? '');
  const [note, setNote] = useState('');
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = consultationStageBody.safeParse({ stage, ...optionalNote(note) });
    if (!body.success) return;
    action.run(async () => {
      await api.post(path(jobId, 'stage'), body.data, consultationStepResponse);
      onDone(`Moved to ${stepName(serviceCode, stage)}.`);
    });
  };
  return (
    <StepShell
      title="Move to the next stage"
      action={action}
      submitLabel="Save stage"
      ready={stage !== ''}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <label className="field">
        <span className="label">Stage reached</span>
        <select
          value={stage}
          onChange={(e) => {
            setStage(e.target.value);
          }}
        >
          {stages.map((s) => (
            <option key={s} value={s}>
              {stepName(serviceCode, s)}
            </option>
          ))}
        </select>
      </label>
      <NoteField label="Note for the owner (optional)" value={note} onChange={setNote} />
    </StepShell>
  );
}

export function CloseConsultation({ jobId, onDone, onCancel }: ConsultationFormProps): ReactNode {
  const { api } = useConsole();
  const action = useAction();
  const [outcome, setOutcome] = useState<'done' | 'did_not_proceed'>('done');
  const [note, setNote] = useState('');
  const body = closeConsultationBody.safeParse({ outcome, ...optionalNote(note) });
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    if (!body.success) return;
    action.run(async () => {
      await api.post(path(jobId, 'close'), body.data, consultationStepResponse);
      onDone(
        outcome === 'done' ? 'Marked as done. The owner is asked to close it.' : 'Closed as did not proceed.',
      );
    });
  };
  return (
    <StepShell
      title="Close the consultation"
      action={action}
      submitLabel="Close"
      ready={body.success}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <label className="field">
        <span className="label">Outcome</span>
        <select
          value={outcome}
          onChange={(e) => {
            setOutcome(e.target.value === 'done' ? 'done' : 'did_not_proceed');
          }}
        >
          <option value="done">Done</option>
          <option value="did_not_proceed">Did not proceed</option>
        </select>
      </label>
      <NoteField
        label={outcome === 'done' ? 'Note for the owner (optional)' : 'Reason the owner will see'}
        value={note}
        required={outcome === 'did_not_proceed'}
        onChange={setNote}
      />
    </StepShell>
  );
}

/** The owner's name, email and mobile: shared with consent; opened on request so each view is a deliberate one. */
export function OwnerContact({ jobId }: { jobId: string }): ReactNode {
  const { api } = useConsole();
  const action = useAction();
  const [contact, setContact] = useState<ConsultationContact | null>(null);
  if (contact !== null) {
    return (
      <p>
        {contact.name ?? 'Name not on file'} · {contact.phone ?? 'No mobile on file'} ·{' '}
        {contact.email ?? 'No email on file'}
      </p>
    );
  }
  return (
    <>
      <button
        type="button"
        className="btn btn-outline"
        disabled={action.busy}
        onClick={() => {
          action.run(async () => {
            setContact(await api.get(path(jobId, 'contact'), consultationContactResponse));
          });
        }}
      >
        Show contact details
      </button>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </>
  );
}
