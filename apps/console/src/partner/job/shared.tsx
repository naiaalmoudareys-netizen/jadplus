/** Building blocks of the job step forms: the form frame with its buttons and errors, and the technician list. */
import type { PartnerTeam } from '@jadplus/shared';
import type { ReactNode, SyntheticEvent } from 'react';
import type { Action } from '../../ui/actions';
import { Notice } from '../../ui/parts';

export function StepShell({
  title,
  action,
  problem = null,
  submitLabel,
  ready,
  onSubmit,
  onCancel,
  children,
}: {
  title: string;
  action: Action;
  problem?: string | null;
  submitLabel: string;
  ready: boolean;
  onSubmit: (e: SyntheticEvent) => void;
  onCancel: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <form className="card stack step-form" onSubmit={onSubmit}>
      <h2 className="section-title">{title}</h2>
      <div className="form-grid">{children}</div>
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy || !ready}>
          {action.busy ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="btn btn-outline" disabled={action.busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** E17: only the company's active technicians can be sent. */
export function TechnicianPicker({
  team,
  value,
  onChange,
}: {
  team: PartnerTeam['technicians'];
  value: string;
  onChange: (id: string) => void;
}): ReactNode {
  return (
    <label className="field">
      <span className="label">Technician</span>
      <select
        value={value}
        required
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        <option value="">Choose…</option>
        {team.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** What every step form gets from the job page. */
export interface StepProps {
  readonly jobId: string;
  readonly team: PartnerTeam['technicians'];
  readonly now: number;
  readonly onDone: (message: string) => void;
  readonly onCancel: () => void;
}
