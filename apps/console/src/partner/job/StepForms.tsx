/**
 * The office's steps on a job, done for its technicians through the same endpoints the app uses (ADR 0018,
 * 0025): acknowledge an emergency (E4: technician + arrival window), book the visit (30 minutes to 4 hours,
 * Dubai time), send a quote or a revised quote (L4, A2, A3), start the work and mark it finished.
 */
import {
  acknowledgeEmergencyBody,
  arrivalChoices,
  bookVisitBody,
  sendQuoteBody,
  workDoneBody,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { apiPath } from '../../lib/api';
import { dubaiInstant, today } from '../../lib/dates';
import { VISIT_LENGTHS } from '../../lib/job-steps';
import { acknowledgedResponse, jobStepResponse } from '../../lib/office-schemas';
import { useAction } from '../../ui/actions';
import { useConsole } from '../../ui/hooks';
import { StepShell, TechnicianPicker, type StepProps } from './shared';

export function Acknowledge({ jobId, team, now, onDone, onCancel }: StepProps): ReactNode {
  const { api } = useConsole();
  const choices = arrivalChoices(now);
  const [technicianId, setTechnicianId] = useState('');
  const [choice, setChoice] = useState(0);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const window = choices[choice];
    const body = acknowledgeEmergencyBody.safeParse({
      technicianId,
      arrivalWindowStart: window?.start,
      arrivalWindowEnd: window?.end,
    });
    if (!body.success) return;
    action.run(async () => {
      const r = await api.post(
        apiPath('partner', 'jobs', jobId, 'acknowledge'),
        body.data,
        acknowledgedResponse,
      );
      onDone(r.onTime ? 'Acknowledged in time.' : 'Acknowledged, after the 15-minute target.');
    });
  };
  return (
    <StepShell
      title="Acknowledge the emergency"
      action={action}
      submitLabel="Acknowledge"
      onSubmit={submit}
      onCancel={onCancel}
      ready={technicianId !== ''}
    >
      <TechnicianPicker team={team} value={technicianId} onChange={setTechnicianId} />
      <label className="field">
        <span className="label">Arrival</span>
        <select
          value={choice}
          onChange={(e) => {
            setChoice(Number(e.target.value));
          }}
        >
          {choices.map((c, i) => (
            <option key={c.label} value={i}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
    </StepShell>
  );
}

export function BookVisit({ jobId, team, now, onDone, onCancel }: StepProps): ReactNode {
  const { api } = useConsole();
  const [technicianId, setTechnicianId] = useState('');
  const [date, setDate] = useState(today(now));
  const [time, setTime] = useState('10:00');
  const [length, setLength] = useState(120);
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const start = dubaiInstant(date, time);
    const body = bookVisitBody.safeParse({
      technicianId,
      windowStart: start,
      windowEnd: start === null ? null : start + length * 60_000,
    });
    if (!body.success) {
      setProblem('Choose a technician, a day and a start time.');
      return;
    }
    setProblem(null);
    action.run(async () => {
      await api.post(apiPath('partner', 'jobs', jobId, 'visit'), body.data, jobStepResponse);
      onDone('The visit is booked; the resident sees the window and the technician.');
    });
  };
  return (
    <StepShell
      title="Book the visit"
      action={action}
      problem={problem}
      submitLabel="Book"
      onSubmit={submit}
      onCancel={onCancel}
      ready={technicianId !== ''}
    >
      <TechnicianPicker team={team} value={technicianId} onChange={setTechnicianId} />
      <label className="field">
        <span className="label">Day</span>
        <input
          type="date"
          value={date}
          min={today(now)}
          required
          onChange={(e) => {
            setDate(e.target.value);
          }}
        />
      </label>
      <label className="field">
        <span className="label">Start (Dubai time)</span>
        <input
          type="time"
          value={time}
          step={300}
          required
          onChange={(e) => {
            setTime(e.target.value);
          }}
        />
      </label>
      <label className="field">
        <span className="label">Length</span>
        <select
          value={length}
          onChange={(e) => {
            setLength(Number(e.target.value));
          }}
        >
          {VISIT_LENGTHS.map((l) => (
            <option key={l.minutes} value={l.minutes}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
    </StepShell>
  );
}

export function SendQuote({ jobId, onDone, onCancel, title }: StepProps & { title: string }): ReactNode {
  const { api } = useConsole();
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = sendQuoteBody.safeParse({ amountAed: Number(amount), scope });
    if (!body.success) {
      setProblem('Give the amount in AED (up to 2 decimals) and what the work covers.');
      return;
    }
    setProblem(null);
    action.run(async () => {
      await api.post(apiPath('partner', 'jobs', jobId, 'quote'), body.data, jobStepResponse);
      onDone('The quote is with the owner. It is valid for 14 days.');
    });
  };
  return (
    <StepShell
      title={title}
      action={action}
      problem={problem}
      submitLabel="Send quote"
      onSubmit={submit}
      onCancel={onCancel}
      ready={amount !== '' && scope.trim() !== ''}
    >
      <label className="field">
        <span className="label">Amount (AED)</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          required
          onChange={(e) => {
            setAmount(e.target.value);
          }}
        />
      </label>
      <label className="field wide">
        <span className="label">What the work covers</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={scope}
          required
          onChange={(e) => {
            setScope(e.target.value);
          }}
        />
      </label>
      <p className="hint wide">The owner decides; JAD+ never approves chargeable work (L4).</p>
    </StepShell>
  );
}

export function StartWork({ jobId, onDone, onCancel }: StepProps): ReactNode {
  const { api } = useConsole();
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      await api.post(apiPath('partner', 'jobs', jobId, 'start'), {}, jobStepResponse);
      onDone('The work has started.');
    });
  };
  return (
    <StepShell
      title="Start the work"
      action={action}
      submitLabel="Start now"
      onSubmit={submit}
      onCancel={onCancel}
      ready
    >
      <p className="wide">The technician is at the unit and starting the work.</p>
    </StepShell>
  );
}

export function WorkDone({ jobId, onDone, onCancel }: StepProps): ReactNode {
  const { api } = useConsole();
  const [note, setNote] = useState('');
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const text = note.trim();
    const body = workDoneBody.safeParse(text === '' ? {} : { note: text });
    if (!body.success) return;
    action.run(async () => {
      await api.post(apiPath('partner', 'jobs', jobId, 'done'), body.data, jobStepResponse);
      onDone('Marked as finished. The resident is asked to confirm.');
    });
  };
  return (
    <StepShell
      title="Work finished"
      action={action}
      submitLabel="Mark finished"
      onSubmit={submit}
      onCancel={onCancel}
      ready
    >
      <label className="field wide">
        <span className="label">Note to the resident (optional)</span>
        <textarea
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </label>
      <p className="hint wide">
        Add photos of the finished work on this page (or the technician adds them in the JAD+ app).
      </p>
    </StepShell>
  );
}
