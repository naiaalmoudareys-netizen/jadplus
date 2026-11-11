/**
 * How a provider workspace reads in the console (ADR 0036): the office header (company, kind, workspace title,
 * service chips) and the one-line workspace summary JAD+ Admin sees for each provider.
 */
import { workspaceFor, type PartnerWorkspace, type ProviderKind, type WorkspaceInput } from '@jadplus/shared';
import type { Tone } from './format';
import { officePageLabels } from './nav';

export const KIND_TAGS: Readonly<Record<ProviderKind, { readonly label: string; readonly tone: Tone }>> = {
  jad_group: { label: 'JAD Global team', tone: 'good' },
  external: { label: 'Partner', tone: 'calm' },
};

export interface OfficeHeader {
  readonly company: string;
  readonly kind: { readonly label: string; readonly tone: Tone };
  readonly title: string;
  readonly subtitle: string;
  /** "Also: Finance & residency advisory", or null for a company with one kind of work. */
  readonly also: string | null;
  /** The services it handles, as small chips. */
  readonly chips: readonly string[];
}

/** What the office header shows for a workspace. */
export function officeHeader(w: PartnerWorkspace): OfficeHeader {
  return {
    company: w.name,
    kind: KIND_TAGS[w.kind],
    title: w.workspace.title,
    subtitle: w.workspace.subtitle,
    also: w.workspace.also.length === 0 ? null : `Also: ${w.workspace.also.join(' · ')}`,
    chips: w.workspace.services.map((s) => s.name),
  };
}

export interface WorkspaceSummary {
  readonly title: string;
  readonly pages: readonly string[];
}

/** For JAD+ Admin: a provider's workspace title and the pages its console has, in menu order. */
export function workspaceSummary(input: WorkspaceInput): WorkspaceSummary {
  const ws = workspaceFor(input);
  return { title: ws.title, pages: officePageLabels(ws.pages) };
}
