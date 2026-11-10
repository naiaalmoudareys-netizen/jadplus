/** Notifications in the person's language (ADR 0019): wording per kind, Dubai-day groups, times, the badge. */
import type { InboxItem } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { langOf } from '../src/i18n/lang.js';
import { visitStatusLabel } from '../src/jobs/journey.js';
import { badgeText, inboxGroups, inboxTarget, inboxText, inboxTime } from '../src/inbox/wording.js';

const en = langOf('en');
const fr = langOf('fr');
const ar = langOf('ar');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = Date.UTC(2026, 10, 10, 6, 0, 0); // 10:00 Dubai, Tue 10 Nov 2026
const WED_9 = Date.UTC(2026, 10, 11, 5, 0); // 09:00 Dubai, Wed 11 Nov
const WED_12 = Date.UTC(2026, 10, 11, 8, 0);

const item = (over: Partial<InboxItem>): InboxItem => ({
  id: 'i1',
  kind: 'visit_booked',
  requestId: 'r1',
  tenancyId: null,
  ref: 'JAD-AB12CD',
  at: NOW - 5 * MINUTE,
  read: false,
  data: {},
  ...over,
});

describe('A8: visit notifications', () => {
  it('visit_tomorrow reads "Visit tomorrow" with the day, window and reference', () => {
    const text = inboxText(
      item({ kind: 'visit_tomorrow', data: { windowStart: WED_9, windowEnd: WED_12 } }),
      en,
    );
    expect(text).toEqual({
      title: 'Visit tomorrow',
      detail: 'Wed 11 Nov · 09:00-12:00 · JAD-AB12CD',
      icon: 'calendar-outline',
      needsYou: false,
      urgent: false,
    });
  });

  it('on_the_way gives the arrival window; without a window only the reference', () => {
    const text = inboxText(item({ kind: 'on_the_way', data: { windowStart: WED_9, windowEnd: WED_12 } }), en);
    expect(text.title).toBe('Technician on the way');
    expect(text.detail).toBe('Arriving 09:00-12:00 · JAD-AB12CD');
    expect(text.icon).toBe('car-outline');
    expect(inboxText(item({ kind: 'visit_booked' }), en).detail).toBe('JAD-AB12CD');
  });

  it('A7: no_access says a new visit follows within 24 hours', () => {
    const text = inboxText(item({ kind: 'no_access', data: { hours: 24 } }), en);
    expect(text.detail).toBe('A new visit will be booked within 24 hours · JAD-AB12CD');
  });
});

describe('L4, A2, A4, E8: decisions and closings', () => {
  it('L4: quote_received shows the amount and asks for approval', () => {
    const text = inboxText(item({ kind: 'quote_received', data: { amountAed: 450 } }), en);
    expect(text.title).toBe('New quote: AED 450');
    expect(text.detail).toBe('Waiting for your approval · JAD-AB12CD');
    expect(text.needsYou).toBe(true);
    expect(inboxText(item({ kind: 'quote_received' }), en).title).toBe('New quote');
  });

  it('A2: quote_reminder says it expires in 4 days (reminded on day 10 of 14)', () => {
    const text = inboxText(item({ kind: 'quote_reminder', data: { amountAed: 1250.5 } }), en);
    expect(text.title).toBe('Quote waiting: AED 1,250.50');
    expect(text.detail).toBe('It expires in 4 days · JAD-AB12CD');
  });

  it('A4: confirm_reminder says it closes by itself after 72 hours, whatever reminder it is', () => {
    const text = inboxText(item({ kind: 'confirm_reminder', data: { hours: 48 } }), en);
    expect(text.title).toBe('Is the work done?');
    expect(text.detail).toBe('It closes by itself after 72 hours · JAD-AB12CD');
  });

  it('E8: make_safe_done gives the amount', () => {
    expect(inboxText(item({ kind: 'make_safe_done', data: { amountAed: 480 } }), en).title).toBe(
      'Urgent work: AED 480',
    );
  });

  it('is written in the person language (French, Arabic)', () => {
    const quote = item({ kind: 'quote_received', data: { amountAed: 450 } });
    expect(inboxText(quote, fr).title).toBe('Nouveau devis : AED 450');
    expect(inboxText(quote, fr).detail).toBe('En attente de votre accord · JAD-AB12CD');
    const done = inboxText(item({ kind: 'confirm_reminder' }), fr);
    expect(done.title).toBe('Les travaux sont-ils terminés ?');
    expect(done.detail).toBe('Clôture automatique après 72 heures · JAD-AB12CD');
    expect(inboxText(item({ kind: 'work_done' }), ar).title).toBe('تم إنجاز العمل');
  });
});

describe('A1, R2, U4, U5: tenants and approvals', () => {
  const tenancy = (over: Partial<InboxItem>): InboxItem =>
    item({ requestId: null, tenancyId: 't1', ref: null, ...over });

  it('A1: the owner is asked to approve a tenant request; the tenant hears the answer', () => {
    const asked = inboxText(item({ kind: 'approval_needed' }), en);
    expect(asked).toEqual({
      title: 'Your tenant asked for a service',
      detail: 'Waiting for your approval · JAD-AB12CD',
      icon: 'person-outline',
      needsYou: true,
      urgent: false,
    });
    expect(inboxText(item({ kind: 'request_declined' }), en).title).toBe('The owner declined your request');
    expect(inboxText(item({ kind: 'request_approved' }), fr).title).toBe(
      'Le propriétaire a accepté votre demande',
    );
  });

  it('R2/U4/U5: tenancy items show the end date and no reference', () => {
    expect(inboxText(tenancy({ kind: 'tenancy_invited', data: { endsOn: '2027-11-14' } }), en).detail).toBe(
      'Until 14 Nov 2027. Accept it on Home',
    );
    expect(
      inboxText(tenancy({ kind: 'tenancy_ending', data: { endsOn: '2026-12-31', days: 30 } }), en),
    ).toMatchObject({ title: 'Tenancy ending soon', detail: 'Ends on 31 Dec 2026' });
    expect(inboxText(tenancy({ kind: 'tenancy_ended', data: { endsOn: '2026-12-31' } }), en).detail).toBe(
      'Access ended on 31 Dec 2026',
    );
    expect(inboxText(tenancy({ kind: 'tenancy_ended' }), en).detail).toBe(
      'Access to the residence has ended',
    );
  });

  it('a tenancy item opens My unit for an owner and Home for a tenant; a request item its request', () => {
    expect(inboxTarget(tenancy({ kind: 'tenancy_ended' }), 'owner')).toEqual({ tab: 'unit' });
    expect(inboxTarget(tenancy({ kind: 'tenancy_invited' }), 'tenant')).toEqual({ tab: 'home' });
    expect(inboxTarget(item({ kind: 'approval_needed' }), 'owner')).toEqual({ requestId: 'r1' });
  });
});

describe('messages on a request (every role)', () => {
  it('message_received reads "New message" and opens the request for residents, the job for partners', () => {
    const message = item({ kind: 'message_received' });
    expect(inboxText(message, en)).toMatchObject({
      title: 'New message',
      detail: 'Open it to read and reply · JAD-AB12CD',
      icon: 'chatbubble-outline',
      urgent: false,
    });
    expect(inboxText(message, ar).title).toBe('رسالة جديدة');
    expect(inboxTarget(message, 'owner')).toEqual({ requestId: 'r1' });
    expect(inboxTarget(message, 'tenant')).toEqual({ requestId: 'r1' });
    expect(inboxTarget(message, 'partner')).toEqual({ jobId: 'r1' });
  });
});

describe('ADR 0024: partner notifications, worded for the technician', () => {
  it('E1/R3: job_new is a new job; an emergency reads "New emergency" in urgent red', () => {
    expect(inboxText(item({ kind: 'job_new' }), en)).toEqual({
      title: 'New job',
      detail: 'Open it to see the details · JAD-AB12CD',
      icon: 'construct-outline',
      needsYou: true,
      urgent: false,
    });
    expect(inboxText(item({ kind: 'job_new', data: { urgent: true } }), en)).toEqual({
      title: 'New emergency',
      detail: 'Acknowledge it now · JAD-AB12CD',
      icon: 'warning-outline',
      needsYou: true,
      urgent: true,
    });
    expect(inboxText(item({ kind: 'job_new', data: { urgent: true } }), fr).title).toBe('Nouvelle urgence');
  });

  it('E5: job_reminder asks to acknowledge now, always urgent', () => {
    expect(inboxText(item({ kind: 'job_reminder' }), en)).toMatchObject({
      title: 'Acknowledge now',
      urgent: true,
    });
  });

  it('E6: job_moved_away says it went to the backup partner and opens nothing', () => {
    const moved = item({ kind: 'job_moved_away' });
    expect(inboxText(moved, en)).toMatchObject({ title: 'Moved to the backup partner', urgent: false });
    expect(inboxTarget(moved, 'partner')).toBeNull();
    expect(inboxTarget(moved, 'partner_admin')).toBeNull();
  });

  it('L4, A3, A5, E10, S5: quotes, confirmation, reopening, rating and cancelling', () => {
    expect(inboxText(item({ kind: 'quote_approved' }), en).title).toBe(
      'Quote approved: you can book the work',
    );
    expect(inboxText(item({ kind: 'quote_declined' }), en).detail).toBe(
      'You may send one revised quote · JAD-AB12CD',
    );
    expect(inboxText(item({ kind: 'work_confirmed' }), en).title).toBe('Work confirmed');
    expect(inboxText(item({ kind: 'work_reopened' }), en)).toMatchObject({
      title: 'The resident says it is not done',
      needsYou: true,
    });
    expect(inboxText(item({ kind: 'job_rated', data: { stars: 5 } }), en).title).toBe('Rated 5 ★');
    expect(inboxText(item({ kind: 'job_rated' }), en).title).toBe('Job rated');
    expect(inboxText(item({ kind: 'job_cancelled' }), en).title).toBe('Job cancelled');
    expect(inboxText(item({ kind: 'job_assigned_to_you' }), en).title).toBe('Job assigned to you');
  });

  it('R3: a partner item opens the job page, for the technician and the partner office', () => {
    expect(inboxTarget(item({ kind: 'job_new' }), 'partner')).toEqual({ jobId: 'r1' });
    expect(inboxTarget(item({ kind: 'work_reopened' }), 'partner_admin')).toEqual({ jobId: 'r1' });
    expect(inboxTarget(item({ kind: 'job_new', requestId: null }), 'partner')).toBeNull();
  });
});

describe('grouping and times', () => {
  it('groups by Dubai day: Today, Yesterday, Earlier, newest first, empty groups left out', () => {
    // 01:00 Dubai today is still "today"; 23:00 Dubai yesterday is "yesterday" although UTC says otherwise.
    const today = item({ id: 'a', at: Date.UTC(2026, 10, 9, 21, 0) });
    const later = item({ id: 'b', at: NOW - MINUTE });
    const yesterday = item({ id: 'c', at: Date.UTC(2026, 10, 9, 19, 0) });
    const old = item({ id: 'd', at: NOW - 5 * 24 * HOUR });
    const groups = inboxGroups([old, today, yesterday, later], NOW);
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ['today', ['b', 'a']],
      ['yesterday', ['c']],
      ['earlier', ['d']],
    ]);
    expect(inboxGroups([old], NOW).map((g) => g.key)).toEqual(['earlier']);
  });

  it('words the time: just now, minutes, the clock, then the day', () => {
    expect(inboxTime(NOW - 20_000, NOW, en)).toBe('Just now');
    expect(inboxTime(NOW - 12 * MINUTE, NOW, en)).toBe('12 min ago');
    expect(inboxTime(NOW - 12 * MINUTE, NOW, fr)).toBe('Il y a 12 min');
    expect(inboxTime(NOW - 3 * HOUR, NOW, en)).toBe('07:00');
    expect(inboxTime(Date.UTC(2026, 10, 9, 19, 0), NOW, en)).toBe('23:00');
    expect(inboxTime(Date.UTC(2026, 10, 7, 6, 0), NOW, en)).toBe('Sat 7 Nov');
  });

  it('the bell shows nothing at zero and "9+" above nine', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(3)).toBe('3');
    expect(badgeText(9)).toBe('9');
    expect(badgeText(10)).toBe('9+');
  });
});

describe('A8: where the visit stands', () => {
  it('is worded for the partner and for the resident', () => {
    expect(visitStatusLabel('on_the_way', 'partner', en.t)).toBe('On the way');
    expect(visitStatusLabel('on_the_way', 'resident', en.t)).toBe('Technician on the way');
    expect(visitStatusLabel('on_the_way', 'resident', fr.t)).toBe('Le technicien est en route');
  });
});
