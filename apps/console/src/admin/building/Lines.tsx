/**
 * Resident help lines for one place (E12; ADR 0029): the building's security desk and building management, the
 * two numbers residents can call from the app (noise, parking, lifts, shared pipes). A building's own line
 * replaces the project-wide one; without its own, residents call the project's, which is shown here so JAD+ Admin
 * knows what is live. JAD+ Admin sets, changes and removes (audited, without the number); a viewer only reads.
 */
import {
  LINE_HOURS_MAX,
  adminBuildingLinesResponse,
  buildingLineBody,
  type AdminBuildingLines,
  type Place,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { ApiError, apiPath, withQuery } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { BUILDING_LINE_LABELS } from '../../lib/labels';
import { lineRows, type LineRow } from '../../lib/platform';
import { createdResponse, removedResponse } from '../../lib/platform-schemas';
import { ConfirmButton, useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Loaded, Notice, Section, Tag } from '../../ui/parts';

type Line = AdminBuildingLines['lines'][number];

function Editor({
  place,
  row,
  onSaved,
  onCancel,
}: {
  place: Place;
  row: LineRow<Line>;
  onSaved: () => void;
  onCancel: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [phone, setPhone] = useState(row.own?.phone ?? '');
  const [hours, setHours] = useState(row.own?.hours ?? '');
  const action = useAction();
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      const parsed = buildingLineBody.safeParse({
        ...place,
        kind: row.kind,
        phone,
        hours: hours.trim() === '' ? null : hours,
      });
      if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? 'Check the line.', 400);
      await api.put('/api/admin/building-lines', parsed.data, createdResponse);
      onSaved();
    });
  };
  return (
    <form className="stack" onSubmit={save}>
      <div className="form-grid">
        <label className="field">
          <span className="label">Phone number</span>
          <input
            type="tel"
            value={phone}
            required
            maxLength={25}
            autoComplete="off"
            placeholder="+971 4 000 0000"
            onChange={(e) => {
              setPhone(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Hours (optional)</span>
          <input
            value={hours}
            maxLength={LINE_HOURS_MAX}
            placeholder="24/7"
            onChange={(e) => {
              setHours(e.target.value);
            }}
          />
        </label>
      </div>
      <p className="hint">
        Residents tap to call this number from the app. Plain text hours, up to 60 characters.
      </p>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy || phone.trim() === ''}>
          {action.busy ? 'Saving…' : 'Save number'}
        </button>
        <button type="button" className="btn btn-outline" disabled={action.busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LineCard({
  place,
  row,
  editable,
  onChanged,
}: {
  place: Place;
  row: LineRow<Line>;
  editable: boolean;
  onChanged: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [editing, setEditing] = useState(false);
  const shown = row.own ?? row.inherited;
  const label = BUILDING_LINE_LABELS[row.kind];
  return (
    <article className="guide-section">
      <header className="section-head">
        <h3 className="label">{label.name}</h3>
        {row.own !== null ? (
          <Tag tone="good">Set for this place</Tag>
        ) : row.inherited !== null ? (
          <Tag tone="calm">From the whole project</Tag>
        ) : (
          <Tag tone="warn">Not set</Tag>
        )}
      </header>
      <p className="hint">{label.scope}</p>
      {editing ? (
        <Editor
          place={place}
          row={row}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      ) : (
        <>
          {shown === null ? null : (
            <>
              <p>
                <strong>{shown.phone}</strong>
                {shown.hours === null ? null : <span className="block muted">{shown.hours}</span>}
              </p>
              <p className="hint">Updated {dateTime(shown.updatedAt)}</p>
            </>
          )}
          {editable ? (
            <div className="row-actions">
              <button
                type="button"
                className="btn btn-outline btn-small"
                onClick={() => {
                  setEditing(true);
                }}
              >
                {row.own === null
                  ? row.inherited === null
                    ? 'Set number'
                    : 'Set for this building'
                  : 'Change'}
              </button>
              {row.own === null ? null : (
                <ConfirmButton
                  label="Remove"
                  question={
                    place.building === null
                      ? `Remove the ${label.name.toLowerCase()} number? Buildings without their own number will show none.`
                      : `Remove this building's ${label.name.toLowerCase()} number? Residents see the project-wide number instead, if there is one.`
                  }
                  onConfirm={async () => {
                    const id = row.own?.id;
                    if (id === undefined) return;
                    await api.delete(apiPath('admin', 'building-lines', id), removedResponse);
                    onChanged();
                  }}
                />
              )}
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

export function Lines({ place, editable }: { place: Place; editable: boolean }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () =>
      api.get(withQuery('/api/admin/building-lines', { project: place.project }), adminBuildingLinesResponse),
    `lines:${place.project}`,
  );
  return (
    <Loaded state={state} reload={reload}>
      {({ lines }) => {
        const rows = lineRows(lines, place);
        return (
          <Section title="Resident help lines" count={rows.filter((r) => r.own !== null).length}>
            <p className="hint">
              Residents call these numbers from the app about problems outside their home: noise, parking,
              common areas, lifts, shared pipes.
            </p>
            <div className="guide-grid">
              {rows.map((row) => (
                <LineCard key={row.kind} place={place} row={row} editable={editable} onChanged={reload} />
              ))}
            </div>
          </Section>
        );
      }}
    </Loaded>
  );
}
