/**
 * JAD+ Admin "Services" (ADR 0025; S1-S4): every service in its group, who takes a new request now (a partner,
 * the JAD+ team, or "coming soon"), whether owners see it in the app, its primary and backup partner, and its
 * service-level targets. JAD+ Admin changes the listing and the partners; a viewer only reads.
 */
import {
  SERVICE_GROUPS,
  adminPartnersResponse,
  adminServicesResponse,
  servicePartnersBody,
  type AdminServices,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { ApiError, apiPath } from '../lib/api';
import { minutesText } from '../lib/format';
import { SLA_METRIC_LABELS } from '../lib/labels';
import { serviceListedResponse, servicePartnersResponse } from '../lib/platform-schemas';
import { canChange } from '../lib/session';
import { ConfirmButton, useAction } from '../ui/actions';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';

type Service = AdminServices['services'][number];
type PartnerRef = NonNullable<Service['primary']>;
interface PartnerChoice {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'suspended' | 'ended';
}

const ROUTING = {
  partner: { tone: 'good', label: 'Goes to the partner' },
  jad: { tone: 'calm', label: 'Handled by the JAD+ team' },
  coming_soon: { tone: 'warn', label: 'Coming soon' },
} as const;

function partnerText(p: PartnerRef | null): ReactNode {
  if (p === null) return <span className="muted">None</span>;
  return (
    <>
      {p.name}
      {p.status === 'active' ? null : (
        <Tag tone="bad">{p.status === 'suspended' ? 'Suspended' : 'Ended'}</Tag>
      )}
    </>
  );
}

function PartnerPicker({
  label,
  value,
  partners,
  onChange,
}: {
  label: string;
  value: string;
  partners: readonly PartnerChoice[];
  onChange: (id: string) => void;
}): ReactNode {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        <option value="">None</option>
        {partners.map((p) => (
          <option key={p.id} value={p.id} disabled={p.status !== 'active'}>
            {p.name}
            {p.status === 'active' ? '' : ` (${p.status})`}
          </option>
        ))}
      </select>
    </label>
  );
}

function PartnersForm({
  service,
  partners,
  onSaved,
  onCancel,
}: {
  service: Service;
  partners: readonly PartnerChoice[];
  onSaved: (message: string) => void;
  onCancel: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [primary, setPrimary] = useState(service.primary?.id ?? '');
  const [backup, setBackup] = useState(service.backup?.id ?? '');
  const action = useAction();
  // A suspended partner already in place still shows, so the choice is never silently blank.
  const choices = [...partners];
  for (const p of [service.primary, service.backup]) {
    if (p !== null && !choices.some((c) => c.id === p.id)) choices.push(p);
  }
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      const body = servicePartnersBody.safeParse({
        primaryId: primary === '' ? null : primary,
        backupId: backup === '' ? null : backup,
      });
      if (!body.success) {
        throw new ApiError(body.error.issues[0]?.message ?? 'Check the partners.', 400);
      }
      await api.post(
        apiPath('admin', 'services', service.code, 'partners'),
        body.data,
        servicePartnersResponse,
      );
      onSaved(`${service.name}: partners saved.`);
    });
  };
  return (
    <form className="inline-form" onSubmit={save}>
      <PartnerPicker label="Primary" value={primary} partners={choices} onChange={setPrimary} />
      <PartnerPicker label="Backup" value={backup} partners={choices} onChange={setBackup} />
      <p className="hint">Only active partners can be chosen. Jobs already sent stay where they are.</p>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-outline" disabled={action.busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ListedSwitch({
  service,
  onSaved,
}: {
  service: Service;
  onSaved: (message: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const action = useAction();
  const setListed = async (listed: boolean): Promise<void> => {
    await api.post(apiPath('admin', 'services', service.code, 'listed'), { listed }, serviceListedResponse);
    onSaved(`${service.name} is now ${listed ? 'shown to owners' : 'hidden from owners'}.`);
  };
  if (service.listed) {
    return (
      <ConfirmButton
        label="Hide from owners"
        question={`Hide ${service.name}? Owners can no longer request it; open requests continue.`}
        confirmLabel="Hide"
        onConfirm={() => setListed(false)}
      />
    );
  }
  return (
    <span className="file-button">
      <button
        type="button"
        className="btn btn-outline"
        disabled={action.busy}
        onClick={() => {
          action.run(() => setListed(true));
        }}
      >
        {action.busy ? 'Saving…' : 'Show to owners'}
      </button>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </span>
  );
}

function ServiceRow({
  service,
  partners,
  editable,
  onSaved,
}: {
  service: Service;
  partners: readonly PartnerChoice[];
  editable: boolean;
  onSaved: (message: string) => void;
}): ReactNode {
  const [editing, setEditing] = useState(false);
  const routing = ROUTING[service.routing];
  return (
    <tr>
      <td>
        <strong>{service.name}</strong>
        <span className="block hint">
          {service.delivery === 'partner' ? 'By a partner' : 'By the JAD+ team'}
        </span>
      </td>
      <td>
        <Tag tone={routing.tone}>{routing.label}</Tag>
        {service.listed ? null : <Tag tone="calm">Hidden from owners</Tag>}
      </td>
      <td>
        {service.delivery === 'inhouse' ? (
          <span className="muted">JAD+ team</span>
        ) : editing ? (
          <PartnersForm
            service={service}
            partners={partners}
            onSaved={(m) => {
              setEditing(false);
              onSaved(m);
            }}
            onCancel={() => {
              setEditing(false);
            }}
          />
        ) : (
          <dl className="mini-facts">
            <dt>Primary</dt>
            <dd>{partnerText(service.primary)}</dd>
            <dt>Backup</dt>
            <dd>{partnerText(service.backup)}</dd>
          </dl>
        )}
      </td>
      <td>
        {service.sla.length === 0 ? (
          <span className="muted">{service.plannedSla ?? 'No targets yet'}</span>
        ) : (
          <ul className="plain">
            {service.sla.map((t) => (
              <li key={t.metric}>
                {SLA_METRIC_LABELS[t.metric]}: {minutesText(t.minutes)}
                <span className="hint">{t.clock === '24x7' ? ' (round the clock)' : ' (working hours)'}</span>
              </li>
            ))}
          </ul>
        )}
      </td>
      {editable ? (
        <td>
          <div className="row-actions">
            {service.delivery === 'partner' && !editing ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setEditing(true);
                }}
              >
                Change partners
              </button>
            ) : null}
            <ListedSwitch service={service} onSaved={onSaved} />
          </div>
        </td>
      ) : null}
    </tr>
  );
}

export function Services(): ReactNode {
  const { api, session } = useConsole();
  const editable = canChange(session.role);
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(
    () =>
      Promise.all([
        api.get('/api/admin/services', adminServicesResponse),
        api.get('/api/admin/partners', adminPartnersResponse),
      ]),
    'services',
  );
  const saved = (message: string): void => {
    setDone(message);
    reload();
  };
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Services" />
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      <Loaded state={state} reload={reload}>
        {([{ services }, { partners }]) => {
          const choices = partners.map((p) => ({ id: p.id, name: p.name, status: p.status }));
          return SERVICE_GROUPS.map((group) => {
            const inGroup = services.filter((s) => s.group === group);
            return (
              <Section key={group} title={group} count={inGroup.length}>
                {inGroup.length === 0 ? (
                  <Empty>No services in this group.</Empty>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Service</th>
                        <th scope="col">New requests</th>
                        <th scope="col">Partners</th>
                        <th scope="col">Targets</th>
                        {editable ? <th scope="col">Change</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {inGroup.map((s) => (
                        <ServiceRow
                          key={s.code}
                          service={s}
                          partners={choices}
                          editable={editable}
                          onSaved={saved}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
            );
          });
        }}
      </Loaded>
    </>
  );
}
