/**
 * JAD+ Admin "People" (ADR 0025; U8, U9): find an owner or tenant by their exact email, their mobile number, or
 * a unit name. Emails and mobiles are matched by blind index (ADR 0003), so only an exact match is found. The
 * search is kept in the address (#/people?q=), so back and forward show the same list.
 */
import { adminPeopleQuery, adminPeopleResponse } from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { withQuery } from '../lib/api';
import { ACCOUNT_LABELS, ROLE_LABELS, label } from '../lib/labels';
import { navigate, useConsole, useLoad } from '../ui/hooks';
import { Empty, Link, Loaded, Notice, PageHeader, Tag } from '../ui/parts';

function Results({ q }: { q: string }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/admin/people', { q }), adminPeopleResponse),
    q,
  );
  return (
    <Loaded state={state} reload={reload}>
      {({ people }) =>
        people.length === 0 ? (
          <div className="card">
            <Empty>Nobody matches. Emails and mobiles must be complete and exact.</Empty>
          </div>
        ) : (
          <section className="card">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Mobile</th>
                  <th scope="col">Roles</th>
                  <th scope="col">Account</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const [standing, tone] = ACCOUNT_LABELS[p.status];
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link to={{ name: 'person', id: p.id }}>{p.name ?? 'No name on file'}</Link>
                      </td>
                      <td>{p.email ?? '—'}</td>
                      <td>{p.phone ?? '—'}</td>
                      <td>{p.roles.map((r) => label(ROLE_LABELS, r.role)).join(', ') || '—'}</td>
                      <td>
                        <Tag tone={tone}>{standing}</Tag>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )
      }
    </Loaded>
  );
}

export function People({ q }: { q: string }): ReactNode {
  const [text, setText] = useState(q);
  const [problem, setProblem] = useState<string | null>(null);
  const search = (e: SyntheticEvent): void => {
    e.preventDefault();
    const query = adminPeopleQuery.safeParse({ q: text });
    if (!query.success) {
      setProblem('Type at least 2 characters.');
      return;
    }
    setProblem(null);
    navigate({ name: 'people', q: query.data.q });
  };
  const valid = adminPeopleQuery.safeParse({ q }).success;
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="People" />
      <form className="card search" onSubmit={search} role="search">
        <label className="field grow">
          <span className="label">Exact email, mobile number or unit</span>
          <input
            type="search"
            value={text}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
        </label>
        <button type="submit" className="btn">
          Search
        </button>
      </form>
      {problem === null ? null : <Notice tone="warn">{problem}</Notice>}
      {valid ? (
        <Results q={q} />
      ) : (
        <p className="hint">
          Opening a person shows their personal data; every view is recorded in the audit log.
        </p>
      )}
    </>
  );
}
