/**
 * The home guide for one place (ADR 0025): short sections residents read in the app (air conditioning, water,
 * waste, parking, access, amenities). A building's own section replaces the project-wide one; without its own,
 * residents see the project's text, which is shown here so JAD+ Admin knows what is live.
 */
import { adminGuideResponse, guideSectionBody, type AdminGuide, type Place } from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { ApiError, apiPath, withQuery } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { GUIDE_SECTION_LABELS } from '../../lib/labels';
import { createdResponse, removedResponse } from '../../lib/platform-schemas';
import { guideRows, type GuideRow } from '../../lib/platform';
import { ConfirmButton, useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Loaded, Notice, Section, Tag } from '../../ui/parts';

type Sec = AdminGuide['sections'][number];

function Editor({
  place,
  row,
  onSaved,
  onCancel,
}: {
  place: Place;
  row: GuideRow<Sec>;
  onSaved: () => void;
  onCancel: () => void;
}): ReactNode {
  const { api } = useConsole();
  const start = row.own ?? row.inherited;
  const [title, setTitle] = useState(start?.title ?? GUIDE_SECTION_LABELS[row.section]);
  const [body, setBody] = useState(start?.body ?? '');
  const action = useAction();
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      const parsed = guideSectionBody.safeParse({ ...place, section: row.section, title, body });
      if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? 'Check the text.', 400);
      await api.put('/api/admin/guide', parsed.data, createdResponse);
      onSaved();
    });
  };
  return (
    <form className="stack" onSubmit={save}>
      <label className="field">
        <span className="label">Title</span>
        <input
          value={title}
          required
          maxLength={80}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </label>
      <label className="field">
        <span className="label">Text residents read</span>
        <textarea
          value={body}
          rows={6}
          required
          maxLength={2000}
          onChange={(e) => {
            setBody(e.target.value);
          }}
        />
      </label>
      <p className="hint">Plain text only, up to 2,000 characters.</p>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Saving…' : 'Save section'}
        </button>
        <button type="button" className="btn btn-outline" disabled={action.busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SectionCard({
  place,
  row,
  editable,
  onChanged,
}: {
  place: Place;
  row: GuideRow<Sec>;
  editable: boolean;
  onChanged: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [editing, setEditing] = useState(false);
  const shown = row.own ?? row.inherited;
  return (
    <article className="guide-section">
      <header className="section-head">
        <h3 className="label">{GUIDE_SECTION_LABELS[row.section]}</h3>
        {row.own !== null ? (
          <Tag tone="good">Written for this place</Tag>
        ) : row.inherited !== null ? (
          <Tag tone="calm">From the whole project</Tag>
        ) : (
          <Tag tone="warn">Not written</Tag>
        )}
      </header>
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
                <strong>{shown.title}</strong>
              </p>
              <p className="prewrap">{shown.body}</p>
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
                {row.own === null ? (row.inherited === null ? 'Write' : 'Write for this building') : 'Edit'}
              </button>
              {row.own === null ? null : (
                <ConfirmButton
                  label="Delete"
                  question={
                    row.inherited === null && place.building !== null
                      ? 'Delete this section? Residents will no longer see it.'
                      : 'Delete this section? Residents see the project-wide text instead, if there is one.'
                  }
                  onConfirm={async () => {
                    const id = row.own?.id;
                    if (id === undefined) return;
                    await api.delete(apiPath('admin', 'guide', id), removedResponse);
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

export function Guide({ place, editable }: { place: Place; editable: boolean }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/admin/guide', { project: place.project }), adminGuideResponse),
    `guide:${place.project}`,
  );
  return (
    <Loaded state={state} reload={reload}>
      {({ sections }) => {
        const rows = guideRows(sections, place);
        return (
          <Section title="Home guide" count={rows.filter((r) => r.own !== null).length}>
            <div className="guide-grid">
              {rows.map((row) => (
                <SectionCard
                  key={row.section}
                  place={place}
                  row={row}
                  editable={editable}
                  onChanged={reload}
                />
              ))}
            </div>
          </Section>
        );
      }}
    </Loaded>
  );
}
