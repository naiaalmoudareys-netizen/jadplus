/**
 * Object ownership (docs/SECURITY.md C-AZ-2): who may see or act on which records. Deny by default.
 * An owner sees only their units' requests; a tenant only their current tenancy's; a partner only jobs
 * assigned to it; JAD+ staff see everything, and viewers can never change anything.
 * BUILD_SPEC R1-R4, U3, U4, U5.
 */
import type { UserRole } from './auth.js';

/** Who is asking: the person and the role context their session is bound to. */
export interface Actor {
  readonly userId: string;
  readonly role: UserRole;
  readonly partnerId: string | null;
}

/** Tenancy facts needed to decide access. */
export interface TenancyFacts {
  readonly tenantUserId: string;
  readonly ownerUserId: string;
  readonly status: 'invited' | 'active' | 'ended' | 'revoked';
  /** YYYY-MM-DD (Dubai). */
  readonly startsOn: string;
  /** YYYY-MM-DD (Dubai). */
  readonly endsOn: string;
}

/**
 * A tenant's access runs from the start date through the end date, and ends automatically at
 * 00:00 Dubai the day after (U4, U5; docs/adr/0003-sign-in-sessions-access.md). `today` is the Dubai date.
 */
export function isTenancyCurrent(t: TenancyFacts, today: string): boolean {
  return t.status === 'active' && t.startsOn <= today && today <= t.endsOn;
}

/** Request facts needed to decide access. */
export interface RequestFacts {
  /** Current owner of the unit (moves on sale, U3). */
  readonly ownerUserId: string;
  /** The tenancy the request was raised under, if any. */
  readonly tenancy: TenancyFacts | null;
  /** Partner the job is assigned to now. */
  readonly partnerId: string | null;
}

export function canViewRequest(actor: Actor, req: RequestFacts, today: string): boolean {
  switch (actor.role) {
    case 'jad_admin':
    case 'jad_viewer':
      return true;
    case 'owner':
      return req.ownerUserId === actor.userId;
    case 'tenant':
      return (
        req.tenancy !== null &&
        req.tenancy.tenantUserId === actor.userId &&
        isTenancyCurrent(req.tenancy, today)
      );
    case 'partner':
    case 'partner_admin':
      return actor.partnerId !== null && req.partnerId === actor.partnerId;
  }
}

/** Acting (any change) needs view access and a role that can write. Which change is allowed is lifecycle.ts. */
export function canActOnRequest(actor: Actor, req: RequestFacts, today: string): boolean {
  return actor.role !== 'jad_viewer' && canViewRequest(actor, req, today);
}

/** Whether the actor may see a tenancy: its owner, its tenant while current, or JAD+ staff. */
export function canViewTenancy(actor: Actor, t: TenancyFacts, today: string): boolean {
  switch (actor.role) {
    case 'jad_admin':
    case 'jad_viewer':
      return true;
    case 'owner':
      return t.ownerUserId === actor.userId;
    case 'tenant':
      return t.tenantUserId === actor.userId && isTenancyCurrent(t, today);
    case 'partner':
    case 'partner_admin':
      return false;
  }
}
