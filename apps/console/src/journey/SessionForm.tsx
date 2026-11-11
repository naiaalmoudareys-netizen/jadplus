/**
 * The investor education session form (O5; ADR 0033): title, description, Dubai date and times, in person (an
 * address) or online (an https joining link, shown to owners only once they hold a seat), and seats.
 */
import { SESSION_MODES, SESSION_SEATS_MAX, type EducationSessionBody } from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { MODE_LABELS, sessionBodyOf, type SessionForm } from '../lib/owner-journey';
import { useAction } from '../ui/actions';
import { Notice } from '../ui/parts';

export function SessionFormView({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: SessionForm;
  submitLabel: string;
  onSubmit: (body: EducationSessionBody) => Promise<void>;
  onCancel?: () => void;
}): ReactNode {
  const [form, setForm] = useState<SessionForm>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const set = (patch: Partial<SessionForm>): void => {
    setForm({ ...form, ...patch });
  };
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    const result = sessionBodyOf(form);
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    setProblem(null);
    action.run(() => onSubmit(result.body));
  };
  return (
    <form className="stack" onSubmit={save}>
      <div className="form-grid">
        <label className="field">
          <span className="label">Title</span>
          <input
            value={form.title}
            required
            maxLength={120}
            onChange={(e) => {
              set({ title: e.target.value });
            }}
          />
        </label>
        <label className="field">
          <span className="label">Seats</span>
          <input
            type="number"
            min={1}
            max={SESSION_SEATS_MAX}
            value={form.seats}
            required
            onChange={(e) => {
              set({ seats: e.target.value });
            }}
          />
        </label>
        <label className="field">
          <span className="label">Day (Dubai)</span>
          <input
            type="date"
            value={form.date}
            required
            onChange={(e) => {
              set({ date: e.target.value });
            }}
          />
        </label>
        <label className="field">
          <span className="label">From</span>
          <input
            type="time"
            value={form.from}
            required
            onChange={(e) => {
              set({ from: e.target.value });
            }}
          />
        </label>
        <label className="field">
          <span className="label">To</span>
          <input
            type="time"
            value={form.to}
            required
            onChange={(e) => {
              set({ to: e.target.value });
            }}
          />
        </label>
        <label className="field">
          <span className="label">Where</span>
          <select
            value={form.mode}
            onChange={(e) => {
              const mode = SESSION_MODES.find((m) => m === e.target.value);
              if (mode !== undefined) set({ mode });
            }}
          >
            {SESSION_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">{form.mode === 'online' ? 'Joining link (https://…)' : 'Address'}</span>
          <input
            value={form.place}
            required
            maxLength={300}
            onChange={(e) => {
              set({ place: e.target.value });
            }}
          />
        </label>
      </div>
      <label className="field">
        <span className="label">Description</span>
        <textarea
          value={form.description}
          required
          maxLength={2000}
          rows={4}
          onChange={(e) => {
            set({ description: e.target.value });
          }}
        />
      </label>
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel === undefined ? null : (
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </form>
  );
}
