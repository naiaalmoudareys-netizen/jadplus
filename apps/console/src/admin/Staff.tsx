/**
 * JAD+ Admin "Staff" (ADR 0025): who works in the console as JAD+ Admin (may change things) or JAD+ viewer
 * (reads only). Adding someone lets them sign in with a one-time email code; removing them ends their access
 * and sessions at once, with the reason kept. Nobody can remove themselves or the last JAD+ Admin (the API
 * says so). JAD+ Admin only.
 */
import {
  STAFF_ROLES,
  adminAddStaffBody,
  adminAddStaffResponse,
  adminReasonBody,
  adminRemoveStaffResponse,
  adminStaffResponse,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import type { z } from 'zod';
import { ApiError, apiPath } from '../lib/api';
import { dateTime } from '../lib/format';
import { ACCOUNT_LABELS, ROLE_LABELS } from '../lib/labels';
import { useAction } from '../ui/actions';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Loaded, Notice, PageHeader, ReasonForm, Section, Tag } from '../ui/parts';
import { SortHeader, useSort } from '../ui/table';

type Member = z.infer<typeof adminStaffResponse>['staff'][number];
type Column = 'name' | 'email' | 'role' | 'grantedAt';
type StaffRole = (typeof STAFF_ROLES)[number];

function AddStaff({ onAdded }: { onAdded: (message: string) => void }): ReactNode {
  const { api } = useConsole();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('jad_viewer');
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      const body = adminAddStaffBody.safeParse({ name, email, role });
      if (!body.success)
        throw new ApiError(body.error.issues[0]?.message ?? 'Check the name and email.', 400);
      await api.post('/api/admin/staff', body.data, adminAddStaffResponse);
      setName('');
      setEmail('');
      onAdded(`${body.data.name} was added as ${ROLE_LABELS[body.data.role] ?? body.data.role}.`);
    });
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="section-title">Add a staff member</h2>
      <p className="hint">They sign in to the console with a one-time code sent to this email.</p>
      <div className="form-grid">
        <label className="field">
          <span className="label">Full name</span>
          <input
            value={name}
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Work email</span>
          <input
            type="email"
            value={email}
            required
            maxLength={254}
            autoComplete="off"
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Access</span>
          <select
            value={role}
            onChange={(e) => {
              setRole(STAFF_ROLES.find((r) => r === e.target.value) ?? 'jad_viewer');
            }}
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] ?? r}
              </option>
            ))}
          </select>
        </label>
      </div>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div>
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Adding…' : 'Add staff member'}
        </button>
      </div>
    </form>
  );
}

function MemberRow({ m, onRemoved }: { m: Member; onRemoved: (message: string) => void }): ReactNode {
  const { api } = useConsole();
  const [removing, setRemoving] = useState(false);
  const [statusText, tone] = ACCOUNT_LABELS[m.status];
  const remove = async (reason: string): Promise<void> => {
    const body = adminReasonBody.safeParse({ reason });
    if (!body.success) throw new ApiError('Give a reason of at least 3 characters.', 400);
    const done = await api.post(
      apiPath('admin', 'staff', m.userId, 'remove'),
      body.data,
      adminRemoveStaffResponse,
    );
    setRemoving(false);
    const sessions = done.sessionsEnded === 1 ? '1 session' : `${done.sessionsEnded} sessions`;
    onRemoved(`${m.name ?? 'The staff member'} was removed; ${sessions} ended.`);
  };
  return (
    <tr>
      <td>
        <strong>{m.name ?? '—'}</strong>
      </td>
      <td>{m.email ?? '—'}</td>
      <td>
        {ROLE_LABELS[m.role] ?? m.role}
        {m.status === 'active' ? null : <Tag tone={tone}>{statusText}</Tag>}
      </td>
      <td>{dateTime(m.grantedAt)}</td>
      <td>
        {removing ? (
          <ReasonForm
            label={`Why remove ${m.name ?? 'this person'}?`}
            submitLabel="Remove now"
            minLength={3}
            explain="Their console access and every session end at once."
            onSubmit={remove}
            onCancel={() => {
              setRemoving(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => {
              setRemoving(true);
            }}
          >
            Remove
          </button>
        )}
      </td>
    </tr>
  );
}

function Table({
  staff,
  onRemoved,
}: {
  staff: readonly Member[];
  onRemoved: (message: string) => void;
}): ReactNode {
  const sorted = useSort<Member, Column>(staff, { key: 'name', dir: 'asc' }, (m, k) => m[k]);
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Name" column="name" sorted={sorted} />
          <SortHeader label="Email" column="email" sorted={sorted} />
          <SortHeader label="Access" column="role" sorted={sorted} />
          <SortHeader label="Since" column="grantedAt" sorted={sorted} />
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((m) => (
          <MemberRow key={`${m.userId}:${m.role}`} m={m} onRemoved={onRemoved} />
        ))}
      </tbody>
    </table>
  );
}

export function Staff(): ReactNode {
  const { api } = useConsole();
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(() => api.get('/api/admin/staff', adminStaffResponse), 'staff');
  const changed = (message: string): void => {
    setDone(message);
    reload();
  };
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Staff" />
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      <Loaded state={state} reload={reload}>
        {({ staff }) => (
          <Section title="JAD+ staff" count={staff.length}>
            {staff.length === 0 ? (
              <Empty>No staff accounts.</Empty>
            ) : (
              <Table staff={staff} onRemoved={changed} />
            )}
          </Section>
        )}
      </Loaded>
      <AddStaff onAdded={changed} />
    </>
  );
}
