/**
 * The snag list of a snagging job (ADR 0032; O3): during the inspection the office lists each snag (what, where,
 * an optional photo) or removes one listed by mistake; after the report, the snagging provider or the JAD Global
 * handover team marks a snag fixed with a photo of the fix, and the owner confirms or reopens it in the app.
 * JAD+ Admin sees the same list read-only. What may be done comes from the API (canAdd, canFix).
 */
import {
  addSnagBody,
  snagChangedResponse,
  snagListResponse,
  type Snag,
  type SnagList,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { apiPath } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { PHOTO_TYPES } from '../../lib/photos';
import { SNAG_STATUS, snagPhotoProblem, snagPhotoUrl, snagSummary } from '../../lib/reports';
import { useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Loaded, Notice, Section, Tag } from '../../ui/parts';

/** Sends one photo file as the raw body of a snag step ('photo' or 'fix'). */
function PhotoStep({
  requestId,
  snagId,
  step,
  label,
  onDone,
}: {
  requestId: string;
  snagId: string;
  step: 'photo' | 'fix';
  label: string;
  onDone: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const p = snagPhotoProblem(file);
    setProblem(p);
    if (p !== null || file === null) return;
    action.run(async () => {
      await api.upload(
        apiPath('requests', requestId, 'snags', snagId, step),
        file,
        file.type,
        snagChangedResponse,
      );
      onDone();
    });
  };
  return (
    <form className="row-actions" onSubmit={submit}>
      <input
        type="file"
        aria-label={label}
        accept={PHOTO_TYPES.join(',')}
        disabled={action.busy}
        onChange={(e) => {
          setProblem(null);
          setFile(e.target.files?.[0] ?? null);
        }}
      />
      <button type="submit" className="btn btn-outline" disabled={action.busy || file === null}>
        {action.busy ? 'Sending…' : label}
      </button>
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </form>
  );
}

function SnagPhoto({
  requestId,
  snag,
  which,
}: {
  requestId: string;
  snag: Snag;
  which: 'snag' | 'fix';
}): ReactNode {
  const has = which === 'snag' ? snag.hasPhoto : snag.hasFixPhoto;
  if (!has) return null;
  const label = which === 'snag' ? 'Snag' : 'Fix';
  return (
    <a
      className="photo"
      href={snagPhotoUrl(requestId, snag.id, which)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <img
        src={snagPhotoUrl(requestId, snag.id, which)}
        alt={`${label} photo: ${snag.title}`}
        loading="lazy"
      />
    </a>
  );
}

/** One snag with its photos and the steps the office may take now. */
export function SnagRow({
  requestId,
  snag,
  list,
  context,
  onChanged,
}: {
  requestId: string;
  snag: Snag;
  list: Pick<SnagList, 'canAdd' | 'canFix'>;
  /** A line above the snag, e.g. which request and unit it is on (the "Snags to fix" list). */
  context?: string;
  onChanged: () => void;
}): ReactNode {
  const { api } = useConsole();
  const remove = useAction();
  const status = SNAG_STATUS[snag.status];
  return (
    <li className="stack">
      {context === undefined ? null : <p className="hint">{context}</p>}
      <div>
        <strong>{snag.title}</strong> <span className="muted">· {snag.room}</span>{' '}
        <Tag tone={status.tone}>{status.text}</Tag>
        {snag.reopenCount > 0 ? <span className="hint"> Reopened {snag.reopenCount}×</span> : null}
        {snag.fixedAt === null ? null : <span className="hint"> Fixed {dateTime(snag.fixedAt)}</span>}
      </div>
      <div className="photos">
        <SnagPhoto requestId={requestId} snag={snag} which="snag" />
        <SnagPhoto requestId={requestId} snag={snag} which="fix" />
      </div>
      {list.canAdd && !snag.hasPhoto ? (
        <PhotoStep requestId={requestId} snagId={snag.id} step="photo" label="Add photo" onDone={onChanged} />
      ) : null}
      {list.canAdd ? (
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-outline"
            disabled={remove.busy}
            onClick={() => {
              remove.run(async () => {
                await api.post(
                  apiPath('requests', requestId, 'snags', snag.id, 'remove'),
                  {},
                  snagChangedResponse,
                );
                onChanged();
              });
            }}
          >
            Remove (listed by mistake)
          </button>
          {remove.error === null ? null : <Notice tone="bad">{remove.error}</Notice>}
        </div>
      ) : null}
      {list.canFix && snag.status === 'open' ? (
        <PhotoStep
          requestId={requestId}
          snagId={snag.id}
          step="fix"
          label="Mark fixed with photo"
          onDone={onChanged}
        />
      ) : null}
    </li>
  );
}

function AddSnag({ requestId, onAdded }: { requestId: string; onAdded: () => void }): ReactNode {
  const { api } = useConsole();
  const [title, setTitle] = useState('');
  const [room, setRoom] = useState('');
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = addSnagBody.safeParse({ title, room });
    if (!body.success) return;
    action.run(async () => {
      await api.post(apiPath('requests', requestId, 'snags'), body.data, snagChangedResponse);
      setTitle('');
      setRoom('');
      onAdded();
    });
  };
  return (
    <form className="form-grid" onSubmit={submit}>
      <label className="field">
        <span className="label">Snag</span>
        <input
          value={title}
          maxLength={200}
          required
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </label>
      <label className="field">
        <span className="label">Room or place</span>
        <input
          value={room}
          maxLength={100}
          required
          onChange={(e) => {
            setRoom(e.target.value);
          }}
        />
      </label>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button
          type="submit"
          className="btn"
          disabled={action.busy || title.trim() === '' || room.trim() === ''}
        >
          {action.busy ? 'Adding…' : 'Add snag'}
        </button>
      </div>
    </form>
  );
}

/** The snag list of one snagging request (the office's job page, or JAD+ Admin's request page read-only). */
export function Snags({ requestId }: { requestId: string }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(apiPath('requests', requestId, 'snags'), snagListResponse),
    `snags-${requestId}`,
  );
  return (
    <Loaded state={state} reload={reload}>
      {(list) => (
        <Section title="Snag list" count={list.snags.length}>
          <p className="hint">{snagSummary(list.snags.map((s) => s.status))}</p>
          {list.snags.length === 0 ? null : (
            <ul className="plain">
              {list.snags.map((s) => (
                <SnagRow key={s.id} requestId={requestId} snag={s} list={list} onChanged={reload} />
              ))}
            </ul>
          )}
          {list.canAdd ? <AddSnag requestId={requestId} onAdded={reload} /> : null}
        </Section>
      )}
    </Loaded>
  );
}
