/**
 * The badge next to the provider's name on a request (S8; ADR 0030): a JAD Global team shows "JAD Global team";
 * an outside partner in good standing with JAD+ shows "JAD+ verified"; otherwise no badge.
 */
import type { ProviderKind } from '@jadplus/shared';

export type ProviderBadge = 'jad_team' | 'verified' | null;

export function providerBadge(kind: ProviderKind | null, verified: boolean): ProviderBadge {
  if (kind === 'jad_group') return 'jad_team';
  return verified ? 'verified' : null;
}
