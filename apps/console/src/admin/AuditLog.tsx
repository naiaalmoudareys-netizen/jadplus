/**
 * JAD+ Admin "Audit log" (ADR 0025; C-AUD-1): every change and every view of personal data, newest first, 100
 * at a time. Filter by action, by who did it (user id), by what it was done to (id), by one person (exact email
 * or mobile, looked up by the API through the blind index; names cannot be searched, ADR 0003) and by Dubai
 * dates. Opening the log, and finding a person, is itself audited. JAD+ Admin only (the API refuses viewers too).
 */
import { adminAuditResponse } from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import type { z } from 'zod';
import { withQuery } from '../lib/api';
import { dateTime, humanize } from '../lib/format';
import { ROLE_LABELS, label } from '../lib/labels';
import {
  NO_AUDIT_FILTERS,
  auditFilterProblem,
  auditQuery,
  detailLines,
  type AuditFilters,
} from '../lib/platform';
import { useAction } from '../ui/actions';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Loaded, Notice, PageHeader, Section } from '../ui/parts';

type Entry = z.infer<typeof adminAuditResponse>['entries'][number];

function Filters({ value, onApply }: { value: AuditFilters; onApply: (f: AuditFilters) => void }): ReactNode {
  const [f, setF] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const field = (key: keyof AuditFilters, text: string, type = 'text', placeholder = ''): ReactNode => (
    <label className="field">
      <span className="label">{text}</span>
      <input
        type={type}
        value={f[key]}
        placeholder={placeholder}
        maxLength={64}
        onChange={(e) => {
          setF({ ...f, [key]: e.target.value });
        }}
      />
    </label>
  );
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const p = auditFilterProblem(f);
    setProblem(p);
    if (p === null) onApply(f);
  };
  return (
    <form className="card stack" onSubmit={submit} role="search">
      <div className="form-grid">
        {field('action', 'Action', 'text', 'partner_suspended')}
        {field('actor', 'Done by (user id)')}
        {field('target', 'Done to (id)')}
        {field('person', 'Person (exact email or mobile)', 'text', 'name@example.com')}
        {field('from', 'From (Dubai)', 'date')}
        {field('to', 'To (Dubai)', 'date')}
      </div>
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn">
          Filter
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setF(NO_AUDIT_FILTERS);
            setProblem(null);
            onApply(NO_AUDIT_FILTERS);
          }}
        >
          Clear
        </button>
      </div>
    </form>
  );
}

function Rows({ entries }: { entries: readonly Entry[] }): ReactNode {
  return (
    <>
      {entries.map((e) => (
        <tr key={e.seq}>
          <td>
            {dateTime(e.at)}
            <span className="block hint">#{e.seq}</span>
          </td>
          <td>
            {label(ROLE_LABELS, e.actorRole)}
            {e.actorUserId === null ? null : <span className="block hint code">{e.actorUserId}</span>}
          </td>
          <td>{humanize(e.action)}</td>
          <td>
            {e.targetType === null ? '—' : humanize(e.targetType)}
            {e.targetId === null ? null : <span className="block hint code">{e.targetId}</span>}
          </td>
          <td>
            <ul className="plain detail-lines">
              {detailLines(e.detail).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </td>
        </tr>
      ))}
    </>
  );
}

/** One filter's results: the first page, then older pages appended with "Load older". */
function Results({ filters }: { filters: AuditFilters }): ReactNode {
  const { api } = useConsole();
  const key = JSON.stringify(filters);
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/admin/audit', auditQuery(filters, null)), adminAuditResponse),
    key,
  );
  const [older, setOlder] = useState<{ entries: Entry[]; nextBefore: number | null } | null>(null);
  const action = useAction();
  return (
    <Loaded state={state} reload={reload}>
      {(first) => {
        const entries = [...first.entries, ...(older?.entries ?? [])];
        const next = older === null ? first.nextBefore : older.nextBefore;
        const loadOlder = (): void => {
          if (next === null) return;
          action.run(async () => {
            const page = await api.get(
              withQuery('/api/admin/audit', auditQuery(filters, next)),
              adminAuditResponse,
            );
            setOlder({ entries: [...(older?.entries ?? []), ...page.entries], nextBefore: page.nextBefore });
          });
        };
        return (
          <Section title="Entries" count={entries.length}>
            {filters.person.trim() === '' ? null : (
              <p className="hint">
                {first.person === null
                  ? 'Nobody has this email address or mobile number.'
                  : `What ${first.person.name ?? 'this person'} did, and what was done to their account (user ${first.person.userId}).`}
              </p>
            )}
            {entries.length === 0 ? (
              <Empty>Nothing matches these filters.</Empty>
            ) : (
              <table className="table audit">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">Action</th>
                    <th scope="col">What</th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  <Rows entries={entries} />
                </tbody>
              </table>
            )}
            {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
            {next === null ? (
              entries.length === 0 ? null : (
                <p className="hint">That is the oldest entry.</p>
              )
            ) : (
              <button type="button" className="btn btn-outline" disabled={action.busy} onClick={loadOlder}>
                {action.busy ? 'Loading…' : 'Load older'}
              </button>
            )}
          </Section>
        );
      }}
    </Loaded>
  );
}

export function AuditLog(): ReactNode {
  const [filters, setFilters] = useState<AuditFilters>(NO_AUDIT_FILTERS);
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Audit log" />
      <p className="hint page-intro">Kept for at least one year. Opening this page is recorded too.</p>
      <Filters value={filters} onApply={setFilters} />
      <Results key={JSON.stringify(filters)} filters={filters} />
    </>
  );
}
