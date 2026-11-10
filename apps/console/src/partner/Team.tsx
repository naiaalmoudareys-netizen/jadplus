/**
 * The partner office's team (ADR 0023; E4, E17): its active technicians, adding one by name and email or mobile
 * (they then sign in to the JAD+ app with a code), and removing one with a reason. Removal is immediate: their
 * access to this company's jobs and their sessions end at once. Each name opens the technician's page (skills,
 * time away, visits).
 */
import { addTechnicianBody, partnerTeamResponse, removeTechnicianBody } from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { ApiError, apiPath, errorMessage } from '../lib/api';
import { technicianAddedResponse, technicianRemovedResponse } from '../lib/schemas';
import { useConsole, useLoad } from '../ui/hooks';
import { Link, Loaded, Notice, PageHeader, ReasonForm } from '../ui/parts';

function AddTechnician({ onAdded }: { onAdded: (name: string) => void }): ReactNode {
  const { api } = useConsole();
  const [name, setName] = useState('');
  const [by, setBy] = useState<'email' | 'phone'>('email');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = addTechnicianBody.safeParse({ name, [by]: contact });
    if (!body.success) {
      setError(body.error.issues[0]?.message ?? 'Check the name and contact.');
      return;
    }
    setBusy(true);
    setError(null);
    api.post('/api/partner/team', body.data, technicianAddedResponse).then(
      () => {
        setBusy(false);
        setName('');
        setContact('');
        onAdded(body.data.name);
      },
      (err: unknown) => {
        setBusy(false);
        setError(errorMessage(err));
      },
    );
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="section-title">Add a technician</h2>
      <p className="hint">They sign in to the JAD+ app with a one-time code sent to this email or mobile.</p>
      <div className="search">
        <label className="field grow">
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
          <span className="label">Sign in by</span>
          <select
            value={by}
            onChange={(e) => {
              setBy(e.target.value === 'phone' ? 'phone' : 'email');
              setContact('');
            }}
          >
            <option value="email">Email</option>
            <option value="phone">Mobile</option>
          </select>
        </label>
        <label className="field grow">
          <span className="label">{by === 'email' ? 'Email' : 'Mobile number'}</span>
          <input
            type={by === 'email' ? 'email' : 'tel'}
            value={contact}
            required
            maxLength={by === 'email' ? 254 : 25}
            autoComplete="off"
            onChange={(e) => {
              setContact(e.target.value);
            }}
          />
        </label>
      </div>
      {error === null ? null : <Notice tone="bad">{error}</Notice>}
      <div>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Adding…' : 'Add technician'}
        </button>
      </div>
    </form>
  );
}

function Member({
  id,
  name,
  onRemoved,
}: {
  id: string;
  name: string;
  onRemoved: (name: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const [removing, setRemoving] = useState(false);
  const remove = async (reason: string): Promise<void> => {
    const body = removeTechnicianBody.safeParse({ reason });
    if (!body.success) throw new ApiError('Give a reason of at least 3 characters.', 400);
    await api.post(apiPath('partner', 'team', id, 'remove'), body.data, technicianRemovedResponse);
    onRemoved(name);
  };
  return (
    <li className="member">
      <span className="member-name">
        <Link to={{ name: 'technician', id }}>{name}</Link>
      </span>
      {removing ? (
        <ReasonForm
          label={`Why remove ${name}?`}
          submitLabel="Remove now"
          minLength={3}
          explain="They lose access at once: they are signed out, can no longer see your jobs and cannot be sent to any job."
          onSubmit={remove}
          onCancel={() => {
            setRemoving(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setRemoving(true);
          }}
        >
          Remove
        </button>
      )}
    </li>
  );
}

export function Team(): ReactNode {
  const { api } = useConsole();
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(() => api.get('/api/partner/team', partnerTeamResponse), 'team');
  return (
    <>
      <PageHeader eyebrow="Partner office" title="Team" />
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      <Loaded state={state} reload={reload}>
        {({ partner, technicians }) => (
          <section className="card">
            <h2 className="section-title">
              {partner?.name ?? 'Your company'} <span className="count">{technicians.length}</span>
            </h2>
            {partner !== null && partner.status !== 'active' ? (
              <Notice tone="warn">
                Your company is {partner.status} with JAD+: it receives no new jobs.
              </Notice>
            ) : null}
            {technicians.length === 0 ? (
              <p className="muted">No technicians yet.</p>
            ) : (
              <ul className="members">
                {technicians.map((t) => (
                  <Member
                    key={t.id}
                    id={t.id}
                    name={t.name}
                    onRemoved={(name) => {
                      setDone(`${name} was removed and signed out.`);
                      reload();
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </Loaded>
      <AddTechnician
        onAdded={(name) => {
          setDone(`${name} was added. They can now sign in to the JAD+ app.`);
          reload();
        }}
      />
    </>
  );
}
