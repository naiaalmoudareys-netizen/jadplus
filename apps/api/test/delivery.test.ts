/** Delivering alerts (ADR 0007): E1, E3, E6, E7, E12, C-LOG-1, C-AUD-1. Fake providers only. */
import { MAX_DELIVERY_ATTEMPTS, OWNER_EMERGENCY_NOTICE } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { encryptField, importKeys } from '../src/crypto.js';
import { runDelivery } from '../src/delivery/run.js';
import type { OutgoingMessage, Senders } from '../src/delivery/senders.js';
import { createLogger } from '../src/logger.js';
import { EMAILS, leak, raise, rows, world, type World } from './emergency-world.js';
import { TEST_DATA_KEY, TEST_INDEX_KEY } from './harness.js';

const PARTNER_LINE = '+971500000001';
const MIN = 60_000;

interface Sent extends OutgoingMessage {
  readonly channel: string;
}

function providers(failSms = 0): { senders: Senders; sent: Sent[] } {
  const sent: Sent[] = [];
  let smsFailures = failSms;
  return {
    sent,
    senders: {
      sms: (_env, m) => {
        if (smsFailures > 0) {
          smsFailures -= 1;
          return Promise.reject(new Error('provider down (test)'));
        }
        sent.push({ channel: 'sms', ...m });
        return Promise.resolve({ providerRef: `sms-${sent.length}` });
      },
      email: (_env, m) => {
        sent.push({ channel: 'email', ...m });
        return Promise.resolve({ providerRef: null });
      },
    },
  };
}

async function withAlertLine(w: World): Promise<void> {
  const keys = await importKeys(TEST_INDEX_KEY, TEST_DATA_KEY);
  w.h.sqlite
    .prepare("UPDATE partners SET alert_phone_enc = ? WHERE id = 'p-primary'")
    .run(await encryptField(keys, PARTNER_LINE, 'partners.alert_phone:p-primary'));
}

const deliver = (w: World, senders: Senders) =>
  runDelivery(
    w.h.env,
    senders,
    w.h.clock,
    createLogger({}, () => undefined),
  );

describe('delivering alerts', () => {
  it('E1: the partner gets a loud SMS on its alert line and the owner the exact notice by email', async () => {
    const w = await world();
    await withAlertLine(w);
    await raise(w, leak);
    const p = providers();
    expect(await deliver(w, p.senders)).toMatchObject({ fannedOut: 2, sent: 2, failed: 0 });
    const ref = (rows(w, 'SELECT ref FROM requests')[0] as { ref: string }).ref;
    expect(p.sent).toEqual([
      expect.objectContaining({
        channel: 'sms',
        to: PARTNER_LINE,
        subject: `JAD+ EMERGENCY ${ref}`,
        urgent: true,
      }),
      expect.objectContaining({
        channel: 'email',
        to: EMAILS.owner,
        body: OWNER_EMERGENCY_NOTICE,
        urgent: false,
      }),
    ]);
    expect(rows(w, 'SELECT count(*) AS n FROM notifications WHERE sent_at IS NULL')).toEqual([{ n: 0 }]);
  });

  it('C-LOG-1: messages carry the reference and kind only, never the description or names; nothing is logged', async () => {
    const w = await world();
    await withAlertLine(w);
    await raise(w, leak);
    const p = providers();
    const lines: string[] = [];
    await runDelivery(
      w.h.env,
      p.senders,
      w.h.clock,
      createLogger({}, (l) => lines.push(l)),
    );
    const text = p.sent.map((m) => `${m.subject} ${m.body}`).join('\n');
    expect(text).not.toContain(leak.description);
    expect(text).not.toContain('Layla');
    expect(lines.join('\n')).not.toContain(PARTNER_LINE);
    expect(JSON.stringify(rows(w, 'SELECT * FROM notification_deliveries'))).not.toContain(PARTNER_LINE);
  });

  it('runs twice without sending anything twice', async () => {
    const w = await world();
    await withAlertLine(w);
    await raise(w, leak);
    const p = providers();
    await deliver(w, p.senders);
    await deliver(w, p.senders);
    expect(p.sent).toHaveLength(2);
  });

  it('an SMS the provider refuses is retried a minute later, then goes out', async () => {
    const w = await world();
    await withAlertLine(w);
    await raise(w, leak);
    const p = providers(1);
    expect(await deliver(w, p.senders)).toMatchObject({ sent: 1, retrying: 1 });
    w.h.clock += MIN;
    expect(await deliver(w, p.senders)).toMatchObject({ sent: 1, retrying: 0 });
    expect(
      rows(w, "SELECT attempts, provider_ref FROM notification_deliveries WHERE channel = 'sms'"),
    ).toEqual([{ attempts: 2, provider_ref: 'sms-2' }]);
  });

  it('after the last retry the alert is marked undelivered, audited and listed for JAD+ Admin', async () => {
    const w = await world();
    await withAlertLine(w);
    await raise(w, leak);
    const p = providers(MAX_DELIVERY_ATTEMPTS);
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i += 1) {
      await deliver(w, p.senders);
      w.h.clock += 10 * MIN;
    }
    expect(
      rows(w, "SELECT status, attempts, last_error FROM notification_deliveries WHERE channel = 'sms'"),
    ).toEqual([{ status: 'failed', attempts: MAX_DELIVERY_ATTEMPTS, last_error: 'provider_error' }]);
    expect(rows(w, "SELECT failure FROM notifications WHERE recipient_kind = 'partner'")).toEqual([
      { failure: 'not_delivered' },
    ]);
    expect(rows(w, "SELECT count(*) AS n FROM audit_log WHERE action = 'notification_failed'")).toEqual([
      { n: 1 },
    ]);
  });

  it('ADR 0007: with no provider connected nothing is silently dropped: every alert shows as undelivered', async () => {
    const w = await world();
    await withAlertLine(w);
    await raise(w, leak);
    expect(await deliver(w, {})).toMatchObject({ sent: 0, failed: 2 });
    await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
    const token = await w.h.signIn('demo@jadplus.ae', 'console');
    const res = await w.h.request('/api/admin/notifications/undelivered', { token });
    const body = await res.json<{
      notifications: { template: string; failure: string; errors: string[] }[];
    }>();
    expect(body.notifications.map((n) => [n.template, n.failure, n.errors])).toEqual(
      expect.arrayContaining([
        ['emergency_new_job', 'not_delivered', ['sms:not_configured']],
        ['emergency_owner_notice', 'not_delivered', ['email:not_configured']],
      ]),
    );
    expect((await w.h.request('/api/admin/notifications/undelivered', { token: w.ownerToken })).status).toBe(
      403,
    );
  });
});

describe('who receives on-call and building alerts (E3, E6, E7, E12)', () => {
  it('E7: on-call alerts go to this week’s rota by SMS and email', async () => {
    const w = await world({ withPartners: false });
    const admin = await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
    const second = await w.h.addUser({ email: 'second@example.com', roles: ['jad_viewer'] });
    const keys = await importKeys(TEST_INDEX_KEY, TEST_DATA_KEY);
    w.h.sqlite
      .prepare('UPDATE users SET phone_hash = ?, phone_enc = ? WHERE id = ?')
      .run(
        new Uint8Array(32).fill(7),
        await encryptField(keys, '+971500000002', `users.phone:${admin}`),
        admin,
      );
    const rota = w.h.sqlite.prepare(
      "INSERT INTO on_call_rota (week_starting, position, user_id) VALUES ('2026-11-09', ?, ?)",
    );
    rota.run('first', admin);
    rota.run('second', second);
    await raise(w, leak);
    const p = providers();
    await deliver(w, p.senders);
    expect(p.sent.filter((m) => m.subject.startsWith('JAD+ ON-CALL')).map((m) => [m.channel, m.to])).toEqual(
      expect.arrayContaining([
        ['sms', '+971500000002'],
        ['email', 'demo@jadplus.ae'],
        ['email', 'second@example.com'],
      ]),
    );
  });

  it('E6: with nobody on the rota, every JAD+ Admin is alerted rather than nobody', async () => {
    const w = await world({ withPartners: false });
    await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
    await raise(w, leak);
    const p = providers();
    await deliver(w, p.senders);
    expect(p.sent.filter((m) => m.subject.startsWith('JAD+ ON-CALL')).map((m) => m.to)).toEqual([
      'demo@jadplus.ae',
    ]);
  });

  it('E3/E12: building management has no contact in JAD+ yet, so its alert is flagged at once', async () => {
    const w = await world();
    await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
    await raise(w, { ...leak, type: 'gas_smell' });
    const p = providers();
    await deliver(w, p.senders);
    expect(rows(w, "SELECT failure FROM notifications WHERE recipient_kind = 'building_fm'")).toEqual([
      { failure: 'no_building_contact' },
    ]);
    expect(p.sent.some((m) => m.subject.startsWith('JAD+ LIFE SAFETY'))).toBe(true);
  });
});
