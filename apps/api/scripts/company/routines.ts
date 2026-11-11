/**
 * What the offices do every week or month: JAD+ Admin fills the on-call rota a week ahead (the week after next
 * is left open, so Needs action shows the gap), the maintenance partners name their after-hours technician,
 * Harbor Property Management uploads last month's statements (one is missing for the latest month, so
 * "statements to upload" shows), and a technician books leave for this week.
 */
import { dubaiDate } from '@jadplus/shared';
import { post, put, upload } from './actors.js';
import { provider, type Company } from './company.js';
import { demoPdf } from './files.js';
import { addDays, dubaiTime, mondayOf } from './sim.js';

function staffIds(c: Company): { admins: string[]; viewers: string[] } {
  const rows = c.w.db
    .prepare(
      "SELECT user_id, role FROM user_roles WHERE role IN ('jad_admin', 'jad_viewer') AND revoked_at IS NULL ORDER BY granted_at, user_id",
    )
    .all() as { user_id: string; role: string }[];
  return {
    admins: rows.filter((r) => r.role === 'jad_admin').map((r) => r.user_id),
    viewers: rows.filter((r) => r.role === 'jad_viewer').map((r) => r.user_id),
  };
}

async function rota(c: Company, week: string, n: number): Promise<void> {
  const { admins, viewers } = staffIds(c);
  const first = admins[n % admins.length];
  const second = [...admins, ...viewers].filter((id) => id !== first)[
    n % (admins.length + viewers.length - 1)
  ];
  if (first === undefined || second === undefined) return;
  await put(c.w, c.admin, `/api/admin/on-call/${week}`, { first, second });
}

async function afterHours(c: Company, week: string, n: number): Promise<void> {
  for (const key of ['fixers', 'gulf']) {
    const p = provider(c, key);
    const t = p.techs[n % p.techs.length];
    if (t !== undefined)
      await put(c.w, p.office, '/api/partner/after-hours', { weekStarting: week, technicianId: t.id });
  }
}

/** Every Monday morning: the rota and after-hours for the week after. The first run also covers this week. */
export async function weekly(c: Company): Promise<void> {
  let week = mondayOf(c.sim.now);
  let n = 0;
  await rota(c, week, n);
  await afterHours(c, week, n);
  for (;;) {
    n += 1;
    await rota(c, addDays(week, 7), n);
    await afterHours(c, addDays(week, 7), n);
    week = addDays(week, 7);
    await c.sim.until(dubaiTime(week, 9));
  }
}

/** "YYYY-MM" of the month after `month`. */
function nextMonth(month: string): string {
  return addDays(`${month}-28`, 6).slice(0, 7);
}

/** On the 3rd of each month: last month's statement for each managed unit (all but one, the latest month). */
export async function statements(c: Company, managed: readonly string[], since: string): Promise<void> {
  const pm = provider(c, 'pm');
  const lastMonthOfRun = dubaiDate(c.sim.end).slice(0, 7);
  let month = dubaiDate(c.sim.now).slice(0, 7);
  if (dubaiTime(`${month}-03`, 10) < c.sim.now) month = nextMonth(month);
  for (;;) {
    await c.sim.until(dubaiTime(`${month}-03`, 10 + c.r.int(0, 6)));
    const covered = addDays(`${month}-01`, -1).slice(0, 7);
    if (covered >= since.slice(0, 7)) {
      for (const [i, id] of managed.entries()) {
        if (month === lastMonthOfRun && i === managed.length - 1) continue;
        const pdf = demoPdf(`Monthly statement ${covered}`);
        await upload(
          c.w,
          pm.office,
          `/api/partner/managed-units/${id}/statements?month=${covered}`,
          pdf,
          'application/pdf',
        );
        await c.sim.wait(c.r.int(5, 40) * 60_000);
      }
    }
    month = nextMonth(month);
  }
}

/** A Demo Fixers technician books leave for this week; earlier, a Gulf Shield technician was off sick for 3 days. */
export async function leave(c: Company, who: 'fixers' | 'gulf'): Promise<void> {
  const p = provider(c, who);
  const t = p.techs[who === 'fixers' ? 2 : 1] ?? p.techs[0];
  if (t === undefined) return;
  // "This week" is the week of the demo's today (the end of the run).
  const monday = mondayOf(c.sim.end);
  const today = dubaiDate(c.sim.now);
  const entry =
    who === 'fixers'
      ? { from: monday, to: addDays(monday, 4), reason: 'leave' }
      : { from: today, to: addDays(today, 2), reason: 'sick' };
  await post(c.w, p.office, `/api/partner/technicians/${t.id}/unavailable`, entry);
}
