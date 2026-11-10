/** Partner queue, acknowledgement and escalation: R3, E4, E5, E6, E7, E17, S5, S6. */
import { describe, expect, it } from 'vitest';
import { runEscalationSweep } from '../src/jobs/escalation.js';
import { createLogger } from '../src/logger.js';
import { isVersionConflict, versionGuard } from '../src/requests/concurrency.js';
import { leak, raise, rows, world, type World } from './emergency-world.js';

const MIN = 60_000;

async function raised(w: World): Promise<string> {
  return (await (await raise(w, leak)).json<{ requestId: string }>()).requestId;
}

function ack(w: World, id: string, token: string, json: Record<string, unknown> = {}) {
  return w.h.request(`/api/partner/jobs/${id}/acknowledge`, {
    method: 'POST',
    token,
    json: {
      technicianId: 't-primary',
      arrivalWindowStart: w.h.clock + 30 * MIN,
      arrivalWindowEnd: w.h.clock + 90 * MIN,
      ...json,
    },
  });
}

async function queue(w: World, token: string) {
  return (await (await w.h.request('/api/partner/jobs', { token })).json<{ jobs: { id: string }[] }>()).jobs;
}

function sweepAt(w: World, minutesAfterRaise: number, raisedAt: number) {
  w.h.clock = raisedAt + minutesAfterRaise * MIN;
  return runEscalationSweep(
    w.h.env.DB,
    w.h.clock,
    createLogger({}, () => undefined),
  );
}

describe('partner job queue (R3)', () => {
  it('R3: the assigned partner sees the job with its clock; other partners do not', async () => {
    const w = await world();
    const id = await raised(w);
    const jobs = await queue(w, w.primaryToken);
    expect(jobs).toMatchObject([{ id, emergency: true, status: 'assigned', nextDueKind: 'emergency_ack' }]);
    expect(await queue(w, w.backupToken)).toEqual([]);
  });

  it('C-AZ-1: owners and tenants cannot open the partner queue', async () => {
    const w = await world();
    expect((await w.h.request('/api/partner/jobs', { token: w.tenantToken })).status).toBe(403);
  });
});

describe('acknowledging (E4)', () => {
  it('E4: the partner names the technician and window; on time counts as met; the resident is told', async () => {
    const w = await world();
    const id = await raised(w);
    w.h.clock += 10 * MIN;
    const res = await ack(w, id, w.primaryToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'scheduled', onTime: true });
    expect(rows(w, 'SELECT status, technician_id, next_due_kind FROM requests')).toEqual([
      { status: 'scheduled', technician_id: 't-primary', next_due_kind: 'emergency_on_site' },
    ]);
    expect(rows(w, 'SELECT partner_id, metric, outcome FROM sla_outcomes')).toEqual([
      { partner_id: 'p-primary', metric: 'emergency_ack', outcome: 'met' },
    ]);
    expect(
      rows(w, "SELECT recipient_user_id FROM notifications WHERE template = 'emergency_acknowledged'"),
    ).toEqual([{ recipient_user_id: w.tenant }]);
  });

  it('S5: a late acknowledgement is recorded as missed', async () => {
    const w = await world();
    const id = await raised(w);
    w.h.clock += 20 * MIN;
    expect(await (await ack(w, id, w.primaryToken)).json()).toMatchObject({ onTime: false });
    expect(rows(w, 'SELECT outcome FROM sla_outcomes')).toEqual([{ outcome: 'missed' }]);
  });

  it('an emergency is acknowledged once; another partner cannot acknowledge it', async () => {
    const w = await world();
    const id = await raised(w);
    expect((await ack(w, id, w.backupToken, { technicianId: 't-backup' })).status).toBe(404);
    expect((await ack(w, id, w.primaryToken)).status).toBe(200);
    expect((await ack(w, id, w.primaryToken)).status).toBe(409);
  });

  it('E17: a removed technician, or another partner’s technician, cannot be sent', async () => {
    const w = await world();
    const id = await raised(w);
    expect((await ack(w, id, w.primaryToken, { technicianId: 't-backup' })).status).toBe(400);
    w.h.sqlite
      .prepare(
        "UPDATE technicians SET status = 'removed', removed_reason = 'Conduct', removed_at = 1 WHERE id = 't-primary'",
      )
      .run();
    expect((await ack(w, id, w.primaryToken)).status).toBe(400);
  });

  it('E4: the arrival window must be real: up to 4 hours, starting within 24 hours', async () => {
    const w = await world();
    const id = await raised(w);
    const t = w.h.clock;
    for (const bad of [
      { arrivalWindowStart: t + 60 * MIN, arrivalWindowEnd: t + 30 * MIN },
      { arrivalWindowStart: t, arrivalWindowEnd: t + 5 * 60 * MIN },
      { arrivalWindowStart: t + 25 * 60 * MIN, arrivalWindowEnd: t + 26 * 60 * MIN },
      { arrivalWindowStart: t - 60 * MIN, arrivalWindowEnd: t + 30 * MIN },
    ]) {
      expect((await ack(w, id, w.primaryToken, bad)).status).toBe(400);
    }
  });
});

describe('escalation sweep (E5-E7)', () => {
  it('E5: no acknowledgement at 15 minutes → reminder to the primary', async () => {
    const w = await world();
    const raisedAt = w.h.clock;
    await raised(w);
    expect((await sweepAt(w, 14, raisedAt)).actions.remind_primary).toBe(0);
    expect((await sweepAt(w, 15, raisedAt)).actions.remind_primary).toBe(1);
    expect((await sweepAt(w, 16, raisedAt)).actions.remind_primary).toBe(0);
    expect(
      rows(w, "SELECT recipient_partner_id FROM notifications WHERE template = 'emergency_reminder'"),
    ).toEqual([{ recipient_partner_id: 'p-primary' }]);
  });

  it('E6: emergency moves to backup after 30 min; on-call is alerted; the miss counts against the primary', async () => {
    const w = await world();
    const raisedAt = w.h.clock;
    const id = await raised(w);
    await sweepAt(w, 15, raisedAt);
    expect((await sweepAt(w, 30, raisedAt)).actions.move_to_backup).toBe(1);
    expect(rows(w, 'SELECT partner_id, escalation FROM requests')).toEqual([
      { partner_id: 'p-backup', escalation: 'moved_to_backup' },
    ]);
    expect(rows(w, 'SELECT partner_id, outcome FROM sla_outcomes')).toEqual([
      { partner_id: 'p-primary', outcome: 'missed' },
    ]);
    expect(rows(w, "SELECT template FROM notifications WHERE recipient_kind = 'on_call'")).toEqual([
      { template: 'emergency_backup_alert' },
    ]);
    expect(await queue(w, w.primaryToken)).toEqual([]);
    expect((await queue(w, w.backupToken)).map((j) => j.id)).toEqual([id]);
    // The backup's own 15 minutes start at the move: acknowledging 10 minutes later is on time.
    w.h.clock += 10 * MIN;
    expect(await (await ack(w, id, w.backupToken, { technicianId: 't-backup' })).json()).toMatchObject({
      onTime: true,
    });
  });

  it('E7: backup also fails → on-call takes over, building FM and the owner are informed', async () => {
    const w = await world();
    const raisedAt = w.h.clock;
    await raised(w);
    await sweepAt(w, 30, raisedAt);
    expect((await sweepAt(w, 44, raisedAt)).actions.call_on_call).toBe(0);
    expect((await sweepAt(w, 45, raisedAt)).actions.call_on_call).toBe(1);
    expect(rows(w, 'SELECT escalation FROM requests')).toEqual([{ escalation: 'on_call' }]);
    expect(rows(w, 'SELECT partner_id FROM sla_outcomes ORDER BY partner_id')).toEqual([
      { partner_id: 'p-backup' },
      { partner_id: 'p-primary' },
    ]);
    expect(
      rows(
        w,
        "SELECT recipient_kind FROM notifications WHERE template IN ('emergency_on_call', 'emergency_owner_update') ORDER BY recipient_kind",
      ),
    ).toEqual([{ recipient_kind: 'building_fm' }, { recipient_kind: 'on_call' }, { recipient_kind: 'user' }]);
    expect((await sweepAt(w, 120, raisedAt)).checked).toBe(0);
  });

  it('E4: an acknowledged emergency never escalates', async () => {
    const w = await world();
    const raisedAt = w.h.clock;
    const id = await raised(w);
    await ack(w, id, w.primaryToken);
    const result = await sweepAt(w, 60, raisedAt);
    expect(result.checked).toBe(0);
  });

  it('a change based on an out-of-date version is refused as a whole (no partial history)', async () => {
    const w = await world();
    const id = await raised(w);
    const db = w.h.env.DB;
    const before = rows(w, 'SELECT count(*) AS n FROM request_events');
    const stale = db.batch([
      // The history row comes first, to prove it is rolled back when the guarded update fails.
      db
        .prepare(
          "INSERT INTO request_events (id, request_id, at, actor_role, kind) VALUES ('ev-x', ?, 1, 'system', 'note')",
        )
        .bind(id),
      db.prepare(`UPDATE requests SET escalation = 'reminded', ${versionGuard} WHERE id = ?`).bind(99, id),
    ]);
    await expect(stale).rejects.toSatisfy(isVersionConflict);
    expect(rows(w, 'SELECT count(*) AS n FROM request_events')).toEqual(before);
    expect(rows(w, 'SELECT escalation, version FROM requests')).toEqual([{ escalation: 'none', version: 1 }]);
  });
});
