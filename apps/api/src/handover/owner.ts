/**
 * The owner's handover checklists (O2; ADR 0033), shown in My unit:
 * - GET /api/me/handovers   the checklists of the units on the owner's own list (joint buyers see the same one)
 * Owners only: a tenant never sees a handover (R2). To ask for another key collection time the owner writes on
 * the handover request (its messages), which the handover team reads.
 */
import type { OwnerHandovers } from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { loadChecklists, ownerView } from './store.js';

export function ownerHandoverRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/me/handovers', requireRole('owner'), async (c) => {
    const lists = await loadChecklists(c.env.DB, c.get('keys'), {
      kind: 'owner',
      userId: c.get('auth').userId,
    });
    return c.json({ handovers: lists.map(ownerView) } satisfies OwnerHandovers);
  });

  return r;
}
