/**
 * Proposing a new rate card (S9, P1): the whole card, line by line, starting at least 60 days from today. It
 * takes effect only once JAD+ accepts it with the written approval; prices are fixed for 12 months.
 */
import {
  RATE_CHANGE_NOTICE_DAYS,
  RATE_UNITS,
  SERVICES,
  rateChangeProposedResponse,
  type RateLine,
} from '@jadplus/shared';
import { useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { today } from '../../lib/dates';
import { dayText } from '../../lib/format';
import { RATE_UNIT_LABELS } from '../../lib/labels';
import {
  draftBody,
  draftChange,
  draftFrom,
  earliestStart,
  emptyLine,
  type DraftLine,
} from '../../lib/rate-card';
import { useAction } from '../../ui/actions';
import { useConsole } from '../../ui/hooks';
import { Notice } from '../../ui/parts';

function LineRow({
  line,
  index,
  current,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  index: number;
  current: readonly RateLine[];
  onChange: (next: DraftLine) => void;
  onRemove: (() => void) | null;
}): ReactNode {
  const n = String(index + 1);
  return (
    <tr>
      <td>
        <select
          aria-label={`Line ${n} service`}
          value={line.serviceCode}
          onChange={(e) => {
            onChange({ ...line, serviceCode: e.target.value });
          }}
        >
          {SERVICES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          aria-label={`Line ${n} item`}
          value={line.item}
          maxLength={120}
          onChange={(e) => {
            onChange({ ...line, item: e.target.value });
          }}
        />
      </td>
      <td>
        <select
          aria-label={`Line ${n} unit`}
          value={line.unit}
          onChange={(e) => {
            onChange({ ...line, unit: e.target.value });
          }}
        >
          {RATE_UNITS.map((u) => (
            <option key={u} value={u}>
              {RATE_UNIT_LABELS[u] ?? u}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          aria-label={`Line ${n} price in AED`}
          className="price-input"
          type="number"
          min="0.01"
          step="0.01"
          value={line.price}
          onChange={(e) => {
            onChange({ ...line, price: e.target.value });
          }}
        />
      </td>
      <td className="num">{draftChange(line, current)}</td>
      <td>
        {onRemove === null ? null : (
          <button type="button" className="btn btn-outline btn-small" onClick={onRemove}>
            Remove
          </button>
        )}
      </td>
    </tr>
  );
}

export function ProposeChange({
  current,
  now,
  onSent,
  onCancel,
}: {
  current: readonly RateLine[];
  now: number;
  onSent: (message: string) => void;
  onCancel: () => void;
}): ReactNode {
  const { api } = useConsole();
  const counter = useRef(0);
  const newKey = (): string => {
    counter.current += 1;
    return `line-${String(counter.current)}`;
  };
  const [lines, setLines] = useState<DraftLine[]>(() => draftFrom(current, newKey));
  const day = today(now);
  const [effectiveFrom, setEffectiveFrom] = useState(earliestStart(day));
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const result = draftBody(effectiveFrom, lines, day);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    setProblem(null);
    action.run(async () => {
      const sent = await api.post('/api/partner/rate-card/changes', result.body, rateChangeProposedResponse);
      onSent(
        `Sent to JAD+. If accepted, it applies from ${dayText(sent.effectiveFrom)} to ${dayText(sent.validUntil)}.`,
      );
    });
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="section-title">Propose a new rate card</h2>
      <p className="hint">
        List every line of the new card. It can start {RATE_CHANGE_NOTICE_DAYS} days from today at the
        earliest, and prices cannot go up while the current card&apos;s 12 months run.
      </p>
      <label className="field">
        <span className="label">Starts on</span>
        <input
          type="date"
          value={effectiveFrom}
          min={earliestStart(day)}
          required
          onChange={(e) => {
            setEffectiveFrom(e.target.value);
          }}
        />
      </label>
      <table className="table rate-editor">
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">Item</th>
            <th scope="col">Unit</th>
            <th scope="col">Price (AED)</th>
            <th scope="col" className="num">
              vs today
            </th>
            <th scope="col">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <LineRow
              key={line.key}
              line={line}
              index={i}
              current={current}
              onChange={(next) => {
                setLines(lines.map((l) => (l.key === line.key ? next : l)));
              }}
              onRemove={
                lines.length === 1
                  ? null
                  : () => {
                      setLines(lines.filter((l) => l.key !== line.key));
                    }
              }
            />
          ))}
        </tbody>
      </table>
      <div>
        <button
          type="button"
          className="btn btn-outline"
          disabled={lines.length >= 200}
          onClick={() => {
            setLines([...lines, emptyLine(newKey())]);
          }}
        >
          Add a line
        </button>
      </div>
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Sending…' : 'Send to JAD+'}
        </button>
        <button type="button" className="btn btn-outline" disabled={action.busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
