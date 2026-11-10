/**
 * Building notices for one place (ADR 0025; V1): "water shut-off on Tuesday 10:00-14:00". Residents of the
 * place see a notice while it runs and from 7 days before it starts. A project-wide notice reaches every
 * building of the project, so a building page also lists those. JAD+ Admin publishes and withdraws.
 */
import {
  NOTICE_KINDS,
  NOTICE_LEAD_DAYS,
  adminNoticesResponse,
  noticeBody,
  type AdminNotices,
  type NoticeKind,
  type Place,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { ApiError, apiPath, withQuery } from '../../lib/api';
import { dubaiInstant } from '../../lib/dates';
import { dateTime, type Tone } from '../../lib/format';
import { NOTICE_KIND_LABELS } from '../../lib/labels';
import { createdResponse, noticeWithdrawnResponse } from '../../lib/platform-schemas';
import { placeName, reaching } from '../../lib/platform';
import { ConfirmButton, useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Empty, Loaded, Notice, Section, Tag } from '../../ui/parts';

type NoticeRow = AdminNotices['notices'][number];

const STATES: Readonly<Record<NoticeRow['state'], [string, Tone]>> = {
  upcoming: ['Upcoming', 'warn'],
  current: ['Showing now', 'good'],
  ended: ['Ended', 'calm'],
  withdrawn: ['Withdrawn', 'calm'],
};

function NewNotice({ place, onAdded }: { place: Place; onAdded: () => void }): ReactNode {
  const { api } = useConsole();
  const [kind, setKind] = useState<NoticeKind>('water');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('18:00');
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    action.run(async () => {
      const startsAt = dubaiInstant(startDate, startTime);
      if (startsAt === null) throw new ApiError('Choose when the notice starts.', 400);
      const endsAt = endDate === '' ? null : dubaiInstant(endDate, endTime);
      if (endDate !== '' && endsAt === null) throw new ApiError('Choose a real end date and time.', 400);
      const parsed = noticeBody.safeParse({ ...place, kind, title, body, startsAt, endsAt });
      if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? 'Check the notice.', 400);
      await api.post('/api/admin/notices', parsed.data, createdResponse);
      setTitle('');
      setBody('');
      onAdded();
    });
  };
  return (
    <form className="stack add-form" onSubmit={submit}>
      <h3 className="label">Publish a notice for {placeName(place)}</h3>
      <div className="form-grid">
        <label className="field">
          <span className="label">About</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(NOTICE_KINDS.find((k) => k === e.target.value) ?? 'other');
            }}
          >
            {NOTICE_KINDS.map((k) => (
              <option key={k} value={k}>
                {NOTICE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
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
          <span className="label">Starts (Dubai)</span>
          <input
            type="date"
            value={startDate}
            required
            onChange={(e) => {
              setStartDate(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">at</span>
          <input
            type="time"
            value={startTime}
            required
            onChange={(e) => {
              setStartTime(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Ends (optional)</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">at</span>
          <input
            type="time"
            value={endTime}
            disabled={endDate === ''}
            onChange={(e) => {
              setEndTime(e.target.value);
            }}
          />
        </label>
      </div>
      <label className="field">
        <span className="label">What residents should know</span>
        <textarea
          value={body}
          rows={3}
          required
          maxLength={1000}
          onChange={(e) => {
            setBody(e.target.value);
          }}
        />
      </label>
      <p className="hint">
        Plain text only. Residents see it from {NOTICE_LEAD_DAYS} days before it starts; without an end it
        shows until withdrawn.
      </p>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div>
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Publishing…' : 'Publish notice'}
        </button>
      </div>
    </form>
  );
}

function NoticeItem({
  n,
  editable,
  onWithdrawn,
}: {
  n: NoticeRow;
  editable: boolean;
  onWithdrawn: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [text, tone] = STATES[n.state];
  const live = n.state === 'upcoming' || n.state === 'current';
  return (
    <li className="notice-item">
      <div>
        <p>
          <Tag tone={tone}>{text}</Tag>
          <Tag tone="calm">{NOTICE_KIND_LABELS[n.kind]}</Tag>
          <strong>{n.title}</strong>
        </p>
        <p className="hint">
          {placeName(n)} · from {dateTime(n.startsAt)}
          {n.endsAt === null ? ' until withdrawn' : ` to ${dateTime(n.endsAt)}`}
        </p>
        <p className="prewrap">{n.body}</p>
      </div>
      {editable && live ? (
        <ConfirmButton
          label="Withdraw"
          question="Withdraw this notice? Residents stop seeing it at once."
          onConfirm={async () => {
            await api.post(apiPath('admin', 'notices', n.id, 'withdraw'), {}, noticeWithdrawnResponse);
            onWithdrawn();
          }}
        />
      ) : null}
    </li>
  );
}

export function Notices({ place, editable }: { place: Place; editable: boolean }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () =>
      api.get(
        withQuery('/api/admin/notices', { project: place.project, state: 'all' }),
        adminNoticesResponse,
      ),
    `notices:${place.project}`,
  );
  return (
    <Loaded state={state} reload={reload}>
      {({ notices: all }) => {
        // A project page lists every notice of the project; a building page those that reach its residents.
        const notices = (place.building === null ? [...all] : reaching(all, place)).sort(
          (a, b) => b.startsAt - a.startsAt,
        );
        return (
          <Section title="Notices to residents" count={notices.length}>
            {notices.length === 0 ? (
              <Empty>No notices yet.</Empty>
            ) : (
              <ul className="plain notice-list">
                {notices.map((n) => (
                  <NoticeItem key={n.id} n={n} editable={editable} onWithdrawn={reload} />
                ))}
              </ul>
            )}
            {editable ? <NewNotice place={place} onAdded={reload} /> : null}
          </Section>
        );
      }}
    </Loaded>
  );
}
