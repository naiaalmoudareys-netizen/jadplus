/**
 * The console's signed-in state (ADR 0022): which view the person is in, the other views they may switch to,
 * and the anti-forgery token. The session token itself stays in the HttpOnly cookie, out of the page's reach.
 */
import type { ConsoleSessionResponse, MeResponse, RoleContextView, UserRole } from '@jadplus/shared';

export interface Session {
  readonly role: UserRole;
  readonly partnerId: string | null;
  readonly contexts: readonly RoleContextView[];
  readonly csrf: string;
}

/** After a code is verified, or after switching view. */
export function sessionFromSignIn(s: ConsoleSessionResponse): Session {
  return { role: s.context.role, partnerId: s.context.partnerId, contexts: s.contexts, csrf: s.csrf };
}

/** After a page reload; null when this is not a console session. */
export function sessionFromMe(me: MeResponse): Session | null {
  if (me.client !== 'console' || me.csrf === null) return null;
  return { role: me.role, partnerId: me.partnerId, contexts: me.contexts, csrf: me.csrf };
}

const VIEW_NAMES: Readonly<Partial<Record<UserRole, string>>> = {
  jad_admin: 'JAD+ Admin',
  jad_viewer: 'JAD+ Admin (read only)',
  partner_admin: 'Partner office',
};

/** "JAD+ Admin", "Partner office"; partner offices are numbered when a person runs more than one. */
export function viewName(context: RoleContextView, all: readonly RoleContextView[]): string {
  const name = VIEW_NAMES[context.role] ?? context.role;
  const offices = all.filter((c) => c.role === 'partner_admin');
  if (context.role !== 'partner_admin' || offices.length < 2) return name;
  const index = offices.findIndex((c) => c.partnerId === context.partnerId);
  return `${name} ${index + 1}`;
}

/** A stable key for a view, for the switch menu. */
export function contextKey(c: RoleContextView): string {
  return `${c.role}:${c.partnerId ?? ''}`;
}

/** JAD+ Admin may change things; a viewer only reads (C-AZ-1: the API refuses anyway). */
export function canChange(role: UserRole): boolean {
  return role === 'jad_admin' || role === 'partner_admin';
}
