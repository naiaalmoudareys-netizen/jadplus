/**
 * One invoice opened on the partner office's list (ADR 0026 §3): what it says, and the steps the API allows
 * now. The office marks it paid when the money arrives (date and method), says the money has not arrived when
 * the owner said "I have paid" but nothing came, or cancels an invoice issued in error (with the reason).
 */
import {
  PAYMENT_METHODS,
  cancelInvoiceBody,
  invoiceStepResponse,
  type PartnerInvoice,
  type PaymentMethod,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { ApiError, apiPath } from '../../lib/api';
import { today } from '../../lib/dates';
import { dateTime, dayText, fils } from '../../lib/format';
import { PAYMENT_METHOD_LABELS, paidBody } from '../../lib/invoices';
import { ConfirmButton, useAction } from '../../ui/actions';
import { useConsole } from '../../ui/hooks';
import { Fact, Notice, ReasonForm } from '../../ui/parts';

const LINE_LABELS = { quote: 'Approved quote', make_safe: 'Make-safe work' } as const;

function MarkPaid({
  invoice,
  now,
  onDone,
}: {
  invoice: PartnerInvoice;
  now: number;
  onDone: (message: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const day = today(now);
  const [paidOn, setPaidOn] = useState(invoice.claimedPaidOn ?? day);
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const result = paidBody(paidOn, method, day);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    setProblem(null);
    action.run(async () => {
      await api.post(apiPath('partner', 'invoices', invoice.id, 'paid'), result.body, invoiceStepResponse);
      onDone(`Invoice ${invoice.number} is marked paid. The owner is told.`);
    });
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span className="label">Money arrived on</span>
          <input
            type="date"
            value={paidOn}
            max={day}
            required
            onChange={(e) => {
              setPaidOn(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="label">How it was paid</span>
          <select
            value={method}
            onChange={(e) => {
              setMethod(PAYMENT_METHODS.find((m) => m === e.target.value) ?? 'other');
            }}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div>
        <button type="submit" className="btn" disabled={action.busy}>
          {action.busy ? 'Saving…' : 'Mark paid'}
        </button>
      </div>
    </form>
  );
}

function Details({ invoice }: { invoice: PartnerInvoice }): ReactNode {
  return (
    <dl className="facts">
      {invoice.lines.map((l) => (
        <Fact key={l.kind} label={LINE_LABELS[l.kind]}>
          {fils(l.fils)}
        </Fact>
      ))}
      <Fact label="Amount before VAT">{fils(invoice.subtotalFils)}</Fact>
      <Fact label="VAT">{fils(invoice.vatFils)}</Fact>
      <Fact label="Total">{fils(invoice.totalFils)}</Fact>
      <Fact label="TRN">{invoice.trn}</Fact>
      <Fact label="How the owner pays you">
        <span className="prewrap">{invoice.paymentInstructions}</span>
      </Fact>
      {invoice.claimedPaidOn === null ? null : (
        <Fact label="Owner says paid on">{dayText(invoice.claimedPaidOn)}</Fact>
      )}
      {invoice.paidOn === null ? null : (
        <Fact label="Paid">
          {dayText(invoice.paidOn)}
          {invoice.paidMethod === null ? null : ` · ${PAYMENT_METHOD_LABELS[invoice.paidMethod]}`}
        </Fact>
      )}
      {invoice.cancelledAt === null ? null : <Fact label="Cancelled">{dateTime(invoice.cancelledAt)}</Fact>}
    </dl>
  );
}

export function InvoiceSteps({
  invoice,
  now,
  onDone,
}: {
  invoice: PartnerInvoice;
  now: number;
  onDone: (message: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const [cancelling, setCancelling] = useState(false);
  const can = (step: PartnerInvoice['actions'][number]): boolean => invoice.actions.includes(step);
  const cancel = async (reason: string): Promise<void> => {
    const body = cancelInvoiceBody.safeParse({ reason });
    if (!body.success) throw new ApiError('Say why the invoice is cancelled (at least 3 characters).', 400);
    await api.post(apiPath('partner', 'invoices', invoice.id, 'cancel'), body.data, invoiceStepResponse);
    onDone(`Invoice ${invoice.number} is cancelled. You can issue a new one for this job.`);
  };
  return (
    <div className="stack">
      <Details invoice={invoice} />
      {invoice.status === 'claimed_paid' ? (
        <Notice tone="warn">
          The owner says they paid
          {invoice.claimedPaidOn === null ? '' : ` on ${dayText(invoice.claimedPaidOn)}`}. Check your account,
          then mark it paid, or say the money has not arrived.
        </Notice>
      ) : null}
      {can('mark_paid') ? <MarkPaid invoice={invoice} now={now} onDone={onDone} /> : null}
      <div className="row-actions">
        {can('mark_not_received') ? (
          <ConfirmButton
            label="Money not received"
            question="The owner is told the payment has not arrived, and the invoice goes back to waiting for payment."
            confirmLabel="Tell the owner"
            onConfirm={async () => {
              await api.postOnly(apiPath('partner', 'invoices', invoice.id, 'not-received'));
              onDone(`Invoice ${invoice.number}: the owner is told the money has not arrived.`);
            }}
          />
        ) : null}
        {can('cancel') && !cancelling ? (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setCancelling(true);
            }}
          >
            Cancel invoice
          </button>
        ) : null}
      </div>
      {cancelling ? (
        <ReasonForm
          label="Why is this invoice cancelled?"
          submitLabel="Cancel invoice"
          minLength={3}
          explain="Only for an invoice issued in error. The owner is told; you can then issue a new one."
          onSubmit={cancel}
          onCancel={() => {
            setCancelling(false);
          }}
        />
      ) : null}
    </div>
  );
}
