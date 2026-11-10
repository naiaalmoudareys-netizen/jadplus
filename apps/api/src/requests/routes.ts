/**
 * Request routes for owners and tenants. Phase A: raising an emergency (E1-E3, E12, E14, L3).
 * Routine requests, approvals and quotes follow in phase B.
 */
import { raiseEmergencyBody } from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import type { Deps } from '../context.js';
import type { AppEnv } from '../env.js';
import { parseJsonBody } from '../validate.js';
import { raiseEmergency } from './emergency.js';

export function requestRoutes(deps: Deps): Hono<AppEnv> {
  const requests = new Hono<AppEnv>();
  requests.post('/emergencies', requireRole('owner', 'tenant'), async (c) =>
    c.json(await raiseEmergency(c, deps, await parseJsonBody(c, raiseEmergencyBody)), 201),
  );
  return requests;
}
