/**
 * Database helpers shared by the request features: references, history events, notifications outbox,
 * partner lookup and ownership facts. Statements are returned unrun so callers can batch them with the
 * change they belong to (a change and its history are saved together or not at all).
 */
import type {
  DispatchPartner,
  NotificationTemplate,
  ProviderKind,
  RequestFacts,
  Role,
  Status,
  TenancyFacts,
} from '@jadplus/shared';
import { newId, randomBytes } from '../crypto.js';

/** The service the emergency engine dispatches to (migration 0006). */
export const MAINTENANCE = 'maintenance';

/** Letters and digits that cannot be confused when read out on the phone (no 0/O, 1/I/L). */
const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * A short human reference such as "JAD-7KQ4M2" (31^6 ≈ 887 million values; the column is UNIQUE).
 * References are not secrets, so the tiny bias of the modulo does not matter here.
 */
export function newRef(): string {
  const bytes = randomBytes(6);
  let out = '';
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length] ?? '';
  return `JAD-${out}`;
}

export type EventKind =
  | 'created'
  | 'status_changed'
  | 'assigned'
  | 'acknowledged'
  | 'reminder_sent'
  | 'escalated'
  | 'attachment_added'
  | 'visit_booked'
  | 'quote_sent'
  | 'quote_decided'
  | 'rated'
  | 'no_access'
  | 'reclassified'
  | 'note';

export interface EventInput {
  readonly requestId: string;
  readonly at: number;
  readonly actorUserId: string | null;
  readonly actorRole: Role;
  readonly kind: EventKind;
  readonly fromStatus?: Status;
  readonly toStatus?: Status;
  readonly partnerId?: string | null;
  readonly data?: Readonly<Record<string, string | number | boolean | null>>;
}

export function eventStatement(db: D1Database, e: EventInput): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO request_events (id, request_id, at, actor_user_id, actor_role, kind, from_status, to_status, partner_id, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId(),
      e.requestId,
      e.at,
      e.actorUserId,
      e.actorRole,
      e.kind,
      e.fromStatus ?? null,
      e.toStatus ?? null,
      e.partnerId ?? null,
      e.data === undefined ? null : JSON.stringify(e.data),
    );
}

export type Recipient =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'partner'; readonly partnerId: string }
  | { readonly kind: 'on_call' }
  | { readonly kind: 'building_fm' };

export function notificationStatement(
  db: D1Database,
  n: { requestId: string; at: number; to: Recipient; template: NotificationTemplate; urgent: boolean },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO notifications (id, created_at, recipient_kind, recipient_user_id, recipient_partner_id, template, urgent, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId(),
      n.at,
      n.to.kind,
      n.to.kind === 'user' ? n.to.userId : null,
      n.to.kind === 'partner' ? n.to.partnerId : null,
      n.template,
      n.urgent ? 1 : 0,
      n.requestId,
    );
}

export interface ServicePartner extends DispatchPartner {
  readonly name: string;
  /** ADR 0030: an outside partner or a JAD Global team. */
  readonly kind: ProviderKind;
}

/** The current primary and backup partner of a service (S3). */
export async function servicePartners(
  db: D1Database,
  serviceCode: string,
): Promise<{ primary: ServicePartner | null; backup: ServicePartner | null }> {
  const { results } = await db
    .prepare(
      `SELECT sp.rank, p.id, p.name, p.status, p.kind FROM service_partners sp JOIN partners p ON p.id = sp.partner_id
       WHERE sp.service_code = ? AND sp.ended_at IS NULL`,
    )
    .bind(serviceCode)
    .all<{
      rank: 'primary' | 'backup';
      id: string;
      name: string;
      status: ServicePartner['status'];
      kind: ProviderKind;
    }>();
  const pick = (rank: 'primary' | 'backup') => {
    const row = results.find((r) => r.rank === rank);
    return row === undefined ? null : { id: row.id, name: row.name, status: row.status, kind: row.kind };
  };
  return { primary: pick('primary'), backup: pick('backup') };
}

interface TenancyRow {
  id: string;
  sf_unit_id: string;
  owner_user_id: string;
  tenant_user_id: string;
  status: TenancyFacts['status'];
  starts_on: string;
  ends_on: string;
}

export async function loadTenancy(
  db: D1Database,
  tenancyId: string,
): Promise<(TenancyFacts & { id: string; sfUnitId: string }) | null> {
  const row = await db
    .prepare(
      'SELECT id, sf_unit_id, owner_user_id, tenant_user_id, status, starts_on, ends_on FROM tenancies WHERE id = ?',
    )
    .bind(tenancyId)
    .first<TenancyRow>();
  if (row === null) return null;
  return {
    id: row.id,
    sfUnitId: row.sf_unit_id,
    ownerUserId: row.owner_user_id,
    tenantUserId: row.tenant_user_id,
    status: row.status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

/** Ownership facts for a request (C-AZ-2). */
export async function requestFacts(
  db: D1Database,
  req: { owner_user_id: string; tenancy_id: string | null; partner_id: string | null },
): Promise<RequestFacts> {
  return {
    ownerUserId: req.owner_user_id,
    tenancy: req.tenancy_id === null ? null : await loadTenancy(db, req.tenancy_id),
    partnerId: req.partner_id,
  };
}
