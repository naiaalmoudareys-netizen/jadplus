/**
 * Demo data for the handover checklist and investor education (O2, O5; ADR 0033), part of the LOCAL demo seed
 * (seed-local.ts): a handover request for the demo owner's second unit, held by the fictional handover team,
 * with its checklist in progress (three steps done, key collection booked), and two upcoming education sessions.
 * Added once (INSERT OR IGNORE); the sessions are moved forward on every run so they stay upcoming.
 */
import { encryptField, toHex, type Keys } from '../src/crypto.ts';

const DAY = 86_400_000;
const HOUR = 3_600_000;
// The script runs in plain Node, which cannot load packages/shared's TypeScript, so the step list is written out
// here; it is HANDOVER_STEPS, and the database CHECK (migration 0030) refuses any other step.
const HANDOVER_STEPS = [
  'final_payment',
  'documents',
  'snagging',
  'utilities',
  'service_charges',
  'key_appointment',
  'keys_collected',
] as const;
const DUBAI_OFFSET = 4 * HOUR;
const dubaiDate = (at: number): string => new Date(at + DUBAI_OFFSET).toISOString().slice(0, 10);
const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const sqlText = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** The next Monday-to-Friday Dubai date at least `days` after today. */
function workingDayAfter(today: string, days: number): string {
  let date = addDays(today, days);
  for (let i = 0; i < 7; i += 1) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return date;
    date = addDays(date, 1);
  }
  return date;
}

export async function handoverEducationSeed(keys: Keys, now: number, unit: string): Promise<string[]> {
  const requestId = 'demo-handover-1';
  const checklistId = 'demo-handover-checklist-1';
  const team = 'demo-harbor-pm';
  const office = 'demo-harbor-pm-office';
  const done = new Set(['final_payment', 'documents', 'snagging', 'key_appointment']);
  const note = await encryptField(
    keys,
    'Your handover pack is ready to sign at key collection.',
    `handover_steps.note:${checklistId}:documents`,
  );
  const keyDate = workingDayAfter(dubaiDate(now), 10);
  // Sessions at 18:00 Dubai (14:00 UTC) in about one and three weeks.
  const evening = (days: number): number => Date.parse(`${addDays(dubaiDate(now), days)}T14:00:00Z`);
  const sessions = [
    {
      id: 'demo-edu-1',
      title: 'Investing in Dubai off-plan',
      description: 'How payment plans, handover and resale work, with time for your questions.',
      startsAt: evening(7),
      mode: 'in_person',
      place: 'JAD Global office, Business Bay, Dubai',
      seats: 30,
    },
    {
      id: 'demo-edu-2',
      title: 'Renting out your home',
      description: 'Leasing, Ejari and service charges explained for first-time landlords.',
      startsAt: evening(21),
      mode: 'online',
      place: 'https://meet.example.com/jadplus-demo',
      seats: 100,
    },
  ];
  return [
    `INSERT OR IGNORE INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, raised_by_user_id, raised_by_role,
      description, is_emergency, status, partner_id, created_at, updated_at, status_changed_at)
      VALUES (${sqlText(requestId)}, 'JAD-DHAND1', 'handover', '${unit}', 'demo-owner', 'demo-owner', 'owner',
        'Please guide me from completion to key collection.', 0, 'assigned', ${sqlText(team)},
        ${now - 14 * DAY}, ${now - 14 * DAY}, ${now - 14 * DAY});`,
    `INSERT OR IGNORE INTO handover_checklists (id, request_id, sf_unit_id, started_at, started_by, key_date, key_slot, updated_at)
      VALUES (${sqlText(checklistId)}, ${sqlText(requestId)}, '${unit}', ${now - 13 * DAY}, ${sqlText(office)},
        '${keyDate}', 'morning', ${now - DAY});`,
    ...HANDOVER_STEPS.map((step, i) => {
      const at = now - (12 - i) * DAY;
      const isDone = done.has(step);
      const noteSql = step === 'documents' ? `X'${toHex(note)}'` : 'NULL';
      return `INSERT OR IGNORE INTO handover_steps (checklist_id, step, done_at, done_by, note_enc, updated_at)
        VALUES (${sqlText(checklistId)}, '${step}', ${isDone ? String(at) : 'NULL'}, ${isDone ? sqlText(office) : 'NULL'},
          ${noteSql}, ${String(at)});`;
    }),
    ...sessions.map(
      (s) => `INSERT INTO education_sessions
        (id, title, description, starts_at, ends_at, mode, place, seats, created_at, created_by, updated_at)
        VALUES (${sqlText(s.id)}, ${sqlText(s.title)}, ${sqlText(s.description)}, ${String(s.startsAt)},
          ${String(s.startsAt + 2 * HOUR)}, '${s.mode}', ${sqlText(s.place)}, ${String(s.seats)}, ${String(now)},
          'demo-admin', ${String(now)})
        ON CONFLICT (id) DO UPDATE SET starts_at = excluded.starts_at, ends_at = excluded.ends_at,
          updated_at = excluded.updated_at, cancelled_at = NULL;`,
    ),
  ];
}
