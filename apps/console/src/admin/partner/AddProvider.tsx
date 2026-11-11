/**
 * "Add a provider company" (ADR 0030; S10, P6): JAD+ Admin adds an outside partner or a JAD Global team with the
 * person who runs its office. That person signs in to the partner office with a code sent to their email, adds
 * the team and uploads the trade licence and insurance. The company starts suspended until JAD+ verifies them.
 */
import {
  PROVIDER_KINDS,
  SERVICES,
  addProviderBody,
  providerAddedResponse,
  type ProviderKind,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { ApiError } from '../../lib/api';
import { PROVIDER_KIND_LABELS } from '../../lib/providers';
import { useAction } from '../../ui/actions';
import { useConsole } from '../../ui/hooks';
import { Notice } from '../../ui/parts';

const IN_HOUSE = SERVICES.filter((s) => s.delivery === 'inhouse')
  .map((s) => s.name.toLowerCase())
  .join(', ');

export function AddProvider({ onAdded }: { onAdded: (message: string) => void }): ReactNode {
  const { api } = useConsole();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProviderKind>('external');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const action = useAction();
  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        Add a provider company
      </button>
    );
  }
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      const body = addProviderBody.safeParse({ name, kind, adminName, adminEmail });
      if (!body.success) {
        throw new ApiError(body.error.issues[0]?.message ?? 'Check the details.', 400);
      }
      await api.post('/api/admin/partners', body.data, providerAddedResponse);
      setOpen(false);
      onAdded(
        `${body.data.name} was added. It gets jobs once its trade licence and insurance are uploaded and verified.`,
      );
    });
  };
  return (
    <form className="inline-form card" onSubmit={save}>
      <label className="field">
        <span className="label">Company name</span>
        <input
          value={name}
          maxLength={120}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </label>
      <label className="field">
        <span className="label">Kind</span>
        <select
          value={kind}
          onChange={(e) => {
            const next = PROVIDER_KINDS.find((k) => k === e.target.value);
            if (next !== undefined) setKind(next);
          }}
        >
          {PROVIDER_KINDS.map((k) => (
            <option key={k} value={k}>
              {PROVIDER_KIND_LABELS[k].label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Office administrator’s name</span>
        <input
          value={adminName}
          maxLength={80}
          onChange={(e) => {
            setAdminName(e.target.value);
          }}
        />
      </label>
      <label className="field">
        <span className="label">Office administrator’s email</span>
        <input
          type="email"
          value={adminEmail}
          maxLength={254}
          onChange={(e) => {
            setAdminEmail(e.target.value);
          }}
        />
      </label>
      <p className="hint">
        A JAD Global team delivers the in-house services ({IN_HOUSE}); an outside partner delivers the others.
        The company starts suspended until its documents are verified.
      </p>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Adding…' : 'Add the company'}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={action.busy}
          onClick={() => {
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
