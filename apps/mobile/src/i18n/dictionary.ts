/** All of the app's words, merged per language. Add a new part here when a screen gets its own file. */
import type { Language } from '@jadplus/shared';
import { common } from './strings/common.js';
import { labels } from './strings/labels.js';
import { ownerLabels } from './strings/labels-owner.js';
import { requestLabels } from './strings/labels-requests.js';
import { legal } from './strings/legal.js';
import { profile } from './strings/profile.js';
import { merge } from './translate.js';

export const PARTS = [common, profile, legal, labels, requestLabels, ownerLabels] as const;

export type MessageKey = KeysOf<(typeof PARTS)[number]>;

type KeysOf<P> = P extends { readonly en: infer E } ? keyof E & string : never;

// Safe: `words` makes every part list exactly its English keys in every language, so the merged table has
// every MessageKey in every language (and the dictionary test checks it again).
export const DICTIONARY = merge(PARTS) as Readonly<Record<Language, Readonly<Record<MessageKey, string>>>>;
