/**
 * JAD+ Admin "Offers" (ADR 0025; N2): owners who tapped "I'm interested" on a news post or exclusive offer, for
 * the sales team to follow up. Opening the list is audited (owners' names). Sales marks an interest handled
 * once picked up; an owner may withdraw their interest in the app.
 */
import { offerInterestsResponse, type OfferInterests } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { apiPath, withQuery } from '../lib/api';
import { dateTime } from '../lib/format';
import { interestHandledResponse } from '../lib/platform-schemas';
import { canChange } from '../lib/session';
import { useAction } from '../ui/actions';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Link, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';
import { SortHeader, useSort } from '../ui/table';

type Interest = OfferInterests['interests'][number];
type Column = 'owner' | 'post' | 'at';
type Show = 'open' | 'all';

function value(i: Interest, key: Column): string | number | null {
  if (key === 'owner') return i.owner.name;
  if (key === 'post') return i.postId;
  return i.at;
}

function Handle({ id, onDone }: { id: string; onDone: () => void }): ReactNode {
  const { api } = useConsole();
  const action = useAction();
  return (
    <span className="file-button">
      <button
        type="button"
        className="btn btn-outline btn-small"
        disabled={action.busy}
        onClick={() => {
          action.run(async () => {
            await api.post(apiPath('admin', 'offer-interests', id, 'handled'), {}, interestHandledResponse);
            onDone();
          });
        }}
      >
        {action.busy ? 'Saving…' : 'Mark handled'}
      </button>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </span>
  );
}

function StateTag({ i }: { i: Interest }): ReactNode {
  if (i.withdrawnAt !== null) return <Tag tone="calm">Withdrawn by the owner</Tag>;
  if (i.handledAt !== null) return <Tag tone="good">Handled {dateTime(i.handledAt)}</Tag>;
  return <Tag tone="warn">To follow up</Tag>;
}

function Table({
  interests,
  editable,
  onChanged,
}: {
  interests: readonly Interest[];
  editable: boolean;
  onChanged: () => void;
}): ReactNode {
  const sorted = useSort<Interest, Column>(interests, { key: 'at', dir: 'desc' }, value);
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Owner" column="owner" sorted={sorted} />
          <SortHeader label="Post" column="post" sorted={sorted} />
          <SortHeader label="Interested" column="at" sorted={sorted} />
          <th scope="col">State</th>
          {editable ? <th scope="col">Change</th> : null}
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((i) => (
          <tr key={i.id}>
            <td>
              <Link to={{ name: 'person', id: i.owner.userId }}>{i.owner.name ?? 'Name not on file'}</Link>
              {i.owner.sfContactId === null ? null : (
                <span className="block hint">Salesforce contact {i.owner.sfContactId}</span>
              )}
            </td>
            <td className="ref">{i.postId}</td>
            <td>{dateTime(i.at)}</td>
            <td>
              <StateTag i={i} />
            </td>
            {editable ? (
              <td>
                {i.handledAt === null && i.withdrawnAt === null ? (
                  <Handle id={i.id} onDone={onChanged} />
                ) : null}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Offers(): ReactNode {
  const { api, session } = useConsole();
  const editable = canChange(session.role);
  const [show, setShow] = useState<Show>('open');
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/admin/offer-interests', { state: show }), offerInterestsResponse),
    show,
  );
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Offers">
        <div className="segmented" role="group" aria-label="Which interests">
          {(['open', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={s === show ? 'segment segment-current' : 'segment'}
              aria-pressed={s === show}
              onClick={() => {
                setShow(s);
              }}
            >
              {s === 'open' ? 'To follow up' : 'All'}
            </button>
          ))}
        </div>
      </PageHeader>
      <Loaded state={state} reload={reload}>
        {({ interests }) => (
          <Section title="Owners interested in an offer" count={interests.length}>
            <p className="hint">For the sales team: call the owner, then mark the interest handled.</p>
            {interests.length === 0 ? (
              <Empty>{show === 'open' ? 'Nobody is waiting for a call.' : 'No interests yet.'}</Empty>
            ) : (
              <Table interests={interests} editable={editable} onChanged={reload} />
            )}
          </Section>
        )}
      </Loaded>
    </>
  );
}
