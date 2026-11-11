/**
 * The tenant of a managed unit (ADR 0034; R2, O4, U4, U5): the managing team invites, extends and ends the
 * tenancy with the owner's rules (ADR 0021). The tenant's contact is shown masked (C-PD-1); the tenant signs in
 * with a code sent to the email or mobile given here.
 */
import {
  dubaiDate,
  extendTenancyBody,
  inviteTenantBody,
  type OfficeManagedUnitDetail,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { z } from 'zod';
import { apiPath } from '../../lib/api';
import { dayText } from '../../lib/format';
import { TENANT_LABELS } from '../../lib/managed';
import { ConfirmButton, useAction } from '../../ui/actions';
import { useConsole, useNow } from '../../ui/hooks';
import { Empty, Fact, Notice, Section, Tag } from '../../ui/parts';

type Tenancy = NonNullable<OfficeManagedUnitDetail['tenancy']>;

const changed = z.object({ id: z.string(), status: z.string() });

function Field({
  label,
  type = 'text',
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
}): ReactNode {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

function Invite({ unit, onDone }: { unit: OfficeManagedUnitDetail['unit']; onDone: () => void }): ReactNode {
  const { api } = useConsole();
  const today = dubaiDate(useNow());
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const who = contact.includes('@') ? { email: contact } : { phone: contact };
    const body = inviteTenantBody.safeParse({ sfUnitId: unit.sfUnitId, name, startsOn, endsOn, ...who });
    if (!body.success) {
      setProblem('Give the tenant’s name, an email or mobile number, and the dates.');
      return;
    }
    setProblem(null);
    action.run(async () => {
      await api.post(apiPath('partner', 'managed-units', unit.id, 'tenancies'), body.data, changed);
      onDone();
    });
  };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Tenant’s name" value={name} onChange={setName} />
        <Field label="Email or mobile" value={contact} onChange={setContact} />
        <Field label="First day" type="date" value={startsOn} onChange={setStartsOn} />
        <Field label="Last day" type="date" value={endsOn} onChange={setEndsOn} />
      </div>
      <p className="hint">The tenant signs in to the JAD+ app with a code sent to this email or mobile.</p>
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Sending…' : 'Invite the tenant'}
        </button>
      </div>
    </form>
  );
}

function Extend({ path, t, onDone }: { path: string; t: Tenancy; onDone: () => void }): ReactNode {
  const { api } = useConsole();
  const [endsOn, setEndsOn] = useState(t.endsOn);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = extendTenancyBody.safeParse({ endsOn });
    if (!body.success) return;
    action.run(async () => {
      await api.post(`${path}/extend`, body.data, changed);
      onDone();
    });
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <Field label="New last day" type="date" value={endsOn} onChange={setEndsOn} />
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <button type="submit" className="btn" disabled={action.busy || endsOn <= t.endsOn}>
        {action.busy ? 'Saving…' : 'Extend'}
      </button>
    </form>
  );
}

export function TenancyCard({
  d,
  onChanged,
}: {
  d: OfficeManagedUnitDetail;
  onChanged: (m: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const t = d.tenancy;
  const live = t !== null && (t.status === 'invited' || t.status === 'active');
  const path = t === null ? '' : apiPath('partner', 'managed-units', d.unit.id, 'tenancies', t.id);
  return (
    <Section title="Tenant">
      {t === null ? <Empty>No tenant yet.</Empty> : null}
      {t === null ? null : (
        <dl className="facts">
          <Fact label="Name">{t.tenantName}</Fact>
          <Fact label="Contact">{t.contact}</Fact>
          <Fact label="Dates">
            {dayText(t.startsOn)} – {dayText(t.endsOn)}
          </Fact>
          <Fact label="Status">
            <Tag tone={TENANT_LABELS[t.status][1]}>{TENANT_LABELS[t.status][0]}</Tag>
            {t.current ? <span className="hint"> {t.daysLeft} days left</span> : null}
          </Fact>
        </dl>
      )}
      {t !== null && t.status !== 'revoked' ? (
        <Extend
          path={path}
          t={t}
          onDone={() => {
            onChanged('The tenancy was extended.');
          }}
        />
      ) : null}
      {live ? (
        <ConfirmButton
          label="End the tenancy now"
          question="The tenant loses access to this residence at once and is told in the app."
          onConfirm={async () => {
            await api.post(`${path}/end`, {}, changed);
            onChanged('The tenancy was ended.');
          }}
        />
      ) : null}
      {live ? null : (
        <Invite
          unit={d.unit}
          onDone={() => {
            onChanged('The tenant was invited. They accept the invitation in the JAD+ app.');
          }}
        />
      )}
    </Section>
  );
}
