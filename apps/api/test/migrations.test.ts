/**
 * The database schema agrees with the shared business rules, and the evidence tables cannot be rewritten.
 * Controls: C-AZ-1 (roles), C-AUD-1 (append-only audit log + request history), C-LEG-1 (consents).
 */
import {
  CHANNELS,
  CLOSE_REASONS,
  EMERGENCY_TYPES,
  ESCALATION_STAGES,
  LIFE_SAFETY_TYPES,
  NOTIFICATION_TEMPLATES,
  ROLES,
  SLA_METRICS,
  STATUSES,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { BYTES32, NOW, insert, migratedDb, migrationFiles, requestRow, seedWorld } from './db.js';

const DAY = 86_400_000;

describe('migrations', () => {
  it('are numbered 0001, 0002, … with no gaps (never edit an applied migration; add the next number)', () => {
    const numbers = migrationFiles().map((f) => Number(f.slice(0, 4)));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it('apply cleanly with every foreign key resolvable', () => {
    const db = migratedDb();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
  });
});

describe('schema mirrors packages/shared (no drift)', () => {
  it('C-AZ-1: every user-facing role can be granted; the internal "system" role cannot', () => {
    const db = migratedDb();
    seedWorld(db);
    for (const role of ROLES) {
      const partnerId = role === 'partner' || role === 'partner_admin' ? 'p-1' : null;
      const grant = () => {
        insert(db, 'user_roles', {
          id: `g-${role}`,
          user_id: 'u-admin',
          role,
          partner_id: partnerId,
          granted_at: NOW,
        });
      };
      if (role === 'system') expect(grant).toThrow(/CHECK/);
      else expect(grant).not.toThrow();
    }
  });

  it('every request status in lifecycle.ts is accepted, and nothing else', () => {
    const db = migratedDb();
    seedWorld(db);
    STATUSES.forEach((status, i) => {
      const closing = status === 'closed' ? 'confirmed' : status === 'cancelled' ? 'cancelled_by_jad' : null;
      insert(
        db,
        'requests',
        requestRow({
          id: `r-${status}`,
          ref: `JAD-S${String(i).padStart(3, '0')}`,
          status,
          close_reason: closing,
          on_hold_reason: status === 'on_hold' ? 'Waiting for parts' : null,
        }),
      );
    });
    expect(() => {
      insert(db, 'requests', requestRow({ id: 'r-bad', ref: 'JAD-BAD1', status: 'paused' }));
    }).toThrow(/CHECK/);
  });

  it('every close reason in lifecycle.ts is accepted on a closed request', () => {
    const db = migratedDb();
    seedWorld(db);
    CLOSE_REASONS.forEach((reason, i) => {
      insert(
        db,
        'requests',
        requestRow({
          id: `r-${reason}`,
          ref: `JAD-C${String(i).padStart(3, '0')}`,
          status: 'closed',
          close_reason: reason,
        }),
      );
    });
    expect(() => {
      insert(
        db,
        'requests',
        requestRow({ id: 'r-x', ref: 'JAD-CX01', status: 'closed', close_reason: 'whatever' }),
      );
    }).toThrow(/CHECK/);
  });

  it('E2/E3: every emergency and life-safety type in emergency.ts is accepted, and nothing else', () => {
    const db = migratedDb();
    seedWorld(db);
    [...EMERGENCY_TYPES, ...LIFE_SAFETY_TYPES].forEach((type, i) => {
      insert(
        db,
        'requests',
        requestRow({
          id: `r-${type}`,
          ref: `JAD-E${String(i).padStart(3, '0')}`,
          is_emergency: 1,
          emergency_type: type,
        }),
      );
    });
    expect(() => {
      insert(
        db,
        'requests',
        requestRow({ id: 'r-y', ref: 'JAD-EX01', is_emergency: 1, emergency_type: 'noise' }),
      );
    }).toThrow(/CHECK/);
  });

  it('E5-E7: every escalation stage in escalation.ts is accepted, and nothing else', () => {
    const db = migratedDb();
    seedWorld(db);
    ESCALATION_STAGES.forEach((escalation, i) => {
      insert(
        db,
        'requests',
        requestRow({ id: `r-${escalation}`, ref: `JAD-X${String(i).padStart(3, '0')}`, escalation }),
      );
    });
    expect(() => {
      insert(db, 'requests', requestRow({ id: 'r-z', ref: 'JAD-XBAD', escalation: 'panic' }));
    }).toThrow(/CHECK/);
  });

  it('S4/S5: every SLA metric in sla.ts can be recorded, and nothing else', () => {
    const db = migratedDb();
    seedWorld(db);
    insert(db, 'requests', requestRow());
    const outcome = {
      request_id: 'req-1',
      partner_id: 'p-1',
      due_at: NOW,
      outcome: 'missed',
      recorded_at: NOW,
    };
    SLA_METRICS.forEach((metric) => {
      insert(db, 'sla_outcomes', { id: `o-${metric}`, ...outcome, metric });
    });
    expect(() => {
      insert(db, 'sla_outcomes', { id: 'o-bad', ...outcome, metric: 'vibes' });
    }).toThrow(/CHECK/);
  });
});

describe('notifications mirror messages.ts (ADR 0007)', () => {
  it('every template and channel in messages.ts is accepted, and nothing else', () => {
    const db = migratedDb();
    seedWorld(db);
    insert(db, 'requests', requestRow());
    NOTIFICATION_TEMPLATES.forEach((template, i) => {
      insert(db, 'notifications', {
        id: `n-${i}`,
        created_at: NOW,
        recipient_kind: 'on_call',
        template,
        urgent: 1,
        request_id: 'req-1',
      });
    });
    expect(() => {
      insert(db, 'notifications', {
        id: 'n-bad',
        created_at: NOW,
        recipient_kind: 'on_call',
        template: 'spam',
        urgent: 0,
        request_id: 'req-1',
      });
    }).toThrow(/CHECK/);
    CHANNELS.forEach((channel) => {
      insert(db, 'notification_deliveries', {
        id: `d-${channel}`,
        notification_id: 'n-0',
        channel,
        recipient_user_id: 'u-admin',
        next_attempt_at: NOW,
        created_at: NOW,
      });
    });
    expect(() => {
      insert(db, 'notification_deliveries', {
        id: 'd-bad',
        notification_id: 'n-0',
        channel: 'pigeon',
        recipient_user_id: 'u-admin',
        next_attempt_at: NOW,
        created_at: NOW,
      });
    }).toThrow(/CHECK/);
  });
});

describe('append-only evidence', () => {
  it('C-AUD-1: audit log rows can never be edited', () => {
    const db = migratedDb();
    insert(db, 'audit_log', { at: NOW, actor_role: 'system', action: 'test_event' });
    expect(() => {
      db.exec("UPDATE audit_log SET action = 'tampered'");
    }).toThrow(/append-only/);
  });

  it('C-AUD-1: audit log rows are kept for at least one year, then may be purged', () => {
    const db = migratedDb();
    const now = Date.now();
    insert(db, 'audit_log', { at: now - 30 * DAY, actor_role: 'system', action: 'recent' });
    insert(db, 'audit_log', { at: now - 400 * DAY, actor_role: 'system', action: 'old' });
    expect(() => {
      db.exec("DELETE FROM audit_log WHERE action = 'recent'");
    }).toThrow(/at least one year/);
    db.exec("DELETE FROM audit_log WHERE action = 'old'");
    expect(db.prepare('SELECT action FROM audit_log').all()).toEqual([{ action: 'recent' }]);
  });

  it('C-AUD-1: a person-made audit entry must name the person; system entries must not', () => {
    const db = migratedDb();
    expect(() => {
      insert(db, 'audit_log', { at: NOW, actor_role: 'jad_admin', action: 'quote_override' });
    }).toThrow(/CHECK/);
  });

  it('request history (events) can be neither edited nor deleted', () => {
    const db = migratedDb();
    seedWorld(db);
    insert(db, 'requests', requestRow());
    insert(db, 'request_events', {
      id: 'ev-1',
      request_id: 'req-1',
      at: NOW,
      actor_role: 'system',
      kind: 'created',
    });
    expect(() => {
      db.exec("UPDATE request_events SET kind = 'note'");
    }).toThrow(/append-only/);
    expect(() => {
      db.exec('DELETE FROM request_events');
    }).toThrow(/append-only/);
  });

  it('C-LEG-1 / L1: consent records can be neither edited nor deleted; terms are always an acceptance', () => {
    const db = migratedDb();
    seedWorld(db);
    insert(db, 'consents', {
      id: 'c-1',
      user_id: 'u-owner',
      kind: 'terms',
      version: '2026-11',
      accepted: 1,
      at: NOW,
      ip_hash: BYTES32,
    });
    expect(() => {
      db.exec('UPDATE consents SET accepted = 0');
    }).toThrow(/append-only/);
    expect(() => {
      db.exec('DELETE FROM consents');
    }).toThrow(/append-only/);
    expect(() => {
      insert(db, 'consents', {
        id: 'c-2',
        user_id: 'u-owner',
        kind: 'terms',
        version: '2026-11',
        accepted: 0,
        at: NOW,
        ip_hash: BYTES32,
      });
    }).toThrow(/CHECK/);
  });
});
