/**
 * Residents told when JAD+ acts, after-hours partner contacts and building management alerts (ADR 0027):
 * E5-E7, E12, E13, V1, C-AZ-2, C-PD-2, C-LOG-1.
 */
import { inboxResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { fanOut } from '../src/delivery/fan-out.js';
import { runDelivery } from '../src/delivery/run.js';
import type { OutgoingMessage, Senders } from '../src/delivery/senders.js';
import { runEscalationSweep } from '../src/jobs/escalation.js';
import { createLogger } from '../src/logger.js';
import { NOW } from './db.js';
import { EMAILS, leak, raise, rows, world, type World } from './emergency-world.js';

const DAY = 86_400_000;
/** 22:00 Dubai on Monday 9 Nov 2026: outside working hours. NOW (12:00 Dubai) is inside. */
const NIGHT = NOW + 10 * 3_600_000;
const ADMIN = 'demo@jadplus.ae';

const post = (w: World, path: string, token: string, json: object = {}) =>
  w.h.request(path, { method: 'POST', token, json });
const items = async (w: World, token: string) =>
  inboxResponse.parse(await (await w.h.request('/api/me/inbox', { token })).json()).items;
const kinds = async (w: World, token: string) => (await items(w, token)).map((i) => i.kind);

async function admin(w: World): Promise<string> {
  await w.h.addUser({ email: ADMIN, roles: ['jad_admin'] });
  return w.h.signIn(ADMIN, 'console');
}

async function emergency(w: World, json: object = leak): Promise<string> {
  const res = await raise(w, { ...leak, ...json });
  expect(res.status).toBe(201);
  return (await res.json<{ requestId: string }>()).requestId;
}

interface Sent extends OutgoingMessage {
  readonly channel: string;
}

function providers(): { senders: Senders; sent: Sent[] } {
  const sent: Sent[] = [];
  const accept = (channel: string) => (_env: unknown, m: OutgoingMessage) => {
    sent.push({ channel, ...m });
    return Promise.resolve({ providerRef: null });
  };
  return { sent, senders: { sms: accept('sms'), email: accept('email') } };
}

async function deliver(w: World): Promise<Sent[]> {
  const p = providers();
  const logs: string[] = [];
  await runDelivery(
    w.h.env,
    p.senders,
    w.h.clock,
    createLogger({}, (line) => logs.push(line)),
  );
  // C-LOG-1: no address ever reaches the logs.
  for (const m of p.sent) expect(logs.join('\n')).not.toContain(m.to);
  return p.sent;
}

describe('residents are told when JAD+ acts on their request (ADR 0027)', () => {
  it('JAD+ cancels: the owner and the tenant who raised it are told; the partner gets its own item', async () => {
    const w = await world();
    const token = await admin(w);
    const id = await emergency(w);
    expect(
      (await post(w, `/api/admin/requests/${id}/cancel`, token, { reason: 'Raised twice.' })).status,
    ).toBe(200);
    expect(await kinds(w, w.ownerToken)).toEqual(['request_cancelled_by_jad']);
    expect(await kinds(w, w.tenantToken)).toEqual(['request_cancelled_by_jad']);
    expect((await kinds(w, w.primaryToken))[0]).toBe('job_cancelled');
    // Kind and facts only: the staff reason never reaches the residents.
    expect(JSON.stringify(rows(w, 'SELECT data FROM inbox'))).not.toContain('twice');
  });

  it('E6: JAD+ moves the job: residents told, old partner told it moved away, new partner gets the job', async () => {
    const w = await world();
    const token = await admin(w);
    const id = await emergency(w);
    const res = await post(w, `/api/admin/requests/${id}/reassign`, token, {
      partnerId: 'p-backup',
      reason: 'Primary has no technician free.',
    });
    expect(res.status).toBe(200);
    expect(await kinds(w, w.ownerToken)).toEqual(['request_moved_by_jad']);
    expect(await kinds(w, w.tenantToken)).toEqual(['request_moved_by_jad']);
    expect(await kinds(w, w.primaryToken)).toEqual(['job_moved_away']);
    expect((await kinds(w, w.backupToken))[0]).toBe('job_new');
  });

  it('E13: JAD+ reclassifies an emergency as routine: both residents told, nobody else', async () => {
    const w = await world();
    const token = await admin(w);
    const id = await emergency(w);
    expect(
      (await post(w, `/api/admin/requests/${id}/reclassify`, token, { reason: 'Slow drip only.' })).status,
    ).toBe(200);
    const [item] = await items(w, w.tenantToken);
    expect(item).toMatchObject({ kind: 'request_reclassified', requestId: id, data: {} });
    expect(await kinds(w, w.ownerToken)).toEqual(['request_reclassified']);
    expect(await kinds(w, w.primaryToken)).toEqual(['job_new']);
  });
});

describe('building notices reach the residents (V1)', () => {
  const notice = {
    project: 'JAD 288',
    building: 'Building B',
    kind: 'water',
    title: 'Water shut-off',
    body: 'Tank cleaning on Tuesday morning.',
    startsAt: NOW + DAY,
    endsAt: NOW + 2 * DAY,
  };

  async function neighbour(w: World, building: string): Promise<string> {
    const id = await w.h.addUser({ email: `owner.${building.slice(-1)}@example.com`, roles: ['owner'] });
    w.h.sqlite
      .prepare(
        `INSERT INTO owner_units (user_id, sf_unit_id, sf_deal_id, unit_name, project, building, deal_role, synced_at)
         VALUES (?, ?, '006000000000009AAA', 'JAD288-X01', 'JAD 288', ?, 'Buyer', ?)`,
      )
      .run(id, `a0X00000000000${building.slice(-1)}AAA`, building, NOW);
    return id;
  }

  const itemsOf = (w: World, userId: string) =>
    rows(w, 'SELECT kind, data FROM inbox WHERE user_id = ?', userId) as { kind: string; data: string }[];

  it('V1: every owner and current tenant in the building gets one item with the notice kind only', async () => {
    const w = await world();
    const token = await admin(w);
    const other = await neighbour(w, 'Building C');
    expect((await post(w, '/api/admin/notices', token, notice)).status).toBe(201);
    for (const t of [w.ownerToken, w.tenantToken]) {
      const [item] = await items(w, t);
      expect(item).toMatchObject({
        kind: 'building_notice',
        requestId: null,
        tenancyId: null,
        ref: null,
        data: { noticeKind: 'water' },
      });
    }
    expect(itemsOf(w, other)).toEqual([]);
    expect(rows(w, "SELECT detail FROM audit_log WHERE action = 'building_notice_published'")).toEqual([
      {
        detail: JSON.stringify({
          project: 'JAD 288',
          building: 'Building B',
          kind: 'water',
          residentsTold: 2,
        }),
      },
    ]);
  });

  it('V1: a project-wide notice reaches every building; a withdrawn notice leaves the inbox', async () => {
    const w = await world();
    const token = await admin(w);
    const other = await neighbour(w, 'Building C');
    const res = await post(w, '/api/admin/notices', token, { ...notice, building: null, kind: 'lift' });
    const { id } = await res.json<{ id: string }>();
    expect(itemsOf(w, other)).toEqual([{ kind: 'building_notice', data: '{"noticeKind":"lift"}' }]);
    expect(await kinds(w, w.ownerToken)).toEqual(['building_notice']);
    expect((await post(w, `/api/admin/notices/${id}/withdraw`, token)).status).toBe(200);
    expect(await kinds(w, w.ownerToken)).toEqual([]);
  });

  it('C-AZ-2: a notice item is shown in the resident views only, never to a partner', async () => {
    const w = await world();
    const token = await admin(w);
    w.h.sqlite
      .prepare(
        `INSERT INTO owner_units (user_id, sf_unit_id, sf_deal_id, unit_name, project, building, deal_role, synced_at)
         SELECT u.id, 'a0X000000000077AAA', '006000000000077AAA', 'JAD288-T01', 'JAD 288', 'Building B', 'Buyer', ?
         FROM users u JOIN technicians t ON t.user_id = u.id WHERE t.id = 't-primary'`,
      )
      .run(NOW);
    await post(w, '/api/admin/notices', token, notice);
    expect(await kinds(w, w.primaryToken)).toEqual([]);
  });
});

describe('building management alerts (E12)', () => {
  const contact = {
    project: 'JAD 288',
    building: 'Building B',
    name: 'Rania Facility',
    role: 'Facility manager',
    phone: '050 000 0000',
    email: 'fm@example.com',
  };

  it('E12: water from shared parts alerts the building’s contacts by SMS and email, never another building’s', async () => {
    const w = await world();
    const token = await admin(w);
    expect((await post(w, '/api/admin/building-contacts', token, contact)).status).toBe(201);
    await post(w, '/api/admin/building-contacts', token, {
      ...contact,
      building: 'Building C',
      email: 'fm.c@example.com',
      phone: null,
    });
    await emergency(w, { faultSource: 'building' });
    const sent = (await deliver(w)).filter((m) => m.subject.startsWith('JAD+ BUILDING ALERT'));
    expect(sent.map((m) => m.channel).sort()).toEqual(['email', 'sms']);
    expect(sent.map((m) => m.to)).toContain('fm@example.com');
    expect(sent.map((m) => m.to)).not.toContain('fm.c@example.com');
    expect(sent.every((m) => m.urgent && !m.body.includes('ceiling'))).toBe(true);
    expect(rows(w, "SELECT failure FROM notifications WHERE recipient_kind = 'building_fm'")).toEqual([
      { failure: null },
    ]);
  });

  it('E12: until providers are connected the alert is queued for the contact and then shown as undelivered', async () => {
    const w = await world();
    const token = await admin(w);
    await post(w, '/api/admin/building-contacts', token, { ...contact, building: null, phone: null });
    await emergency(w, { faultSource: 'fire_system' });
    await runDelivery(
      w.h.env,
      {},
      w.h.clock,
      createLogger({}, () => undefined),
    );
    expect(
      rows(
        w,
        `SELECT d.channel, d.status, d.last_error, d.recipient_contact_id IS NOT NULL AS to_contact
         FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
         WHERE n.recipient_kind = 'building_fm'`,
      ),
    ).toEqual([{ channel: 'email', status: 'failed', last_error: 'not_configured', to_contact: 1 }]);
    // C-PD-2: the delivery holds an id only; the address stays encrypted in building_contacts.
    expect(JSON.stringify(rows(w, 'SELECT * FROM notification_deliveries'))).not.toContain('fm@example.com');
  });

  it('E12: a contact removed before sending is "no_address", and the history is kept', async () => {
    const w = await world();
    const token = await admin(w);
    const { id } = await (
      await post(w, '/api/admin/building-contacts', token, { ...contact, phone: null })
    ).json<{ id: string }>();
    await emergency(w, { faultSource: 'building' });
    await fanOut(
      w.h.env.DB,
      w.h.clock,
      createLogger({}, () => undefined),
    );
    const del = await w.h.request(`/api/admin/building-contacts/${id}`, { method: 'DELETE', token });
    expect(del.status).toBe(200);
    const sent = await deliver(w);
    expect(sent.filter((m) => m.subject.startsWith('JAD+ BUILDING ALERT'))).toEqual([]);
    expect(
      rows(w, 'SELECT last_error FROM notification_deliveries WHERE recipient_contact_id = ?', id),
    ).toEqual([{ last_error: 'no_address' }]);
  });
});

describe('after-hours contact (E5-E7)', () => {
  function onDuty(w: World, technicianId: string): void {
    w.h.sqlite
      .prepare(
        `INSERT INTO partner_after_hours (partner_id, week_starting, technician_id, set_by, set_at)
         SELECT partner_id, '2026-11-09', id, ?, ? FROM technicians WHERE id = ?`,
      )
      .run(w.owner, NOW, technicianId);
  }

  it('E5-E7: out of hours, the new emergency also reaches the partner’s after-hours technician', async () => {
    const w = await world();
    onDuty(w, 't-primary');
    w.h.clock = NIGHT;
    await emergency(w);
    const sent = await deliver(w);
    expect(sent.filter((m) => m.to === EMAILS.primaryTech).map((m) => m.subject)).toEqual([
      expect.stringMatching(/^JAD\+ EMERGENCY /),
    ]);
  });

  it('E5: the 15-minute reminder out of hours goes to the after-hours technician too', async () => {
    const w = await world();
    onDuty(w, 't-primary');
    w.h.clock = NIGHT;
    await emergency(w);
    await deliver(w);
    w.h.clock = NIGHT + 15 * 60_000;
    await runEscalationSweep(
      w.h.env.DB,
      w.h.clock,
      createLogger({}, () => undefined),
    );
    const sent = await deliver(w);
    expect(sent.filter((m) => m.to === EMAILS.primaryTech).map((m) => m.subject)).toEqual([
      expect.stringMatching(/^JAD\+ REMINDER /),
    ]);
  });

  it('E5-E7: during working hours, or with nobody named, the after-hours technician is not woken', async () => {
    const w = await world();
    onDuty(w, 't-primary');
    await emergency(w);
    expect((await deliver(w)).filter((m) => m.to === EMAILS.primaryTech)).toEqual([]);

    const v = await world();
    v.h.clock = NIGHT;
    await emergency(v);
    expect((await deliver(v)).filter((m) => m.to === EMAILS.primaryTech)).toEqual([]);
  });

  it('E5-E7: a technician removed from the team is never alerted, even if still named for the week', async () => {
    const w = await world();
    onDuty(w, 't-primary');
    w.h.sqlite
      .prepare(
        "UPDATE technicians SET status = 'removed', removed_at = ?, removed_reason = 'Left' WHERE id = 't-primary'",
      )
      .run(NOW);
    w.h.clock = NIGHT;
    await emergency(w);
    expect((await deliver(w)).filter((m) => m.to === EMAILS.primaryTech)).toEqual([]);
  });
});
