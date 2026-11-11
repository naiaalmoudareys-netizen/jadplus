/**
 * Provider companies on the JAD+ Admin pages (ADR 0030): the kind tag (outside partner or JAD Global team), how a
 * service's requests run (flow), and which providers may be chosen for a service.
 */
import type { ProviderKind, ServiceFlow } from '@jadplus/shared';
import type { Tone } from './format';

export const PROVIDER_KIND_LABELS: Readonly<Record<ProviderKind, { label: string; tone: Tone }>> = {
  external: { label: 'Outside partner', tone: 'calm' },
  jad_group: { label: 'JAD Global team', tone: 'good' },
};

export const FLOW_LABELS: Readonly<Record<ServiceFlow, string>> = {
  visit: 'Home visit',
  report: 'Written report',
  consultation: 'Consultation',
  booking: 'Session booking',
};

interface Choice {
  readonly id: string;
  readonly kind: ProviderKind;
}

/**
 * S3: the providers offered for a service: only its kind (JAD Global teams for in-house services, outside partners
 * for partner services), plus whoever holds the place now, so the choice is never silently blank.
 */
export function providerChoices<P extends Choice>(
  partners: readonly P[],
  kind: ProviderKind,
  current: readonly (P | null)[],
): P[] {
  const choices = partners.filter((p) => p.kind === kind);
  for (const p of current) {
    if (p !== null && !choices.some((c) => c.id === p.id)) choices.push(p);
  }
  return choices;
}
