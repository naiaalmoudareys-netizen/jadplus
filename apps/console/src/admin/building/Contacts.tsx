/**
 * Building management contacts for one place (ADR 0025; E12): who JAD+ calls about the building (a lift, a
 * shared pipe). A name, a role and a phone and/or email; a few per place, not an address book. Viewing them is
 * audited by the API (personal data). JAD+ Admin adds and removes; a viewer only reads.
 */
import {
  BUILDING_CONTACTS_MAX,
  buildingContactBody,
  buildingContactsResponse,
  type BuildingContacts,
  type Place,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { ApiError, apiPath, withQuery } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { createdResponse, removedResponse } from '../../lib/platform-schemas';
import { exactlyAt } from '../../lib/platform';
import { ConfirmButton, useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Empty, Loaded, Notice, Section } from '../../ui/parts';

type Contact = BuildingContacts['contacts'][number];

function AddContact({ place, onAdded }: { place: Place; onAdded: () => void }): ReactNode {
  const { api } = useConsole();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      const body = buildingContactBody.safeParse({
        ...place,
        name,
        role: role.trim() === '' ? null : role,
        phone: phone.trim() === '' ? null : phone,
        email: email.trim() === '' ? null : email,
      });
      if (!body.success) throw new ApiError(body.error.issues[0]?.message ?? 'Check the contact.', 400);
      await api.post('/api/admin/building-contacts', body.data, createdResponse);
      setName('');
      setRole('');
      setPhone('');
      setEmail('');
      onAdded();
    });
  };
  return (
    <form className="stack add-form" onSubmit={submit}>
      <h3 className="label">Add a contact</h3>
      <div className="form-grid">
        <label className="field">
          <span className="label">Name</span>
          <input
            value={name}
            required
            maxLength={80}
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Role (optional)</span>
          <input
            value={role}
            maxLength={60}
            placeholder="Facility manager"
            onChange={(e) => {
              setRole(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Phone</span>
          <input
            type="tel"
            value={phone}
            maxLength={25}
            autoComplete="off"
            onChange={(e) => {
              setPhone(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Email</span>
          <input
            type="email"
            value={email}
            maxLength={254}
            autoComplete="off"
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </label>
      </div>
      <p className="hint">Give a phone number, an email, or both.</p>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div>
        <button type="submit" className="btn" disabled={action.busy || name.trim() === ''}>
          {action.busy ? 'Adding…' : 'Add contact'}
        </button>
      </div>
    </form>
  );
}

function ContactRow({
  c,
  editable,
  onRemoved,
}: {
  c: Contact;
  editable: boolean;
  onRemoved: () => void;
}): ReactNode {
  const { api } = useConsole();
  return (
    <tr>
      <td>
        <strong>{c.name}</strong>
        {c.role === null ? null : <span className="block muted">{c.role}</span>}
      </td>
      <td>{c.phone ?? '—'}</td>
      <td>{c.email ?? '—'}</td>
      <td>{dateTime(c.createdAt)}</td>
      {editable ? (
        <td>
          <ConfirmButton
            label="Remove"
            question={`Remove ${c.name}? JAD+ will no longer have them on file for this place.`}
            onConfirm={async () => {
              await api.delete(apiPath('admin', 'building-contacts', c.id), removedResponse);
              onRemoved();
            }}
          />
        </td>
      ) : null}
    </tr>
  );
}

export function Contacts({ place, editable }: { place: Place; editable: boolean }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () =>
      api.get(
        withQuery('/api/admin/building-contacts', { project: place.project }),
        buildingContactsResponse,
      ),
    `contacts:${place.project}`,
  );
  return (
    <Loaded state={state} reload={reload}>
      {({ contacts: all }) => {
        const contacts = exactlyAt(all, place);
        return (
          <Section title="Building management contacts" count={contacts.length}>
            {contacts.length === 0 ? (
              <Empty>No contact on file for this place.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Email</th>
                    <th scope="col">Added</th>
                    {editable ? <th scope="col">Change</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <ContactRow key={c.id} c={c} editable={editable} onRemoved={reload} />
                  ))}
                </tbody>
              </table>
            )}
            {!editable ? null : contacts.length >= BUILDING_CONTACTS_MAX ? (
              <p className="hint">
                Up to {BUILDING_CONTACTS_MAX} contacts per place: remove one to add another.
              </p>
            ) : (
              <AddContact place={place} onAdded={reload} />
            )}
          </Section>
        );
      }}
    </Loaded>
  );
}
