/**
 * Units managed by a JAD Global team, for JAD+ Admin (ADR 0034; O4): the arrangements (current and past), the
 * bulk entry for units sold with complimentary management, and the team's maintenance company. The bulk entry is
 * all or nothing: the API names every row it refuses and saves none until the list is correct.
 */
import { adminManagedUnitsResponse, bulkManagedResponse, bulkProblemsBody } from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { z } from 'zod';
import { ApiError, apiPath, withQuery } from '../../lib/api';
import { SOURCE_LABELS, apiRowToLine, parseBulkLines, periodText } from '../../lib/managed';
import { MaintenanceCompany } from '../../managed/MaintenanceCompany';
import { ConfirmButton, useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Empty, Loaded, Notice, Section, Tag } from '../../ui/parts';

const ended = z.object({ id: z.string(), endedAt: z.number() });

type Problems = readonly { readonly row: number; readonly problem: string }[];

function BulkEntry({ providerId, onAdded }: { providerId: string; onAdded: (n: number) => void }): ReactNode {
  const { api } = useConsole();
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<Problems>([]);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const parsed = parseBulkLines(text);
    setProblems(parsed.problems);
    if (parsed.problems.length > 0) return;
    action.run(async () => {
      try {
        const res = await api.post(
          '/api/admin/managed-units/bulk',
          { providerId, rows: parsed.rows },
          bulkManagedResponse,
        );
        setText('');
        onAdded(res.added);
      } catch (err) {
        const body = err instanceof ApiError ? bulkProblemsBody.safeParse(err.body) : null;
        if (body?.success !== true) throw err;
        setProblems(body.data.problems.map((p) => ({ ...p, row: apiRowToLine(text, p.row) })));
      }
    });
  };
  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span className="label">Units sold with complimentary management</span>
        <textarea
          rows={6}
          value={text}
          placeholder={'506-JAD288-C, demo@jadplus.ae, 2027-11-30'}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </label>
      <p className="hint">
        One unit per line: unit name, owner’s email, last day (YYYY-MM-DD). Management starts today. Nothing
        is saved until every line is correct.
      </p>
      {problems.length === 0 ? null : (
        <Notice tone="bad">
          {problems.map((p) => (
            <span key={`${String(p.row)}:${p.problem}`} className="block">
              {p.row > 0 ? `Line ${String(p.row)}: ` : ''}
              {p.problem}
            </span>
          ))}
        </Notice>
      )}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy || text.trim() === ''}>
          {action.busy ? 'Saving…' : 'Add these units'}
        </button>
      </div>
    </form>
  );
}

export function ManagedUnits({ providerId, editable }: { providerId: string; editable: boolean }): ReactNode {
  const { api } = useConsole();
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/admin/managed-units', { providerId }), adminManagedUnitsResponse),
    providerId,
  );
  const changed = (message: string): void => {
    setDone(message);
    reload();
  };
  return (
    <>
      <Section title="Managed units">
        {done === null ? null : <Notice tone="good">{done}</Notice>}
        <Loaded state={state} reload={reload}>
          {({ units }) =>
            units.length === 0 ? (
              <Empty>No units managed yet.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Unit</th>
                    <th scope="col">Period</th>
                    <th scope="col">How</th>
                    <th scope="col">Now</th>
                    {editable ? <th scope="col">Change</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => (
                    <tr key={u.id}>
                      <td>{u.unitName ?? u.sfUnitId}</td>
                      <td>{periodText(u.since, u.until)}</td>
                      <td>{SOURCE_LABELS[u.source]}</td>
                      <td>
                        {u.current ? (
                          <Tag tone="good">Managed</Tag>
                        ) : (
                          <Tag tone="calm">{u.endedAt === null ? 'Not in force' : 'Ended'}</Tag>
                        )}
                      </td>
                      {editable ? (
                        <td>
                          {u.endedAt !== null ? null : (
                            <ConfirmButton
                              label="End"
                              question="The owner looks after the tenant and decides the tenant's requests again from now."
                              onConfirm={async () => {
                                await api.post(apiPath('admin', 'managed-units', u.id, 'end'), {}, ended);
                                changed(`${u.unitName ?? 'The unit'} is no longer managed.`);
                              }}
                            />
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </Loaded>
        {editable ? (
          <BulkEntry
            providerId={providerId}
            onAdded={(n) => {
              changed(`${String(n)} ${n === 1 ? 'unit is' : 'units are'} now managed.`);
            }}
          />
        ) : null}
      </Section>
      <MaintenanceCompany path={apiPath('admin', 'manager-settings', providerId)} editable={editable} />
    </>
  );
}
