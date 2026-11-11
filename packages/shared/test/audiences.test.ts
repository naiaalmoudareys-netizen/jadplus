/** Who is told beyond the request's own people (ADR 0027): V1, E12, E5-E7. */
import { describe, expect, it } from 'vitest';
import { afterHoursWeek, contactsCovering, noticeAudience } from '../src/audiences.js';
import { renderMessage } from '../src/messages.js';

const B = { project: 'JAD 288', building: 'Building B' };

describe('building notice audience (V1)', () => {
  const homes = [
    { userId: 'owner-b', ...B },
    { userId: 'tenant-b', ...B },
    { userId: 'owner-c', project: 'JAD 288', building: 'Building C' },
    { userId: 'owner-b', project: 'JAD 288', building: 'Building C' },
    { userId: 'owner-unnamed', project: 'JAD 288', building: null },
    { userId: 'owner-other', project: 'JAD 188', building: 'Building B' },
    { userId: 'owner-no-project', project: null, building: null },
  ];

  it('V1: a building notice reaches the owners and tenants of that building only, each once', () => {
    expect(noticeAudience(B, homes)).toEqual(['owner-b', 'tenant-b']);
  });

  it('V1: a project-wide notice reaches everyone in the project, whatever their building', () => {
    expect(noticeAudience({ project: 'JAD 288', building: null }, homes)).toEqual([
      'owner-b',
      'tenant-b',
      'owner-c',
      'owner-unnamed',
    ]);
  });
});

describe('building management alerts (E12)', () => {
  it("E12: the unit's own building contacts and the project-wide ones, never another building's", () => {
    const contacts = [
      { id: 'fm-b', ...B },
      { id: 'fm-project', project: 'JAD 288', building: null },
      { id: 'fm-c', project: 'JAD 288', building: 'Building C' },
      { id: 'fm-other', project: 'JAD 188', building: null },
    ];
    expect(contactsCovering(contacts, B).map((c) => c.id)).toEqual(['fm-b', 'fm-project']);
    expect(contactsCovering(contacts, { project: 'JAD 999', building: null })).toEqual([]);
  });

  it('E12: building management is told what was reported, not asked to acknowledge in JAD+', () => {
    const m = renderMessage('emergency_new_job', 'building_fm', {
      ref: 'JAD-7KQ4M2',
      type: 'water_leak',
      arrival: null,
    });
    expect(m.subject).toBe('JAD+ BUILDING ALERT JAD-7KQ4M2');
    expect(m.body).not.toMatch(/acknowledge/i);
  });
});

describe('after-hours contact (E5-E7)', () => {
  // Monday 9 Nov 2026: 12:00 Dubai is working time, 22:00 is not; Saturday is never.
  const noon = Date.UTC(2026, 10, 9, 8);
  const night = Date.UTC(2026, 10, 9, 18);
  const saturday = Date.UTC(2026, 10, 14, 8);

  it('E5-E7: out of hours, a new emergency and its reminder also go to that week’s after-hours contact', () => {
    expect(afterHoursWeek({ recipientKind: 'partner', template: 'emergency_new_job', at: night })).toBe(
      '2026-11-09',
    );
    expect(afterHoursWeek({ recipientKind: 'partner', template: 'emergency_reminder', at: saturday })).toBe(
      '2026-11-09',
    );
  });

  it('E5-E7: during working hours the alert line and office are enough', () => {
    expect(afterHoursWeek({ recipientKind: 'partner', template: 'emergency_new_job', at: noon })).toBeNull();
  });

  it('E5-E7: only partner alerts that ask the partner to act, never on-call or resident messages', () => {
    expect(afterHoursWeek({ recipientKind: 'on_call', template: 'emergency_on_call', at: night })).toBeNull();
    expect(afterHoursWeek({ recipientKind: 'user', template: 'emergency_new_job', at: night })).toBeNull();
    expect(
      afterHoursWeek({ recipientKind: 'partner', template: 'emergency_acknowledged', at: night }),
    ).toBeNull();
  });

  it('E5-E7: just after midnight on Monday Dubai time belongs to the new week', () => {
    // 00:30 Dubai on Monday 16 Nov = 20:30 UTC on Sunday 15 Nov.
    expect(
      afterHoursWeek({
        recipientKind: 'partner',
        template: 'emergency_new_job',
        at: Date.UTC(2026, 10, 15, 20, 30),
      }),
    ).toBe('2026-11-16');
  });
});
