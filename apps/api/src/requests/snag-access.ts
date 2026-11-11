/**
 * Who may reach a snagging request's snag list, and how (ADR 0032; O3, C-AZ-2): the owner, the provider the
 * request is assigned to, JAD+ staff (read only), or a JAD Global team assigned to the handover service (only
 * the snag list and its photos of an open snagging request with a report). Shared by the snag routes.
 */
import {
  canViewRequest,
  dubaiDate,
  mayFixSnag,
  type PhotoType,
  type Snag,
  type SnagStatus,
} from '@jadplus/shared';
import type { Context } from 'hono';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { loadReport, stillOpen, type ReportFlow } from './report-store.js';
import { requestFacts } from './store.js';

type Ctx = Context<AppEnv>;

export const EXTENSION: Readonly<Record<PhotoType, string>> = { 'image/jpeg': 'jpg', 'image/png': 'png' };
export const NOT_FOUND = 'Not found.';
export const NOT_NOW = 'This step is not possible for this snag now. Refresh and try again.';

/** How the signed-in person relates to a request's snag list. */
export type SnagAccess = 'owner' | 'provider' | 'handover' | 'staff';

/** Active JAD Global teams assigned to the handover service (O3: the developer side that fixes snags). */
export async function handoverTeams(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT sp.partner_id FROM service_partners sp JOIN partners p ON p.id = sp.partner_id
       WHERE sp.service_code = 'handover' AND sp.ended_at IS NULL AND p.kind = 'jad_group' AND p.status = 'active'`,
    )
    .all<{ partner_id: string }>();
  return results.map((r) => r.partner_id);
}

export interface SnagFlow extends ReportFlow {
  readonly access: SnagAccess;
}

/** The snagging request and how the person may reach its snag list; 404 when they may not (C-AZ-2). */
export async function snagFlow(c: Ctx, id: string): Promise<SnagFlow> {
  const flow = await loadReport(c, id);
  if (flow.facts.service !== 'snagging') throw new ApiError(404, NOT_FOUND);
  const actor = c.get('auth');
  const db = c.env.DB;
  const visible = canViewRequest(actor, await requestFacts(db, flow.row), dubaiDate(c.get('now')));
  const role = actor.role;
  let access: SnagAccess | null = null;
  if (visible && role === 'owner') access = 'owner';
  else if (visible && (role === 'partner' || role === 'partner_admin')) access = 'provider';
  else if (visible && (role === 'jad_admin' || role === 'jad_viewer')) access = 'staff';
  else if (
    (role === 'partner' || role === 'partner_admin') &&
    flow.state.reported &&
    stillOpen(flow.row) &&
    actor.partnerId !== null &&
    (await handoverTeams(db)).includes(actor.partnerId)
  ) {
    access = 'handover';
  }
  if (access === null) throw new ApiError(404, NOT_FOUND);
  return { ...flow, access };
}

export interface SnagRow {
  id: string;
  title: string;
  room: string;
  status: SnagStatus;
  photo_r2_key: string | null;
  fix_photo_r2_key: string | null;
  fixed_at: number | null;
  reopen_count: number;
}

export const SNAG_COLUMNS =
  's.id, s.title, s.room, s.status, s.photo_r2_key, s.fix_photo_r2_key, s.fixed_at, s.reopen_count';

export function toSnag(s: SnagRow): Snag {
  return {
    id: s.id,
    title: s.title,
    room: s.room,
    status: s.status,
    hasPhoto: s.photo_r2_key !== null,
    hasFixPhoto: s.fix_photo_r2_key !== null,
    fixedAt: s.fixed_at,
    reopenCount: s.reopen_count,
  };
}

export async function loadSnag(db: D1Database, requestId: string, snagId: string): Promise<SnagRow> {
  const snag = await db
    .prepare(
      `SELECT ${SNAG_COLUMNS} FROM snags s WHERE s.id = ? AND s.request_id = ? AND s.removed_at IS NULL`,
    )
    .bind(snagId, requestId)
    .first<SnagRow>();
  if (snag === null) throw new ApiError(404, NOT_FOUND);
  return snag;
}

/** Whether the person may change snags now (JAD+ viewers and JAD+ Admin only read the list here). */
export function canFix(c: Ctx, f: SnagFlow, teams: readonly string[]): boolean {
  return (
    (f.access === 'provider' || f.access === 'handover') &&
    f.state.reported &&
    stillOpen(f.row) &&
    mayFixSnag(c.get('auth'), f.row.partner_id, teams)
  );
}
