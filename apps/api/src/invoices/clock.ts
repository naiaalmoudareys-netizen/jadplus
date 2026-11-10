/**
 * Invoice clock (ADR 0026), run with the daily partner check: once an invoice is past its due date and the owner
 * has not paid (nor said "I have paid"), the owner is reminded, once per invoice. JAD+ only reminds; it never
 * collects. The dedupe key makes the reminder happen once even if the job runs twice.
 */
import { daysBetween, dubaiDate } from '@jadplus/shared';
import { inboxStatements } from '../requests/inbox.js';

const BATCH_LIMIT = 500;

export async function runInvoiceClock(db: D1Database, now: number): Promise<{ readonly overdue: number }> {
  const today = dubaiDate(now);
  const { results } = await db
    .prepare(
      `SELECT id, request_id, owner_user_id, number, due_date, total_fils FROM invoices
       WHERE status = 'issued' AND due_date < ?
         AND NOT EXISTS (SELECT 1 FROM inbox
           WHERE dedupe_key = 'invoice_overdue:' || invoices.id || ':' || invoices.owner_user_id)
       ORDER BY due_date LIMIT ?`,
    )
    .bind(today, BATCH_LIMIT)
    .all<{
      id: string;
      request_id: string;
      owner_user_id: string;
      number: string;
      due_date: string;
      total_fils: number;
    }>();
  for (const i of results) {
    const target = { id: i.request_id, owner_user_id: i.owner_user_id, raised_by_user_id: i.owner_user_id };
    const data = {
      amountAed: i.total_fils / 100,
      dueOn: i.due_date,
      invoiceNumber: i.number,
      days: daysBetween(i.due_date, today),
    };
    await db.batch(inboxStatements(db, target, 'invoice_overdue', now, data, `invoice_overdue:${i.id}`));
  }
  return { overdue: results.length };
}
