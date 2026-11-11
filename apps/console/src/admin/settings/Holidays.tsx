/**
 * Public holidays (E20, S4; ADR 0028): the one setting JAD+ Admin changes here, because Islamic holiday dates
 * are only confirmed close to the day. Working-hour clocks and the days offered for visits skip these days.
 * JAD+ Admin adds and removes days after today; today and past days are shown read-only (clocks already
 * running and past figures stay fair). A viewer only reads. Every change is audited by the API.
 */
import {
  HOLIDAY_NAME_MAX,
  adminHolidaysResponse,
  holidayChangedResponse,
  type AdminHolidays,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { ApiError, apiPath } from '../../lib/api';
import { dayText } from '../../lib/format';
import { firstEditableDay, holidayToAdd, splitHolidays } from '../../lib/holidays';
import { ConfirmButton, useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Empty, Loaded, Notice, Section } from '../../ui/parts';

type Row = AdminHolidays['holidays'][number];

function AddHoliday({ data, onAdded }: { data: AdminHolidays; onAdded: () => void }): ReactNode {
  const { api } = useConsole();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      const checked = holidayToAdd({ date, name }, data.today, data.holidays);
      if ('problem' in checked) throw new ApiError(checked.problem, 400);
      await api.post('/api/admin/holidays', checked.body, holidayChangedResponse);
      setDate('');
      setName('');
      onAdded();
    });
  };
  return (
    <form className="stack add-form" onSubmit={submit}>
      <h3 className="label">Add a holiday</h3>
      <div className="form-grid">
        <label className="field">
          <span className="label">Day</span>
          <input
            type="date"
            value={date}
            required
            min={firstEditableDay(data.today)}
            onChange={(e) => {
              setDate(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Name</span>
          <input
            value={name}
            required
            maxLength={HOLIDAY_NAME_MAX}
            placeholder="Eid al-Fitr"
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
      </div>
      <p className="hint">Only days after today. Requests already on the clock keep their deadlines.</p>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div>
        <button type="submit" className="btn" disabled={action.busy || date === '' || name.trim() === ''}>
          {action.busy ? 'Adding…' : 'Add holiday'}
        </button>
      </div>
    </form>
  );
}

function HolidayRow({
  h,
  editable,
  onRemoved,
}: {
  h: Row;
  editable: boolean;
  onRemoved: () => void;
}): ReactNode {
  const { api } = useConsole();
  return (
    <tr>
      <td>{dayText(h.date)}</td>
      <td>{h.name}</td>
      {editable ? (
        <td>
          <ConfirmButton
            label="Remove"
            question={`Remove ${h.name} on ${dayText(h.date)}? It becomes a working day again.`}
            onConfirm={async () => {
              await api.delete(apiPath('admin', 'holidays', h.date), holidayChangedResponse);
              onRemoved();
            }}
          />
        </td>
      ) : null}
    </tr>
  );
}

function HolidayTable({
  rows,
  editable,
  onRemoved,
}: {
  rows: readonly Row[];
  editable: boolean;
  onRemoved: () => void;
}): ReactNode {
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Day</th>
          <th scope="col">Holiday</th>
          {editable ? <th scope="col">Change</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <HolidayRow key={h.date} h={h} editable={editable} onRemoved={onRemoved} />
        ))}
      </tbody>
    </table>
  );
}

export function Holidays({ editable }: { editable: boolean }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(() => api.get('/api/admin/holidays', adminHolidaysResponse), 'holidays');
  return (
    <Loaded state={state} reload={reload}>
      {(data) => {
        const { upcoming, past } = splitHolidays(data.holidays);
        return (
          <Section title="Public holidays" count={upcoming.length}>
            <p className="hint">
              The one exception to the fixed rules: JAD+ Admin keeps these days up to date when the official
              dates are announced. Working-hour clocks and the days offered for visits skip them.
            </p>
            {upcoming.length === 0 ? (
              <Empty>No holiday after today on file.</Empty>
            ) : (
              <HolidayTable rows={upcoming} editable={editable} onRemoved={reload} />
            )}
            {editable ? <AddHoliday data={data} onAdded={reload} /> : null}
            {past.length === 0 ? null : (
              <details>
                <summary>Today and earlier ({past.length}, cannot change)</summary>
                <HolidayTable rows={past} editable={false} onRemoved={reload} />
              </details>
            )}
          </Section>
        );
      }}
    </Loaded>
  );
}
