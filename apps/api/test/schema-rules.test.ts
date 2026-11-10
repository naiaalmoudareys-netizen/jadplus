/**
 * Business rules the database enforces on its own, as a second line of defence behind the API.
 * Each test is named after the requirement or control it protects.
 */
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { BYTES32, NOW, SF_UNIT, addUser, insert, migratedDb, requestRow, seedWorld } from './db.js';

function world(): DatabaseSync {
  const db = migratedDb();
  seedWorld(db);
  return db;
}

const session = {
  id: 's-1',
  token_hash: BYTES32,
  user_id: 'u-owner',
  role: 'owner',
  client: 'mobile',
  created_at: NOW,
  last_seen_at: NOW,
  idle_expires_at: NOW + 3_600_000,
  absolute_expires_at: NOW + 86_400_000,
  ip_hash: BYTES32,
};

describe('identity and sessions', () => {
  it('C-PD-2: a person needs an encrypted email or phone, and a blind index never comes without ciphertext', () => {
    const db = migratedDb();
    expect(() => {
      insert(db, 'users', { id: 'u-x', created_at: NOW, updated_at: NOW });
    }).toThrow(/CHECK/);
    expect(() => {
      insert(db, 'users', { id: 'u-y', email_hash: BYTES32, created_at: NOW, updated_at: NOW });
    }).toThrow(/CHECK/);
  });

  it('C-AUTH-1: a sign-in code can never live longer than 10 minutes', () => {
    const db = migratedDb();
    const code = { identity_hash: BYTES32, code_hash: BYTES32, created_at: NOW, ip_hash: BYTES32 };
    insert(db, 'sign_in_codes', { id: 'c-ok', ...code, expires_at: NOW + 600_000 });
    expect(() => {
      insert(db, 'sign_in_codes', { id: 'c-long', ...code, expires_at: NOW + 600_001 });
    }).toThrow(/CHECK/);
  });

  it('C-SES-1: only a 32-byte token hash is stored, never the token itself', () => {
    const db = world();
    insert(db, 'sessions', session);
    expect(() => {
      insert(db, 'sessions', { ...session, id: 's-2', token_hash: new TextEncoder().encode('raw-token') });
    }).toThrow(/CHECK/);
  });

  it('C-SES-1: a session cannot outlive its absolute expiry, and a revocation needs a reason', () => {
    const db = world();
    expect(() => {
      insert(db, 'sessions', { ...session, idle_expires_at: session.absolute_expires_at + 1 });
    }).toThrow(/CHECK/);
    expect(() => {
      insert(db, 'sessions', { ...session, revoked_at: NOW });
    }).toThrow(/CHECK/);
  });

  it('C-AZ-1: partner sessions and roles are bound to one partner; other roles to none', () => {
    const db = world();
    expect(() => {
      insert(db, 'sessions', { ...session, role: 'partner' });
    }).toThrow(/CHECK/);
    expect(() => {
      insert(db, 'user_roles', {
        id: 'g-1',
        user_id: 'u-owner',
        role: 'owner',
        partner_id: 'p-1',
        granted_at: NOW,
      });
    }).toThrow(/CHECK/);
  });

  it('C-AZ-1: the same role cannot be granted twice while live', () => {
    const db = world();
    const grant = { user_id: 'u-admin', role: 'jad_admin', granted_at: NOW };
    insert(db, 'user_roles', { id: 'g-1', ...grant });
    expect(() => {
      insert(db, 'user_roles', { id: 'g-2', ...grant });
    }).toThrow(/UNIQUE/);
    db.exec(`UPDATE user_roles SET revoked_at = ${NOW + 1} WHERE id = 'g-1'`);
    insert(db, 'user_roles', { id: 'g-3', ...grant });
  });

  it('E8: a make-safe cap consent must carry the cap amount', () => {
    const db = world();
    const consent = {
      user_id: 'u-owner',
      kind: 'make_safe_cap',
      version: '1',
      accepted: 1,
      at: NOW,
      ip_hash: BYTES32,
    };
    expect(() => {
      insert(db, 'consents', { id: 'c-1', ...consent });
    }).toThrow(/CHECK/);
    insert(db, 'consents', { id: 'c-2', ...consent, make_safe_cap_fils: 50_000 });
  });
});

describe('partners and catalogue', () => {
  it('S3: one current primary and one current backup per service, never the same partner as both', () => {
    const db = world();
    insert(db, 'partners', { id: 'p-2', name: 'Backup Fixers LLC', created_at: NOW, updated_at: NOW });
    insert(db, 'partners', { id: 'p-3', name: 'Third Fixers LLC', created_at: NOW, updated_at: NOW });
    const sp = { service_code: 'maintenance', started_at: NOW };
    insert(db, 'service_partners', { id: 'sp-1', ...sp, partner_id: 'p-1', rank: 'primary' });
    insert(db, 'service_partners', { id: 'sp-2', ...sp, partner_id: 'p-2', rank: 'backup' });
    expect(() => {
      insert(db, 'service_partners', { id: 'sp-3', ...sp, partner_id: 'p-3', rank: 'primary' });
    }).toThrow(/UNIQUE/);
    db.exec(`UPDATE service_partners SET ended_at = ${NOW} WHERE id = 'sp-2'`);
    expect(() => {
      insert(db, 'service_partners', { id: 'sp-4', ...sp, partner_id: 'p-1', rank: 'backup' });
    }).toThrow(/UNIQUE/);
  });

  it('S6/P4: the backup can be promoted the same day once the primary assignment is ended (history kept)', () => {
    const db = world();
    insert(db, 'partners', { id: 'p-2', name: 'Backup Fixers LLC', created_at: NOW, updated_at: NOW });
    const sp = { service_code: 'maintenance', started_at: NOW };
    insert(db, 'service_partners', { id: 'sp-1', ...sp, partner_id: 'p-1', rank: 'primary' });
    insert(db, 'service_partners', { id: 'sp-2', ...sp, partner_id: 'p-2', rank: 'backup' });
    db.exec(`UPDATE service_partners SET ended_at = ${NOW + 1} WHERE id IN ('sp-1', 'sp-2')`);
    insert(db, 'service_partners', {
      id: 'sp-3',
      ...sp,
      started_at: NOW + 1,
      partner_id: 'p-2',
      rank: 'primary',
    });
    expect(db.prepare('SELECT count(*) AS n FROM service_partners').get()).toEqual({ n: 3 });
  });

  it('S7: a licence or insurance document must have an expiry date', () => {
    const db = world();
    const doc = { partner_id: 'p-1', kind: 'insurance', uploaded_at: NOW, uploaded_by: 'u-admin' };
    expect(() => {
      insert(db, 'partner_documents', { id: 'd-1', ...doc, r2_key: 'partners/p-1/d-1' });
    }).toThrow(/CHECK/);
    insert(db, 'partner_documents', {
      id: 'd-2',
      ...doc,
      r2_key: 'partners/p-1/d-2',
      expires_on: '2027-06-30',
    });
  });

  it('S6/S7: a suspended or ended partner always has a recorded reason', () => {
    const db = world();
    expect(() => {
      db.exec("UPDATE partners SET status = 'suspended' WHERE id = 'p-1'");
    }).toThrow(/CHECK/);
    db.exec("UPDATE partners SET status = 'suspended', status_reason = 'Insurance lapsed' WHERE id = 'p-1'");
  });

  it('E17: a technician removed from JAD+ jobs has a reason and a time', () => {
    const db = world();
    expect(() => {
      db.exec("UPDATE technicians SET status = 'removed' WHERE id = 't-1'");
    }).toThrow(/CHECK/);
    db.exec(
      `UPDATE technicians SET status = 'removed', removed_reason = 'Conduct', removed_at = ${NOW} WHERE id = 't-1'`,
    );
  });

  it('section 11: on-call rota weeks start on a Monday', () => {
    const db = world();
    insert(db, 'on_call_rota', { week_starting: '2026-11-09', position: 'first', user_id: 'u-admin' });
    expect(() => {
      insert(db, 'on_call_rota', { week_starting: '2026-11-10', position: 'first', user_id: 'u-admin' });
    }).toThrow(/CHECK/);
  });
});

describe('tenancies', () => {
  it('R2/U4: a unit has at most one current tenancy, and a tenancy ends after it starts', () => {
    const db = world();
    addUser(db, 'u-tenant2');
    const t = {
      sf_unit_id: SF_UNIT,
      owner_user_id: 'u-owner',
      tenant_user_id: 'u-tenant2',
      status: 'invited',
      invited_at: NOW,
      created_by: 'u-owner',
    };
    expect(() => {
      insert(db, 'tenancies', { id: 'ten-2', ...t, starts_on: '2027-01-01', ends_on: '2027-12-31' });
    }).toThrow(/UNIQUE/);
    db.exec(`UPDATE tenancies SET status = 'ended', ended_at = ${NOW} WHERE id = 'ten-1'`);
    expect(() => {
      insert(db, 'tenancies', { id: 'ten-3', ...t, starts_on: '2027-01-01', ends_on: '2026-12-31' });
    }).toThrow(/CHECK/);
    insert(db, 'tenancies', { id: 'ten-4', ...t, starts_on: '2027-01-01', ends_on: '2027-12-31' });
  });
});

describe('requests', () => {
  it('R2: a tenant request always belongs to a tenancy', () => {
    const db = world();
    expect(() => {
      insert(db, 'requests', requestRow({ tenancy_id: null }));
    }).toThrow(/CHECK/);
  });

  it('A6: on hold always has a reason; a closed request always has a close reason', () => {
    const db = world();
    expect(() => {
      insert(db, 'requests', requestRow({ status: 'on_hold' }));
    }).toThrow(/CHECK/);
    expect(() => {
      insert(db, 'requests', requestRow({ status: 'closed' }));
    }).toThrow(/CHECK/);
    expect(() => {
      insert(db, 'requests', requestRow({ status: 'cancelled', close_reason: 'confirmed' }));
    }).toThrow(/CHECK/);
  });

  it('E1: an emergency always has a type, and a type is only set on an emergency', () => {
    const db = world();
    expect(() => {
      insert(db, 'requests', requestRow({ is_emergency: 1 }));
    }).toThrow(/CHECK/);
    expect(() => {
      insert(db, 'requests', requestRow({ emergency_type: 'water_leak' }));
    }).toThrow(/CHECK/);
  });
});

describe('quotes, visits, attachments, scorecard facts', () => {
  const quote = {
    id: 'q-1',
    request_id: 'req-1',
    partner_id: 'p-1',
    revision: 1,
    amount_fils: 45_000,
    scope: 'Replace tap cartridge.',
    is_make_safe: 0,
    status: 'pending',
    sent_at: NOW,
    expires_at: NOW + 14 * 86_400_000,
  };

  it('L4: an approved quote must name the owner who approved it (JAD never approves chargeable work)', () => {
    const db = world();
    insert(db, 'requests', requestRow());
    expect(() => {
      insert(db, 'quotes', { ...quote, status: 'approved', decided_at: NOW });
    }).toThrow(/CHECK/);
    insert(db, 'quotes', { ...quote, status: 'approved', decided_at: NOW, decided_by_user_id: 'u-owner' });
  });

  it('E8: make-safe work is approved only through the owner pre-authorised cap consent', () => {
    const db = world();
    insert(db, 'requests', requestRow());
    insert(db, 'consents', {
      id: 'cap-1',
      user_id: 'u-owner',
      kind: 'make_safe_cap',
      version: '1',
      accepted: 1,
      make_safe_cap_fils: 50_000,
      at: NOW,
      ip_hash: BYTES32,
    });
    expect(() => {
      insert(db, 'quotes', { ...quote, status: 'approved', decided_at: NOW, make_safe_consent_id: 'cap-1' });
    }).toThrow(/CHECK/);
    insert(db, 'quotes', {
      ...quote,
      is_make_safe: 1,
      status: 'approved',
      decided_at: NOW,
      make_safe_consent_id: 'cap-1',
    });
  });

  it('A3: a partner may offer only one revised quote', () => {
    const db = world();
    insert(db, 'requests', requestRow());
    insert(db, 'quotes', { ...quote, status: 'declined', decided_at: NOW, decided_by_user_id: 'u-owner' });
    insert(db, 'quotes', { ...quote, id: 'q-2', revision: 2 });
    expect(() => {
      insert(db, 'quotes', { ...quote, id: 'q-3', revision: 3 });
    }).toThrow(/CHECK/);
  });

  it('A7: "no access" can only be logged with a photo', () => {
    const db = world();
    insert(db, 'requests', requestRow());
    const visit = { request_id: 'req-1', window_start: NOW, window_end: NOW + 7_200_000, created_at: NOW };
    expect(() => {
      insert(db, 'visits', { id: 'v-1', ...visit, status: 'no_access' });
    }).toThrow(/CHECK/);
    insert(db, 'visits', { id: 'v-2', ...visit, status: 'booked' });
    insert(db, 'attachments', {
      id: 'a-1',
      request_id: 'req-1',
      visit_id: 'v-2',
      purpose: 'no_access_photo',
      r2_key: 'requests/req-1/a-1',
      content_type: 'image/jpeg',
      byte_size: 200_000,
      sha256: BYTES32,
      uploaded_by_user_id: 'u-tech',
      uploaded_at: NOW,
    });
    db.exec("UPDATE visits SET status = 'no_access', no_access_attachment_id = 'a-1' WHERE id = 'v-2'");
  });

  it('C-UPL-1: only sniffed image/PDF types, within size limits, matching their purpose', () => {
    const db = world();
    insert(db, 'requests', requestRow());
    const a = {
      request_id: 'req-1',
      purpose: 'request_photo',
      sha256: BYTES32,
      uploaded_by_user_id: 'u-tenant',
      uploaded_at: NOW,
    };
    insert(db, 'attachments', {
      id: 'a-1',
      ...a,
      r2_key: 'k1',
      content_type: 'image/png',
      byte_size: 10_485_760,
    });
    const bad = [
      { content_type: 'image/png', byte_size: 10_485_761 },
      { content_type: 'image/svg+xml', byte_size: 100 },
      { content_type: 'application/pdf', byte_size: 100 },
    ];
    bad.forEach((b, i) => {
      expect(() => {
        insert(db, 'attachments', { id: `a-bad-${i}`, ...a, r2_key: `kb${i}`, ...b });
      }).toThrow(/CHECK/);
    });
  });

  it('S5/A7: an SLA outcome is "met" only if met on time, and an excused miss records why', () => {
    const db = world();
    insert(db, 'requests', requestRow());
    const o = {
      request_id: 'req-1',
      partner_id: 'p-1',
      metric: 'routine_response',
      due_at: NOW,
      recorded_at: NOW,
    };
    expect(() => {
      insert(db, 'sla_outcomes', { id: 'o-1', ...o, outcome: 'met', met_at: NOW + 1 });
    }).toThrow(/CHECK/);
    expect(() => {
      insert(db, 'sla_outcomes', { id: 'o-2', ...o, outcome: 'excused' });
    }).toThrow(/CHECK/);
    insert(db, 'sla_outcomes', { id: 'o-3', ...o, outcome: 'excused', excuse: 'No access (A7)' });
  });

  it('S5/V4: ratings are 1 to 5 stars, one per request', () => {
    const db = world();
    insert(db, 'requests', requestRow());
    const r = { request_id: 'req-1', partner_id: 'p-1', rated_by_user_id: 'u-tenant', at: NOW };
    expect(() => {
      insert(db, 'ratings', { ...r, stars: 6 });
    }).toThrow(/CHECK/);
    insert(db, 'ratings', { ...r, stars: 4 });
    expect(() => {
      insert(db, 'ratings', { ...r, stars: 5 });
    }).toThrow(/UNIQUE/);
  });
});
