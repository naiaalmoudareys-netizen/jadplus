/** All of the app's words, merged per language. Add a new part here when a screen gets its own file. */
import type { Language } from '@jadplus/shared';
import { common } from './strings/common.js';
import { labels } from './strings/labels.js';
import { ownerLabels } from './strings/labels-owner.js';
import { requestLabels } from './strings/labels-requests.js';
import { legal } from './strings/legal.js';
import { profile } from './strings/profile.js';
import { screensAccess } from './strings/screens-access.js';
import { screensHelp } from './strings/screens-help.js';
import { screensExtras } from './strings/screens-extras.js';
import { screensInbox } from './strings/screens-inbox.js';
import { screensJourney } from './strings/screens-journey.js';
import { screensOwner } from './strings/screens-owner.js';
import { screensOwner2 } from './strings/screens-owner-2.js';
import { screensPartner } from './strings/screens-partner.js';
import { screensRequests } from './strings/screens-requests.js';
import { screensTenancy } from './strings/screens-tenancy.js';
import { screensTenancy2 } from './strings/screens-tenancy-2.js';
import { merge } from './translate.js';

export const PARTS = [
  common,
  profile,
  legal,
  labels,
  requestLabels,
  ownerLabels,
  screensOwner,
  screensOwner2,
  screensRequests,
  screensAccess,
  screensHelp,
  screensJourney,
  screensInbox,
  screensExtras,
  screensTenancy,
  screensTenancy2,
  screensPartner,
] as const;

export type MessageKey = KeysOf<(typeof PARTS)[number]>;

type KeysOf<P> = P extends { readonly en: infer E } ? keyof E & string : never;

// Safe: `words` makes every part list exactly its English keys in every language, so the merged table has
// every MessageKey in every language (and the dictionary test checks it again).
export const DICTIONARY = merge(PARTS) as Readonly<Record<Language, Readonly<Record<MessageKey, string>>>>;
