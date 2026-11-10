/**
 * Raise a request on an owner's behalf (ADR 0025; U8, V3): for an owner who phoned or walked in. JAD+ Admin
 * chooses the owner's unit, the service, a preferred working day and time of day, and writes what is needed.
 * The request then follows the normal routing (partner, JAD+ team, or not offered yet), as if the owner had
 * raised it in the app.
 */
import {
  DEFAULT_CALENDAR,
  VISIT_SLOTS,
  adminRaiseBody,
  adminRaiseResponse,
  adminServicesResponse,
  dubaiDate,
  preferredDays,
  type VisitSlot,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { dayText } from '../../lib/format';
import { weekdayOf } from '../../lib/dates';
import { useAction } from '../../ui/actions';
import { useConsole, useLoad, useNow } from '../../ui/hooks';
import { Link, Loaded, Notice, Section } from '../../ui/parts';

interface Unit {
  readonly sfUnitId: string;
  readonly unitName: string;
  readonly project: string | null;
}

export function RaiseForOwner({
  ownerUserId,
  units,
}: {
  ownerUserId: string;
  units: readonly Unit[];
}): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const days = preferredDays(dubaiDate(now), DEFAULT_CALENDAR);
  const { state, reload } = useLoad(() => api.get('/api/admin/services', adminServicesResponse), 'services');
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState(units.length === 1 ? (units[0]?.sfUnitId ?? '') : '');
  const [service, setService] = useState('');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState<VisitSlot>('morning');
  const [description, setDescription] = useState('');
  const [raised, setRaised] = useState<{ id: string; ref: string; sentTo: string } | null>(null);
  const action = useAction();

  const body = adminRaiseBody.safeParse({
    ownerUserId,
    sfUnitId: unit,
    serviceCode: service,
    description,
    preferredDate: date,
    preferredSlot: slot,
  });
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    if (!body.success) return;
    action.run(async () => {
      const r = await api.post('/api/admin/requests', body.data, adminRaiseResponse);
      setRaised({ id: r.requestId, ref: r.ref, sentTo: r.sentTo });
      setOpen(false);
      setDescription('');
    });
  };

  return (
    <Section
      title="Raise a request for this owner"
      actions={
        open ? null : (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setOpen(true);
              setRaised(null);
            }}
          >
            Raise a request
          </button>
        )
      }
    >
      {raised === null ? null : (
        <Notice tone="good">
          <Link to={{ name: 'request', id: raised.id }}>Request {raised.ref}</Link> was raised and sent to{' '}
          {raised.sentTo}.
        </Notice>
      )}
      {!open ? (
        <p className="hint">
          For an owner who called or came to the office (U8). Emergencies go through the phone line.
        </p>
      ) : (
        <Loaded state={state} reload={reload}>
          {({ services }) => (
            <form className="stack" onSubmit={save}>
              <div className="form-grid">
                <label className="field">
                  <span className="label">Unit</span>
                  <select
                    value={unit}
                    onChange={(e) => {
                      setUnit(e.target.value);
                    }}
                  >
                    <option value="">Choose…</option>
                    {units.map((u) => (
                      <option key={u.sfUnitId} value={u.sfUnitId}>
                        {u.unitName}
                        {u.project === null ? '' : ` · ${u.project}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Service</span>
                  <select
                    value={service}
                    onChange={(e) => {
                      setService(e.target.value);
                    }}
                  >
                    <option value="">Choose…</option>
                    {services
                      .filter((s) => s.listed)
                      .map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                          {s.routing === 'coming_soon' ? ' (not offered yet)' : ''}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Preferred day</span>
                  <select
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                    }}
                  >
                    <option value="">Choose…</option>
                    {days.map((d) => (
                      <option key={d} value={d}>
                        {weekdayOf(d)} {dayText(d)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Time of day</span>
                  <select
                    value={slot}
                    onChange={(e) => {
                      setSlot(VISIT_SLOTS.find((s) => s.key === e.target.value)?.key ?? 'morning');
                    }}
                  >
                    {VISIT_SLOTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label} ({s.hours})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span className="label">What is needed (in the owner’s words)</span>
                <textarea
                  value={description}
                  rows={3}
                  maxLength={2000}
                  onChange={(e) => {
                    setDescription(e.target.value);
                  }}
                />
              </label>
              {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
              <div className="row-actions">
                <button type="submit" className="btn" disabled={action.busy || !body.success}>
                  {action.busy ? 'Raising…' : 'Raise the request'}
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
          )}
        </Loaded>
      )}
    </Section>
  );
}
