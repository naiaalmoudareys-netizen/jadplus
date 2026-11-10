/** Small building blocks used by every console page (docs/DESIGN.md: calm, cream, slate, bronze). */
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { errorMessage } from '../lib/api';
import { STATUS_LABELS, statusTone, type Tone } from '../lib/format';
import { formatRoute, type Route } from '../lib/router';
import type { Status } from '@jadplus/shared';
import type { Load } from './hooks';

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="title">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export function Tag({ tone, children }: { tone: Tone; children: ReactNode }): ReactNode {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function StatusTag({ status }: { status: Status }): ReactNode {
  return <Tag tone={statusTone(status)}>{STATUS_LABELS[status]}</Tag>;
}

export function Link({ to, children }: { to: Route; children: ReactNode }): ReactNode {
  return <a href={formatRoute(to)}>{children}</a>;
}

export function Notice({ tone, children }: { tone: Tone; children: ReactNode }): ReactNode {
  return (
    <p className={`notice notice-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

/** Loading, error (with "Try again") or the page itself. */
export function Loaded<T>({
  state,
  reload,
  children,
}: {
  state: Load<T>;
  reload: () => void;
  children: (data: T) => ReactNode;
}): ReactNode {
  if (state.status === 'loading') return <p className="muted">Loading…</p>;
  if (state.status === 'error') {
    return (
      <div className="card">
        <Notice tone="bad">{state.message}</Notice>
        <button type="button" className="btn btn-outline" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }
  return children(state.data);
}

/**
 * A small inline form asking for a reason (or note) before a change: suspend, reinstate, remove, resolve.
 * The change runs on submit; its error is shown in place.
 */
export function ReasonForm({
  label,
  submitLabel,
  minLength,
  explain,
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  minLength: number;
  explain?: string;
  onSubmit: (reason: string) => Promise<void>;
  onCancel: () => void;
}): ReactNode {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = reason.trim().length < minLength;
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    if (tooShort || busy) return;
    setBusy(true);
    setError(null);
    onSubmit(reason.trim()).then(
      () => {
        setBusy(false);
      },
      (err: unknown) => {
        setBusy(false);
        setError(errorMessage(err));
      },
    );
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      {explain === undefined ? null : <p className="hint">{explain}</p>}
      <label className="field">
        <span className="label">{label}</span>
        <textarea
          value={reason}
          maxLength={500}
          rows={2}
          required
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
      </label>
      {error === null ? null : <Notice tone="bad">{error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={tooShort || busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
