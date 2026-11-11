/**
 * JAD+ Admin "Requests" (ADR 0023, R4): search by reference, unit or partner, filter by status. The search is
 * kept in the address (#/requests?q=&status=), so the back button and a shared link show the same list.
 */
import { STATUSES, adminRequestsResponse, type Status } from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { deadlineText, dateTime, STATUS_LABELS } from '../lib/format';
import { navigate, useConsole, useLoad, useNow } from '../ui/hooks';
import { Link, Loaded, PageHeader, StatusTag, Tag } from '../ui/parts';

export function Requests({ q, status }: { q: string; status: Status | null }): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const [text, setText] = useState(q);
  const [chosen, setChosen] = useState<Status | ''>(status ?? '');
  const query = new URLSearchParams();
  if (q !== '') query.set('q', q);
  if (status !== null) query.set('status', status);
  const qs = query.toString();
  const { state, reload } = useLoad(
    () => api.get(`/api/admin/requests${qs === '' ? '' : `?${qs}`}`, adminRequestsResponse),
    qs,
  );

  const search = (e: SyntheticEvent): void => {
    e.preventDefault();
    navigate({ name: 'requests', q: text.trim().slice(0, 60), status: chosen === '' ? null : chosen });
  };

  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Service requests" />
      <form className="card search" onSubmit={search} role="search">
        <label className="field grow">
          <span className="label">Reference, unit or partner</span>
          <input
            type="search"
            value={text}
            maxLength={60}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Status</span>
          <select
            value={chosen}
            onChange={(e) => {
              const v = e.target.value;
              setChosen(STATUSES.find((s) => s === v) ?? '');
            }}
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn">
          Search
        </button>
      </form>
      <Loaded state={state} reload={reload}>
        {({ requests }) =>
          requests.length === 0 ? (
            <p className="card muted">No requests match.</p>
          ) : (
            <section className="card">
              <p className="hint">
                Newest first; at most 100 are shown. Narrow the search to find older ones.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Request</th>
                    <th scope="col">Unit</th>
                    <th scope="col">Partner</th>
                    <th scope="col">Status</th>
                    <th scope="col">Next deadline</th>
                    <th scope="col">Raised</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const due = deadlineText(r.nextDueAt, now);
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link to={{ name: 'request', id: r.id }}>
                            <span className="ref">{r.ref}</span> {r.what}
                          </Link>
                          {r.emergency ? <Tag tone="bad">Emergency</Tag> : null}
                        </td>
                        <td>{[r.unit, r.project].filter((x) => x !== null).join(' · ') || '—'}</td>
                        <td>{r.partnerName ?? '—'}</td>
                        <td>
                          <StatusTag status={r.status} />
                        </td>
                        <td className={due?.startsWith('Overdue') === true ? 'late' : undefined}>
                          {due ?? '—'}
                        </td>
                        <td>{dateTime(r.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )
        }
      </Loaded>
    </>
  );
}
