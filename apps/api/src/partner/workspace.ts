/**
 * Provider workspaces (ADR 0036): what a partner office's company holds, the workspace that follows from it
 * (packages/shared/src/workspace.ts), and the guard that keeps every office endpoint inside it.
 *
 * - GET /api/partner/workspace   partner_admin: the company, its workspace title, services and pages
 *
 * `workspacePage(...)` follows requireRole() on an office route: a company whose workspace has none of the named
 * pages gets 403, whatever the menu shows (C-AZ-1: deny by default). JAD+ Admin's routes never use it.
 */
import {
  OPEN_STATUSES,
  dubaiDate,
  workspaceFor,
  type OfficePage,
  type PartnerWorkspace,
  type ProviderKind,
  type WorkspaceInput,
} from '@jadplus/shared';
import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { managedNowSql } from '../managed/store.js';

type Ctx = Context<AppEnv>;

const OPEN = [...OPEN_STATUSES];

/** What a company's workspace is derived from, read for today. Null when the company does not exist. */
export async function workspaceInput(
  db: D1Database,
  partnerId: string,
  today: string,
): Promise<(WorkspaceInput & { readonly name: string }) | null> {
  const [partner, services, inHand, managed] = await Promise.all([
    db
      .prepare('SELECT name, kind FROM partners WHERE id = ?')
      .bind(partnerId)
      .first<{ name: string; kind: ProviderKind }>(),
    db
      .prepare(
        'SELECT DISTINCT service_code FROM service_partners WHERE partner_id = ? AND ended_at IS NULL ORDER BY service_code',
      )
      .bind(partnerId)
      .all<{ service_code: string }>(),
    db
      .prepare(
        `SELECT DISTINCT service_code FROM requests WHERE partner_id = ?
         AND status IN (${OPEN.map(() => '?').join(', ')}) ORDER BY service_code`,
      )
      .bind(partnerId, ...OPEN)
      .all<{ service_code: string }>(),
    db
      .prepare(
        `SELECT 1 AS yes FROM managed_units m WHERE m.provider_id = ?1 AND ${managedNowSql('m', '?2')} LIMIT 1`,
      )
      .bind(partnerId, today)
      .first<{ yes: number }>(),
  ]);
  if (partner === null) return null;
  return {
    name: partner.name,
    kind: partner.kind,
    services: services.results.map((s) => s.service_code),
    inHand: inHand.results.map((s) => s.service_code),
    managesUnits: managed !== null,
  };
}

/** The signed-in office's company and workspace (ADR 0036). 403 without a company, 404 for an unknown one. */
export async function officeWorkspace(c: Ctx): Promise<PartnerWorkspace> {
  const partnerId = c.get('auth').partnerId;
  if (partnerId === null) throw new ApiError(403, 'Not allowed.');
  const input = await workspaceInput(c.env.DB, partnerId, dubaiDate(c.get('now')));
  if (input === null) throw new ApiError(404, 'Not found.');
  return {
    id: partnerId,
    name: input.name,
    kind: input.kind,
    managesUnits: input.managesUnits,
    workspace: workspaceFor(input),
  };
}

/**
 * Allows a partner or partner office route only when the company's workspace has one of `pages` (ADR 0036).
 * Use after requireRole(); never on JAD+ Admin routes.
 */
export function workspacePage(...pages: readonly OfficePage[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const { workspace } = await officeWorkspace(c);
    if (!pages.some((p) => workspace.pages.includes(p))) throw new ApiError(403, 'Not allowed.');
    await next();
  };
}

export function workspaceRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.get('/workspace', requireRole('partner_admin'), async (c) => c.json(await officeWorkspace(c)));
  return r;
}
