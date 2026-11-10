/**
 * JAD+ Admin operations (ADR 0025): overview, request actions, people, desk queue, staff, audit log, reports.
 * Mounted on /api/admin next to other routers, so every route declares its own roles (no '*' middleware):
 * reading jad_admin and jad_viewer, changing jad_admin only; staff accounts and the audit log jad_admin only.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../env.js';
import { auditLogRoutes } from './ops/audit-log.js';
import { deskQueueRoutes } from './ops/desk.js';
import { overviewRoutes } from './ops/overview.js';
import { peopleRoutes } from './ops/people.js';
import { personActionRoutes } from './ops/person-actions.js';
import { raiseRoutes } from './ops/raise.js';
import { reportRoutes } from './ops/reports.js';
import { requestActionRoutes } from './ops/requests.js';
import { staffRoutes } from './ops/staff.js';

export function adminOpsRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  overviewRoutes(r);
  requestActionRoutes(r);
  raiseRoutes(r);
  peopleRoutes(r);
  personActionRoutes(r);
  deskQueueRoutes(r);
  staffRoutes(r);
  auditLogRoutes(r);
  reportRoutes(r);
  return r;
}
