/** Provider companies on the JAD+ Admin pages (ADR 0030): S3, S4, P6. */
import { FIRST_DUE_KINDS, PROVIDER_KINDS, SERVICE_FLOWS, type ProviderKind } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { dueKindText } from '../src/lib/jobs';
import { NOTE_KIND_LABELS } from '../src/lib/labels';
import { FLOW_LABELS, PROVIDER_KIND_LABELS, providerChoices } from '../src/lib/providers';

interface Provider {
  readonly id: string;
  readonly name: string;
  readonly kind: ProviderKind;
}
const harbor: Provider = { id: 'harbor-re', name: 'Harbor Real Estate (demo)', kind: 'jad_group' };
const fixers: Provider = { id: 'p-1', name: 'Demo Fixers LLC', kind: 'external' };
const oldTeam: Provider = { id: 'p-2', name: 'Old Team', kind: 'external' };

describe('providers on the Services page (ADR 0030)', () => {
  it('S3: an in-house service offers JAD Global teams, a partner service outside partners', () => {
    expect(providerChoices([harbor, fixers], 'jad_group', [null, null]).map((p) => p.id)).toEqual([
      'harbor-re',
    ]);
    expect(providerChoices([harbor, fixers], 'external', [null, null]).map((p) => p.id)).toEqual(['p-1']);
  });

  it('S3: whoever holds the place now is still shown, so the choice is never silently blank', () => {
    expect(providerChoices([harbor], 'jad_group', [oldTeam, null]).map((p) => p.id)).toEqual([
      'harbor-re',
      'p-2',
    ]);
  });

  it('every kind and flow has a label', () => {
    for (const kind of PROVIDER_KINDS) expect(PROVIDER_KIND_LABELS[kind].label).not.toBe('');
    for (const flow of SERVICE_FLOWS) expect(FLOW_LABELS[flow]).not.toBe('');
    expect(PROVIDER_KIND_LABELS.jad_group.label).toBe('JAD Global team');
  });

  it('S4: every first deadline of a service reads in plain words on job pages', () => {
    for (const kind of FIRST_DUE_KINDS) expect(dueKindText(kind)).not.toBe(kind);
    expect(dueKindText('first_contact')).toBe('Contact the owner');
    expect(NOTE_KIND_LABELS.handled_by_jad).toBe('Handled by JAD+');
  });
});
