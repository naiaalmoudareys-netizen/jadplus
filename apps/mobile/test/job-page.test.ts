/** The technician's job page (R3): the progress tracker and the "More" steps beside the one big button. */
import type { RequestDetail } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { isOneTap, jobProgress, moreActions } from '../src/partner/progress.js';

type Detail = Pick<RequestDetail, 'visit' | 'quote'>;

const NOW = Date.UTC(2026, 10, 10, 6, 0, 0);

function visit(status: NonNullable<RequestDetail['visit']>['status']): Detail['visit'] {
  return { start: NOW, end: NOW + 3 * 3_600_000, technician: 'Karim Demo', status };
}

function quote(status: NonNullable<RequestDetail['quote']>['status']): Detail['quote'] {
  return {
    id: 'q1',
    revision: 1,
    amountAed: 450,
    scope: 'Replace the valve',
    status,
    sentAt: NOW,
    expiresAt: NOW + 14 * 86_400_000,
  };
}

const none: Detail = { visit: null, quote: null };
const routine = (status: RequestDetail['request']['status']) => ({ status, emergency: false });
const emergency = (status: RequestDetail['request']['status']) => ({ status, emergency: true });

describe('R3: job progress tracker', () => {
  it('a routine job: New → Booked → On the way → Working → Done', () => {
    const p = jobProgress(routine('assigned'), none);
    expect(p.steps).toEqual(['new', 'booked', 'on_the_way', 'working', 'done']);
    expect(p).toMatchObject({ reached: 0, state: 'moving' });
    expect(jobProgress(routine('scheduled'), { visit: visit('booked'), quote: null }).reached).toBe(1);
    expect(jobProgress(routine('scheduled'), { visit: visit('on_the_way'), quote: null }).reached).toBe(2);
    expect(jobProgress(routine('in_progress'), { visit: visit('arrived'), quote: null }).reached).toBe(3);
    expect(jobProgress(routine('completed'), { visit: visit('done'), quote: null }).reached).toBe(4);
  });

  it('E4: an emergency shows "Acknowledged" instead of "Booked", reached once acknowledged', () => {
    const before = jobProgress(emergency('assigned'), none);
    expect(before.steps[1]).toBe('acknowledged');
    expect(before.reached).toBe(0);
    expect(jobProgress(emergency('scheduled'), none).reached).toBe(1);
  });

  it('a closed job adds "Confirmed" and is complete', () => {
    const p = jobProgress(routine('closed'), { visit: visit('done'), quote: null });
    expect(p.steps).toEqual(['new', 'booked', 'on_the_way', 'working', 'done', 'confirmed']);
    expect(p).toMatchObject({ reached: 5, state: 'complete' });
  });

  it('L4: a quote waiting for the owner pauses the current step', () => {
    expect(jobProgress(routine('quote_sent'), { visit: null, quote: quote('pending') })).toMatchObject({
      reached: 0,
      state: 'owner',
    });
    expect(
      jobProgress(routine('quote_sent'), { visit: visit('arrived'), quote: quote('pending') }),
    ).toMatchObject({ reached: 3, state: 'owner' });
    expect(
      jobProgress(routine('scheduled'), { visit: visit('booked'), quote: quote('approved') }).state,
    ).toBe('moving');
  });

  it('A6: on hold, and a cancelled job, are shown as such', () => {
    expect(jobProgress(routine('on_hold'), { visit: visit('booked'), quote: null })).toMatchObject({
      reached: 1,
      state: 'hold',
    });
    expect(jobProgress(routine('cancelled'), none).state).toBe('cancelled');
  });

  it('A5: a reopened job starts again from the new visit (the finished one no longer counts)', () => {
    expect(jobProgress(routine('reopened'), { visit: visit('done'), quote: null }).reached).toBe(0);
    expect(jobProgress(routine('reopened'), { visit: visit('booked'), quote: null }).reached).toBe(1);
  });

  it('works before the request details have loaded', () => {
    expect(jobProgress(routine('scheduled'), null)).toMatchObject({ reached: 1, state: 'moving' });
  });
});

describe('R3: "More" steps', () => {
  it('lists the allowed steps other than the big button, in a fixed order', () => {
    expect(
      moreActions(['book_visit', 'send_quote', 'start_work', 'on_my_way', 'no_access'], 'on_my_way'),
    ).toEqual(['start_work', 'book_visit', 'send_quote', 'no_access']);
    expect(moreActions(['make_safe', 'work_done', 'send_quote'], 'work_done')).toEqual([
      'send_quote',
      'make_safe',
    ]);
  });

  it('leaves out resident steps and is empty when nothing else is allowed', () => {
    expect(moreActions(['confirm_done', 'rate'], null)).toEqual([]);
    expect(moreActions([], 'acknowledge')).toEqual([]);
  });
});

describe('A8: one-tap steps', () => {
  it('"I am on my way" and "Start work" run with one tap; the other steps open a form', () => {
    expect(isOneTap('on_my_way')).toBe(true);
    expect(isOneTap('start_work')).toBe(true);
    expect(isOneTap('acknowledge')).toBe(false);
    expect(isOneTap('book_visit')).toBe(false);
    expect(isOneTap('work_done')).toBe(false);
  });
});
