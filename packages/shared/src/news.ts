/**
 * News & exclusive offers in the owner app (docs/DESIGN.md N1-N3; decided by Naya 10-Nov-2026). Marketing
 * publishes posts in Salesforce (JAD_Plus_Post__c); JAD+ only reads them. Salesforce already filters what an
 * owner may see; JAD+ applies the date rule again so an expired offer is never shown from a stale answer.
 */

export const OFFER_TYPE = 'Exclusive offer';

export interface PostFacts {
  readonly type: string;
  readonly pinned: boolean;
  /** Publish date YYYY-MM-DD. */
  readonly date: string;
  /** Last day shown, YYYY-MM-DD, or null. */
  readonly expires: string | null;
}

export type NewsFilter = 'all' | 'news' | 'offers';

export function isOffer(post: Pick<PostFacts, 'type'>): boolean {
  return post.type === OFFER_TYPE;
}

/** N3: shown from its publish date through its expiry date (Dubai dates). */
export function postVisible(post: PostFacts, today: string): boolean {
  return post.date <= today && (post.expires === null || today <= post.expires);
}

/** N1: visible posts, pinned first, then newest first, narrowed by the filter. */
export function newsFeed<P extends PostFacts>(posts: readonly P[], filter: NewsFilter, today: string): P[] {
  return posts
    .filter((p) => postVisible(p, today))
    .filter((p) => filter === 'all' || (filter === 'offers') === isOffer(p))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date));
}

/** N1: the count shown on the "Offers" filter. */
export function offerCount(posts: readonly PostFacts[], today: string): number {
  return posts.filter((p) => isOffer(p) && postVisible(p, today)).length;
}
