/**
 * JAD+ Admin's "Needs action" list (ADR 0023; E4-E7, R4, A7, A1, A3, ADR 0011), grouped by kind in the order
 * of packages/shared/src/console.ts, with a plain title per group and how late each item is.
 */
import { ATTENTION_KINDS, type AdminAttention, type AttentionKind } from '@jadplus/shared';
import { ago, duration } from './format';

export type AttentionItem = AdminAttention['items'][number];

export const ATTENTION_TITLES: Readonly<Record<AttentionKind, string>> = {
  emergency_unacknowledged: 'Emergencies nobody has acknowledged',
  overdue: 'Requests past their deadline',
  no_access_rebook: 'No access, and no new visit within 24 hours',
  owner_approval_call: 'Tenant requests waiting 48 hours for the owner: call the owner',
  quote_stuck: 'Declined quotes with no revised quote after 3 days',
  desk_request: 'JAD+ desk requests to handle',
};

export interface AttentionGroup {
  readonly kind: AttentionKind;
  readonly title: string;
  readonly items: readonly AttentionItem[];
}

/** Non-empty groups, most urgent kind first; inside a group the oldest first. */
export function groupAttention(items: readonly AttentionItem[]): AttentionGroup[] {
  return ATTENTION_KINDS.map((kind) => ({
    kind,
    title: ATTENTION_TITLES[kind],
    items: items.filter((i) => i.kind === kind).sort((a, b) => a.since - b.since),
  })).filter((g) => g.items.length > 0);
}

/**
 * How long it has been. For emergencies and desk requests `since` is when it was raised; for the other kinds
 * it is the deadline that passed (console.ts).
 */
export function attentionTiming(item: Pick<AttentionItem, 'kind' | 'since'>, now: number): string {
  if (item.kind === 'emergency_unacknowledged' || item.kind === 'desk_request') {
    return `Raised ${ago(item.since, now)}`;
  }
  return `Overdue by ${duration(now - item.since)}`;
}
