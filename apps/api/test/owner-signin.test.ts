/** Owners sign in with the email or mobile number on their Salesforce record: C-AUTH-3, U2, U3, T2, C-PD-2. */
import { OWNER_UNITS_MAX_AGE_MS } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { CODE_SENT_MESSAGE } from '../src/auth/signin.js';
import { SF_UNIT } from './db.js';
import { blindIndex, encryptField, importKeys } from '../src/crypto.js';
import { TEST_DATA_KEY, TEST_INDEX_KEY, harness, ownerRecord, type Harness } from './harness.js';

const EMAIL = 'layla.haddad@example.com';
const PHONE = '+971500000000';
const OTHER_UNIT = 'a0X000000000002AAA';

function rows(h: Harness, sql: string, ...params: string[]): unknown[] {
  return h.sqlite.prepare(sql).all(...params);
}

function ask(h: Harness, json: Record<string, string>): Promise<Response> {
  return h.request('/api/auth/code', { method: 'POST', json });
}

function emergency(h: Harness, token: string, sfUnitId = SF_UNIT): Promise<Response> {
  return h.request('/api/emergencies', {
    method: 'POST',
    token,
    json: { sfUnitId, type: 'water_leak', description: 'Water under the sink.' },
  });
}

describe('owner sign-in through Salesforce (C-AUTH-3)', () => {
  it('C-AUTH-3: an owner new to JAD+ signs in with their Salesforce email and gets their units', async () => {
    const h = harness();
    h.salesforce.set(`email:${EMAIL}`, ownerRecord(EMAIL, [SF_UNIT, OTHER_UNIT]));
    const token = await h.signIn(EMAIL);
    const me = await (await h.request('/api/auth/me', { token })).json<{ role: string }>();
    expect(me.role).toBe('owner');
    expect(rows(h, 'SELECT sf_unit_id, deal_role FROM owner_units ORDER BY sf_unit_id')).toEqual([
      { sf_unit_id: SF_UNIT, deal_role: 'Buyer' },
      { sf_unit_id: OTHER_UNIT, deal_role: 'Buyer' },
    ]);
  });

  it('C-AUTH-3: an owner can sign in with the mobile number on their Salesforce record, written any way', async () => {
    const h = harness();
    h.salesforce.set(`phone:${PHONE}`, ownerRecord(null));
    const token = await h.signIn('050 000 0000');
    expect(h.salesforceCalls[0]).toBe(`phone:${PHONE}`);
    expect(h.outbox.at(-1)?.to).toBe(PHONE);
    expect((await emergency(h, token)).status).toBe(201);
  });

  it('C-PD-2/C-LOG-1: the Salesforce details are stored encrypted and never logged', async () => {
    const h = harness();
    h.salesforce.set(`email:${EMAIL}`, ownerRecord(EMAIL));
    await h.signIn(EMAIL);
    const stored = JSON.stringify(rows(h, 'SELECT * FROM users')) + h.logs.join('\n');
    for (const secret of [EMAIL, 'Layla Haddad', '000 0000']) expect(stored).not.toContain(secret);
    expect(
      rows(h, 'SELECT count(*) AS n FROM users WHERE name_enc IS NOT NULL AND sf_contact_id IS NOT NULL'),
    ).toEqual([{ n: 1 }]);
  });

  it('C-AUTH-1: someone Salesforce does not know gets the same answer and no code', async () => {
    const h = harness();
    const res = await ask(h, { email: 'nobody@example.com' });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ message: CODE_SENT_MESSAGE });
    expect(h.outbox).toEqual([]);
    expect(h.salesforceCalls).toEqual(['email:nobody@example.com']);
  });

  it('C-AUTH-3: an email shared by two different people in Salesforce gets no code', async () => {
    const h = harness();
    h.salesforce.set(`email:${EMAIL}`, { ...ownerRecord(EMAIL), found: false, shared: true });
    expect((await ask(h, { email: EMAIL })).status).toBe(202);
    expect(h.outbox).toEqual([]);
  });

  it('U2: a Salesforce person who matches two different JAD+ people is sent to the JAD+ desk', async () => {
    const h = harness();
    await h.addUser({ email: 'omar.tenant@example.com', roles: ['tenant'] });
    const second = await h.addUser({ email: EMAIL, roles: ['tenant'] });
    const keys = await importKeys(TEST_INDEX_KEY, TEST_DATA_KEY);
    h.sqlite
      .prepare('UPDATE users SET phone_hash = ?, phone_enc = ? WHERE id = ?')
      .run(
        await blindIndex(keys, 'phone', PHONE),
        await encryptField(keys, PHONE, `users.phone:${second}`),
        second,
      );
    // Salesforce lists the second person's number with the first person's email: JAD+ must not guess.
    h.salesforce.set(`phone:${PHONE}`, ownerRecord('omar.tenant@example.com'));
    await ask(h, { phone: PHONE });
    const res = await h.request('/api/auth/verify', {
      method: 'POST',
      json: { phone: PHONE, code: h.outbox.at(-1)?.code ?? '', client: 'mobile' },
    });
    expect(res.status).toBe(409);
    expect(rows(h, "SELECT count(*) AS n FROM user_roles WHERE role = 'owner'")).toEqual([{ n: 0 }]);
  });
});

describe('when Salesforce is down (T2)', () => {
  it('T2: someone new cannot be checked, so no code is sent (same answer as always)', async () => {
    const h = harness();
    h.salesforceDown = true;
    expect((await ask(h, { email: EMAIL })).status).toBe(202);
    expect(h.outbox).toEqual([]);
  });

  it('T2: an owner already in JAD+ still signs in and can raise an emergency on their stored units', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    await h.signIn(EMAIL);
    h.salesforceDown = true;
    h.clock += OWNER_UNITS_MAX_AGE_MS + 1;
    const token = await h.signIn(EMAIL);
    expect((await emergency(h, token)).status).toBe(201);
  });

  it('T2: a new owner whose code arrived but Salesforce then failed is asked to try again', async () => {
    const h = harness();
    h.salesforce.set(`email:${EMAIL}`, ownerRecord(EMAIL));
    await ask(h, { email: EMAIL });
    h.salesforceDown = true;
    const code = h.outbox.at(-1)?.code ?? '';
    const res = await h.request('/api/auth/verify', {
      method: 'POST',
      json: { email: EMAIL, code, client: 'mobile' },
    });
    expect(res.status).toBe(503);
  });
});

describe('owner units stay in step with Salesforce (U3, C-AZ-2)', () => {
  it('C-AZ-2: an owner can raise only on a unit Salesforce lists as theirs', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    const token = await h.signIn(EMAIL);
    expect((await emergency(h, token)).status).toBe(201);
    expect((await emergency(h, token, OTHER_UNIT)).status).toBe(404);
  });

  it('U3: an owner who sold their only unit loses owner access at the next sign-in', async () => {
    const h = harness();
    const id = await h.addUser({ email: EMAIL, roles: ['owner'] });
    const before = await h.signIn(EMAIL);
    h.salesforce.set(`email:${EMAIL}`, { ...ownerRecord(EMAIL), units: [] });
    const res = await ask(h, { email: EMAIL });
    expect(res.status).toBe(202);
    const verify = await h.request('/api/auth/verify', {
      method: 'POST',
      json: { email: EMAIL, code: h.outbox.at(-1)?.code ?? '', client: 'mobile' },
    });
    expect(verify.status).toBe(403);
    expect((await h.request('/api/auth/me', { token: before })).status).toBe(401);
    expect(rows(h, "SELECT target_id FROM audit_log WHERE action = 'owner_access_removed'")).toEqual([
      { target_id: id },
    ]);
    expect(rows(h, 'SELECT count(*) AS n FROM owner_units')).toEqual([{ n: 0 }]);
  });

  it('U3: a unit list older than a day is refreshed before an emergency; a sold unit is refused', async () => {
    const h = harness();
    await h.addUser({ email: EMAIL, roles: ['owner'] });
    const token = await h.signIn(EMAIL);
    h.salesforce.set(`email:${EMAIL}`, ownerRecord(EMAIL, [OTHER_UNIT]));
    expect((await emergency(h, token)).status).toBe(201); // fresh copy: no Salesforce call
    h.clock += OWNER_UNITS_MAX_AGE_MS;
    expect((await emergency(h, token)).status).toBe(404);
    expect((await emergency(h, token, OTHER_UNIT)).status).toBe(201);
  });
});
