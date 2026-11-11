/**
 * Monthly statements of a managed unit (ADR 0034; O4): the managing team uploads one PDF per month (20 MB at
 * most); the owner reads it in the app. A second upload for a month replaces what the owner sees (the first stays
 * on file). Every download is written to the audit log by the API.
 */
import { dubaiDate, type OfficeManagedUnitDetail } from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { z } from 'zod';
import { apiPath, withQuery } from '../../lib/api';
import { dateTime, monthText } from '../../lib/format';
import { statementFileName, statementProblem } from '../../lib/managed';
import { FileButton, useAction } from '../../ui/actions';
import { useConsole, useNow } from '../../ui/hooks';
import { Empty, Notice, Section } from '../../ui/parts';

const uploaded = z.object({ id: z.string(), month: z.string() });

export function Statements({
  d,
  onChanged,
}: {
  d: OfficeManagedUnitDetail;
  onChanged: (m: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const thisMonth = dubaiDate(useNow()).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const p = statementProblem(month, file);
    setProblem(p);
    if (p !== null || file === null) return;
    action.run(async () => {
      await api.upload(
        withQuery(apiPath('partner', 'managed-units', d.unit.id, 'statements'), { month }),
        file,
        'application/pdf',
        uploaded,
      );
      setFile(null);
      setRound((r) => r + 1);
      onChanged(`The statement for ${monthText(month)} was sent to the owner.`);
    });
  };
  return (
    <Section title="Monthly statements" count={d.statements.length}>
      {d.statements.length === 0 ? (
        <Empty>No statements yet.</Empty>
      ) : (
        <ul className="plain stack">
          {d.statements.map((s) => (
            <li key={s.id}>
              <strong>{monthText(s.month)}</strong> <span className="hint">{dateTime(s.uploadedAt)}</span>{' '}
              <FileButton
                path={apiPath('managed-units', d.unit.id, 'statements', s.id, 'file')}
                label="Download PDF"
                saveAs={statementFileName(d.unit.unitName, s.month)}
              />
            </li>
          ))}
        </ul>
      )}
      <form className="stack upload" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Month</span>
            <input
              type="month"
              value={month}
              max={thisMonth}
              onChange={(e) => {
                setMonth(e.target.value);
              }}
            />
          </label>
          <label className="field">
            <span className="label">Statement (PDF, up to 20 MB)</span>
            <input
              key={round}
              type="file"
              accept="application/pdf"
              disabled={action.busy}
              onChange={(e) => {
                setProblem(null);
                setFile(e.target.files?.[0] ?? null);
              }}
            />
          </label>
        </div>
        {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
        {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
        <div className="row-actions">
          <button type="submit" className="btn" disabled={action.busy || file === null}>
            {action.busy ? 'Sending…' : 'Send the statement'}
          </button>
        </div>
      </form>
    </Section>
  );
}
