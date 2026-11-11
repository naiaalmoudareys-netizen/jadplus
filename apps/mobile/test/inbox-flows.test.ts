/** Service-flow notifications in the person's language (ADR 0035): O2, O3, O5, P5, A4. */
import { INBOX_KINDS, LANGUAGES, type InboxItem } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { langOf } from '../src/i18n/lang.js';
import { monthLabel } from '../src/inbox/flowWording.js';
import { inboxTarget, inboxText } from '../src/inbox/wording.js';

const en = langOf('en');
const NOW = Date.UTC(2026, 10, 10, 6, 0, 0);
/** 18:00 Dubai, Thu 12 Nov 2026. */
const THU_18 = Date.UTC(2026, 10, 12, 14, 0);

const item = (over: Partial<InboxItem>): InboxItem => ({
  id: 'i1',
  kind: 'stage_reached',
  requestId: 'r1',
  tenancyId: null,
  ref: 'JAD-AB12CD',
  at: NOW,
  read: false,
  data: {},
  ...over,
});

/** Facts like the API's, so every kind's sentence is complete. */
const FACTS: InboxItem['data'] = {
  service: 'mortgage',
  stage: 'pre_approval',
  step: 'utilities',
  reportKind: 'valuation',
  outcome: 'done',
  date: '2026-12-01',
  slot: 'morning',
  startsAt: THU_18,
  period: '2026-11',
  count: 2,
  hours: 24,
  amountAed: 450,
  windowStart: THU_18,
  windowEnd: THU_18 + 3_600_000,
  endsOn: '2026-12-31',
  days: 30,
  stars: 5,
  dueOn: '2026-12-01',
  invoiceNumber: 'INV-1',
  noticeKind: 'water',
};

describe('every notification reads in every language', () => {
  it('ADR 0016/0035: every kind has a title and a line in all five languages, with no {mark} left', () => {
    for (const language of LANGUAGES) {
      const lang = langOf(language);
      for (const kind of INBOX_KINDS) {
        const text = inboxText(item({ kind, data: FACTS }), lang);
        expect(text.title, `${language} ${kind}`).not.toBe('');
        expect(text.detail, `${language} ${kind}`).not.toBe('');
        expect(`${text.title} ${text.detail}`, `${language} ${kind}`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe('consultations (O5, P5)', () => {
  it('O5: a stage names the service and the stage; a note says where to read it', () => {
    const stage = item({ data: { service: 'mortgage', stage: 'pre_approval', hasNote: true } });
    expect(inboxText(stage, en)).toMatchObject({
      title: 'Mortgage & Finance: Pre-approval',
      detail: 'There is a note for you on the request · JAD-AB12CD',
      needsYou: false,
    });
    expect(inboxText(item({ data: { service: 'leasing', stage: 'listed' } }), en).detail).toBe(
      'See the progress on the request · JAD-AB12CD',
    );
    // A stage the app has no words for yet (a newer server) still reads.
    expect(inboxText(item({ data: { service: 'interior-design', stage: 'concept_board' } }), en).title).toBe(
      'Interior Design: Concept board',
    );
  });

  it('P5: done asks to close the request; did not go ahead points at the reason', () => {
    const done = item({ kind: 'consultation_closed', data: { service: 'resale', outcome: 'done' } });
    expect(inboxText(done, en)).toMatchObject({ title: 'Resale: done', needsYou: true });
    const no = item({
      kind: 'consultation_closed',
      data: { service: 'golden-visa', outcome: 'did_not_proceed' },
    });
    expect(inboxText(no, en)).toMatchObject({
      title: 'Golden Visa: did not go ahead',
      detail: 'The reason is on the request · JAD-AB12CD',
    });
  });

  it('A4: on a consultation the reminder asks to close the request, not whether the work is done', () => {
    const reminder = (flow?: 'consultation' | 'report') =>
      inboxText(
        item({ kind: 'confirm_reminder', data: { hours: 24, ...(flow === undefined ? {} : { flow }) } }),
        en,
      );
    expect(reminder('consultation').title).toBe('Please close this request');
    expect(reminder('report').title).toBe('Please confirm the report');
    expect(reminder().title).toBe('Is the work done?');
    expect(
      inboxText(item({ kind: 'confirm_reminder', data: { flow: 'consultation' } }), langOf('fr')).title,
    ).toBe('Merci de clôturer cette demande');
    expect(inboxText(item({ kind: 'auto_closed', data: { flow: 'consultation' } }), en).detail).toBe(
      'Closed by itself after 72 hours · JAD-AB12CD',
    );
  });
});

describe('reports, snags and the provider office (O3)', () => {
  it('O3: the report title names its kind; a fixed snag asks the owner to check it', () => {
    expect(inboxText(item({ kind: 'report_ready', data: { reportKind: 'snagging' } }), en).title).toBe(
      'Your snagging report is ready',
    );
    expect(inboxText(item({ kind: 'report_ready' }), en).title).toBe('Your report is ready');
    expect(inboxText(item({ kind: 'snag_fixed' }), en)).toMatchObject({
      title: 'A snag was fixed',
      needsYou: true,
    });
  });

  it('O3: the handover team reads how many snags wait, or that one came back; it opens nothing in the app', () => {
    const toFix = item({ kind: 'snags_to_fix', data: { count: 3 } });
    expect(inboxText(toFix, en).title).toBe('Snags to fix: 3');
    expect(inboxText(item({ kind: 'snags_to_fix', data: { count: 1, reopened: true } }), en).title).toBe(
      'A snag needs fixing again',
    );
    expect(inboxTarget(toFix, 'partner_admin')).toBeNull();
    expect(inboxTarget(item({ kind: 'snag_reopened' }), 'partner')).toEqual({ jobId: 'r1' });
  });
});

describe('handover, education, statements and deliveries (O2, O5)', () => {
  it('O2: steps, the key collection and the end read with the step name and the day; they open My unit at the handover', () => {
    expect(inboxText(item({ kind: 'handover_step_done', data: { step: 'utilities' } }), en).title).toBe(
      'Handover: Utilities registered (DEWA / district cooling)',
    );
    const moved = item({
      kind: 'key_collection_booked',
      data: { date: '2026-12-01', slot: 'morning', moved: true },
    });
    expect(inboxText(moved, en)).toMatchObject({
      title: 'Key collection moved',
      detail: 'Tue 1 Dec · Morning (9:00 - 12:00) · JAD-AB12CD',
    });
    expect(inboxText(item({ kind: 'key_collection_booked' }), en).detail).toBe('JAD-AB12CD');
    expect(inboxTarget(moved, 'owner')).toEqual({ tab: 'unit', section: 'handover' });
    expect(inboxTarget(item({ kind: 'handover_complete' }), 'owner')).toEqual({
      tab: 'unit',
      section: 'handover',
    });
  });

  it('O5: session items give the new day and time and open Investor Education', () => {
    const session = (over: Partial<InboxItem>) => item({ requestId: null, ref: null, ...over });
    expect(
      inboxText(session({ kind: 'session_changed', data: { startsAt: THU_18, moved: true } }), en).detail,
    ).toBe('Now Thu 12 Nov · 18:00');
    expect(
      inboxText(session({ kind: 'session_changed', data: { startsAt: THU_18, moved: false } }), en).detail,
    ).toBe('See the new details');
    expect(inboxText(session({ kind: 'session_cancelled', data: { startsAt: THU_18 } }), en).detail).toBe(
      'Thu 12 Nov · 18:00 will not take place',
    );
    expect(inboxText(session({ kind: 'session_reminder', data: { startsAt: THU_18 } }), en).title).toBe(
      'Your education session is coming up',
    );
    expect(inboxTarget(session({ kind: 'session_reminder' }), 'owner')).toEqual({ screen: 'education' });
    expect(inboxTarget(session({ kind: 'book_sent' }), 'owner')).toEqual({ screen: 'education' });
  });

  it('a statement names its month and opens its request, or My unit documents; a delivery gives its day', () => {
    const statement = item({
      kind: 'statement_ready',
      requestId: null,
      ref: null,
      data: { period: '2026-11' },
    });
    expect(inboxText(statement, en)).toMatchObject({
      title: 'Your statement is ready',
      detail: 'November 2026',
    });
    expect(inboxTarget(statement, 'owner')).toEqual({ tab: 'unit', section: 'documents' });
    expect(inboxTarget({ ...statement, requestId: 'r9' }, 'owner')).toEqual({ requestId: 'r9' });
    expect(monthLabel('2026-11', 'fr-FR')).toBe('novembre 2026');
    const delivery = item({ kind: 'delivery_scheduled', data: { date: '2026-12-01', moved: true } });
    expect(inboxText(delivery, en)).toMatchObject({
      title: 'Delivery moved',
      detail: 'Tue 1 Dec · JAD-AB12CD',
    });
  });
});
