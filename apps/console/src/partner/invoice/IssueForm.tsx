/**
 * Issuing an invoice for a finished job (ADR 0026 §1): the amount is what the owner approved (the quote, L4,
 * and make-safe work, E8) or less, never more; 5% UAE VAT is added; the partner's TRN and how the owner pays
 * the partner (bank details or a payment link, as text) go on the invoice. The owner pays the partner
 * directly, never JAD Global.
 */
import { DEFAULT_DUE_DAYS, MAX_DUE_DAYS, VAT_PERCENT, partnerInvoice } from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { fils } from '../../lib/format';
import { checkAmount, issueBody } from '../../lib/invoices';
import { useAction } from '../../ui/actions';
import { useConsole } from '../../ui/hooks';
import { Notice } from '../../ui/parts';

export interface ReadyJob {
  readonly requestId: string;
  readonly ref: string;
  readonly quoteFils: number;
  readonly makeSafeFils: number;
  readonly approvedFils: number;
}

/** The details of the company's last invoice, offered again so they need not be typed every time. */
export interface LastDetails {
  readonly trn: string;
  readonly paymentInstructions: string;
}

function Preview({ job, amount }: { job: ReadyJob; amount: string }): ReactNode {
  const check = checkAmount(job.approvedFils, amount);
  if (!check.ok) return <Notice tone="warn">{check.problem}</Notice>;
  const t = check.totals;
  return (
    <dl className="facts">
      <div className="fact">
        <dt className="label">Amount before VAT</dt>
        <dd>{fils(t.subtotalFils)}</dd>
      </div>
      <div className="fact">
        <dt className="label">VAT {VAT_PERCENT}%</dt>
        <dd>{fils(t.vatFils)}</dd>
      </div>
      <div className="fact">
        <dt className="label">Total to pay</dt>
        <dd>
          <strong>{fils(t.totalFils)}</strong>
        </dd>
      </div>
    </dl>
  );
}

export function IssueForm({
  job,
  last,
  onIssued,
  onCancel,
}: {
  job: ReadyJob;
  last: LastDetails | null;
  onIssued: (message: string) => void;
  onCancel: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [amount, setAmount] = useState('');
  const [trn, setTrn] = useState(last?.trn ?? '');
  const [instructions, setInstructions] = useState(last?.paymentInstructions ?? '');
  const [dueInDays, setDueInDays] = useState(String(DEFAULT_DUE_DAYS));
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const result = issueBody({
      requestId: job.requestId,
      approvedFils: job.approvedFils,
      amount,
      trn,
      paymentInstructions: instructions,
      dueInDays,
    });
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    setProblem(null);
    action.run(async () => {
      const issued = await api.post('/api/partner/invoices', result.body, partnerInvoice);
      onIssued(`Invoice ${issued.number} for ${fils(issued.totalFils)} was sent to the owner.`);
    });
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="section-title">
        Invoice for <span className="ref">{job.ref}</span>
      </h2>
      <p className="hint">
        The owner approved {fils(job.approvedFils)}
        {job.quoteFils > 0 && job.makeSafeFils > 0
          ? ` (quote ${fils(job.quoteFils)}, make-safe work ${fils(job.makeSafeFils)})`
          : job.makeSafeFils > 0
            ? ' (make-safe work)'
            : ' (quote)'}
        , before VAT. The invoice can be for that amount or less, never more. The owner pays you directly.
      </p>
      <div className="form-grid">
        <label className="field">
          <span className="label">Amount before VAT (AED)</span>
          <input
            inputMode="decimal"
            value={amount}
            placeholder={String(job.approvedFils / 100)}
            maxLength={12}
            onChange={(e) => {
              setAmount(e.target.value);
            }}
          />
          <span className="hint">Leave empty for the full approved amount.</span>
        </label>
        <label className="field">
          <span className="label">Your TRN</span>
          <input
            value={trn}
            required
            inputMode="numeric"
            maxLength={40}
            autoComplete="off"
            onChange={(e) => {
              setTrn(e.target.value);
            }}
          />
          <span className="hint">UAE Tax Registration Number, 15 digits.</span>
        </label>
        <label className="field">
          <span className="label">Days to pay</span>
          <input
            type="number"
            min="0"
            max={MAX_DUE_DAYS}
            step="1"
            value={dueInDays}
            onChange={(e) => {
              setDueInDays(e.target.value);
            }}
          />
        </label>
      </div>
      <label className="field">
        <span className="label">How the owner pays you</span>
        <textarea
          value={instructions}
          rows={3}
          required
          maxLength={500}
          onChange={(e) => {
            setInstructions(e.target.value);
          }}
        />
        <span className="hint">
          Your bank details (bank, account name, IBAN) or your payment link. No phone numbers or emails:
          owners contact you through JAD+. Shown only to this owner, stored encrypted.
        </span>
      </label>
      <Preview job={job} amount={amount} />
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Issuing…' : 'Issue invoice'}
        </button>
        <button type="button" className="btn btn-outline" disabled={action.busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
