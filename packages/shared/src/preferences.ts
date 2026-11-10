/**
 * Profile settings (ADR 0016): the app language, which messages a person wants, and their consents (L1, N4).
 *
 * - Updates about the person's own requests and emergencies are the service itself: always sent, no switch.
 * - Payment reminders and construction updates: on by default, can be switched off.
 * - News and owners-only offers are marketing: sent only with marketing consent (L1, separate from the terms)
 *   AND the topic switched on (N4). Marketing consent starts off and is given or withdrawn in Profile.
 */
import { z } from 'zod';

/** App languages at launch (Naya, 10-Nov-2026). English is the reference text. */
export const LANGUAGES = ['en', 'ar', 'fr', 'ru', 'zh'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

/** Topics a person can switch on or off. Request and emergency updates are not here: always sent. */
export const NOTIFICATION_TOPICS = ['payments', 'construction', 'news', 'offers'] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];
/** Every kind of message the app sends, for the "may we send it?" rule. */
export type MessageTopic = NotificationTopic | 'requests';

/** News and offers are marketing (L1, L2 "separate marketing consent"). */
export const MARKETING_TOPICS: ReadonlySet<NotificationTopic> = new Set(['news', 'offers']);

/**
 * Current versions of the texts people accept. A new version means asking again (terms) or showing the new
 * text next to the switch (marketing). DRAFT until legal approves the wording (L2).
 */
export const TERMS_VERSION = '2026-11-draft';
export const MARKETING_VERSION = '2026-11-draft';
/** The make-safe limit wording (E8, L2 "make-safe cap pre-authorised"). */
export const MAKE_SAFE_VERSION = '2026-11-draft';

/** The limits an owner can choose for urgent make-safe work in an emergency (AED; E8). */
export const MAKE_SAFE_CAP_CHOICES = [250, 500, 1000, 2000] as const;

export type NotificationSwitches = Readonly<Record<NotificationTopic, boolean>>;

export const DEFAULT_SWITCHES: NotificationSwitches = {
  payments: true,
  construction: true,
  news: true,
  offers: true,
};

/** N4, L1: may this message be sent to this person? */
export function messageAllowed(
  topic: MessageTopic,
  switches: NotificationSwitches,
  marketingConsent: boolean,
): boolean {
  if (topic === 'requests') return true;
  if (MARKETING_TOPICS.has(topic) && !marketingConsent) return false;
  return switches[topic];
}

/** PATCH /api/me/preferences: only what changes; unknown keys refused. */
export const preferencesBody = z
  .strictObject({
    language: z.enum(LANGUAGES).optional(),
    notifications: z
      .strictObject({
        payments: z.boolean().optional(),
        construction: z.boolean().optional(),
        news: z.boolean().optional(),
        offers: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((b) => b.language !== undefined || b.notifications !== undefined, 'Nothing to change.');
export type PreferencesBody = z.infer<typeof preferencesBody>;

/** POST /api/me/consents: accept the current terms, or give / withdraw marketing consent. */
export const consentBody = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('terms'), version: z.literal(TERMS_VERSION), accepted: z.literal(true) }),
  // E8: the owner's make-safe limit, or none (accepted false). Owners only (checked by the API).
  z
    .strictObject({
      kind: z.literal('make_safe_cap'),
      version: z.literal(MAKE_SAFE_VERSION),
      accepted: z.boolean(),
      capAed: z
        .number()
        .refine(
          (n) => (MAKE_SAFE_CAP_CHOICES as readonly number[]).includes(n),
          'Choose one of the offered limits.',
        )
        .nullable(),
    })
    .refine((b) => b.accepted === (b.capAed !== null), 'A limit is given exactly when it is accepted.'),
  z.strictObject({
    kind: z.literal('marketing'),
    version: z.literal(MARKETING_VERSION),
    accepted: z.boolean(),
  }),
]);
export type ConsentBody = z.infer<typeof consentBody>;

const consentState = z.object({ version: z.string(), at: z.number().int() }).nullable();

/** GET /api/me/preferences (and the answer to every change). */
export const preferencesResponse = z.object({
  language: z.enum(LANGUAGES),
  notifications: z.object({
    payments: z.boolean(),
    construction: z.boolean(),
    news: z.boolean(),
    offers: z.boolean(),
  }),
  /** The last terms accepted; `termsCurrent` false means the app must ask again before anything else. */
  terms: consentState,
  termsCurrent: z.boolean(),
  /** Marketing consent: null when never given or withdrawn. */
  marketing: consentState,
  /** E8: the owner's make-safe limit in AED, or null when none is set. */
  makeSafeCap: z.object({ aed: z.number(), at: z.number().int() }).nullable(),
});
export type Preferences = z.infer<typeof preferencesResponse>;
