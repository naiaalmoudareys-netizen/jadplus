/**
 * The simulated clock. Stories (an owner's leak, a consultation, a month of statements...) are ordinary async
 * functions that `sleep` until a moment in simulated time; the scheduler wakes exactly one story at a time, in
 * time order, so every API call sees one consistent "now". Between stories it runs the Worker's scheduled jobs
 * as the crons would (src/index.ts): the escalation sweep every 5 minutes while an emergency waits, the request
 * clock (quote expiry, auto-close, reminders, tenancy clock) and alert delivery every 15 minutes, and the daily
 * partner check and invoice clock at 02:00 UTC (06:00 Dubai). A story still asleep when the simulation reaches
 * the end simply stays where it is: that is the company's state "now".
 */
import { dubaiDate, preferredDays } from '@jadplus/shared';
import { loadCalendar } from '../../src/calendar.js';
import { runDelivery } from '../../src/delivery/run.js';
import type { Senders } from '../../src/delivery/senders.js';
import { runInvoiceClock } from '../../src/invoices/clock.js';
import { runEscalationSweep } from '../../src/jobs/escalation.js';
import { runPartnerReview } from '../../src/jobs/partner-review.js';
import { runRequestClock } from '../../src/jobs/request-clock.js';
import { createLogger } from '../../src/logger.js';
import type { CompanyWorld } from './world.js';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
const DUBAI = 4 * HOUR;

const quiet = createLogger({}, () => undefined);

/**
 * Alerts "go out" on the developer's machine as they do in local wrangler, except to two fictional addresses that
 * always fail (the J188 facilities desk's number and one owner's email), so JAD+ Admin's undelivered list shows.
 */
const UNREACHABLE = new Set(['+971500000905', 'priya.raman@example.com']);
const deliver = (_env: unknown, m: { to: string }) =>
  UNREACHABLE.has(m.to) ? Promise.reject(new Error('demo: not reachable')) : ok();
const senders: Senders = { sms: deliver, email: deliver };
function ok(): Promise<{ providerRef: null }> {
  return Promise.resolve({ providerRef: null });
}

interface Waiter {
  readonly at: number;
  readonly seq: number;
  readonly wake: () => void;
}

export class Sim {
  private waiters: Waiter[] = [];
  private seq = 0;
  private yielded: (() => void) | null = null;
  private failure: unknown = null;
  private nextSweep: number;
  private nextClock: number;
  private nextDaily: number;

  constructor(
    readonly w: CompanyWorld,
    readonly start: number,
    readonly end: number,
  ) {
    this.nextSweep = start;
    this.nextClock = start;
    const firstDaily = Date.UTC(
      new Date(start).getUTCFullYear(),
      new Date(start).getUTCMonth(),
      new Date(start).getUTCDate(),
      2,
    );
    this.nextDaily = firstDaily <= start ? firstDaily + DAY : firstDaily;
  }

  get now(): number {
    return this.w.clock;
  }

  /** Starts `story` at `at` (or now, if that has passed). */
  spawn(at: number, story: () => Promise<void>): void {
    this.push(Math.max(at, this.w.clock), () => {
      story().then(
        () => {
          this.release();
        },
        (err: unknown) => {
          this.failure = err;
          this.release();
        },
      );
    });
  }

  /** Sleeps the calling story until `at` (never backwards). */
  until(at: number): Promise<void> {
    return new Promise((resolve) => {
      this.push(Math.max(at, this.w.clock), resolve);
      this.release();
    });
  }

  wait(ms: number): Promise<void> {
    return this.until(this.w.clock + ms);
  }

  private push(at: number, wake: () => void): void {
    this.waiters.push({ at, seq: (this.seq += 1), wake });
  }

  private release(): void {
    const y = this.yielded;
    this.yielded = null;
    y?.();
  }

  async run(): Promise<void> {
    for (;;) {
      this.waiters.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.waiters[0];
      const target = next === undefined || next.at > this.end ? this.end : next.at;
      await this.jobsUntil(target);
      if (next === undefined || next.at > this.end) break;
      this.waiters.shift();
      this.w.clock = next.at;
      await new Promise<void>((resolve) => {
        this.yielded = resolve;
        next.wake();
      });
      if (this.failure !== null) {
        throw this.failure instanceof Error ? this.failure : new Error('A story failed');
      }
    }
    this.w.clock = this.end;
  }

  /** Runs every scheduled job due up to `t`, in time order. */
  private async jobsUntil(t: number): Promise<void> {
    for (;;) {
      const due = Math.min(this.nextSweep, this.nextClock, this.nextDaily);
      if (due > t) return;
      this.w.clock = due;
      const db = this.w.env.DB;
      if (due === this.nextSweep) {
        this.nextSweep += 5 * MIN;
        if (this.emergencyWaiting()) await runEscalationSweep(db, due, quiet);
      } else if (due === this.nextClock) {
        this.nextClock += 15 * MIN;
        await runEscalationSweep(db, due, quiet);
        await runRequestClock(db, due, quiet);
        await runDelivery(this.w.env, senders, due, quiet);
      } else {
        this.nextDaily += DAY;
        await runPartnerReview(db, due, quiet);
        await runInvoiceClock(db, due);
      }
    }
  }

  private emergencyWaiting(): boolean {
    const row = this.w.db
      .prepare(
        "SELECT 1 AS yes FROM requests WHERE is_emergency = 1 AND status = 'assigned' AND acknowledged_at IS NULL LIMIT 1",
      )
      .get();
    return row !== undefined;
  }

  /** The working days an owner may pick for a visit, from tomorrow (holidays on file excluded). */
  async preferredDays(): Promise<string[]> {
    return preferredDays(dubaiDate(this.w.clock), await loadCalendar(this.w.env.DB));
  }
}

/** UTC ms of a Dubai wall-clock time on a Dubai date. */
export function dubaiTime(date: string, hour: number, minute = 0): number {
  return Date.parse(`${date}T00:00:00Z`) + hour * HOUR + minute * MIN - DUBAI;
}

export const SLOT_HOURS = { morning: 9, midday: 12, afternoon: 15 } as const;
export type Slot = keyof typeof SLOT_HOURS;

/** Monday (Dubai) of the week holding `t`. */
export function mondayOf(t: number): string {
  const date = dubaiDate(t);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const back = (weekday + 6) % 7;
  return new Date(Date.parse(`${date}T00:00:00Z`) - back * DAY).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
