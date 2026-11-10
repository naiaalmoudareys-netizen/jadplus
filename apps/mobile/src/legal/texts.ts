/**
 * The terms of use (L1, L2) and the privacy notice shown in the app. DRAFT for legal review (ADR 0016): ported
 * from the prototype's drafts (portal-live, version 2026-11-05) with the plan's L2 points for services added
 * (platform only, no advice, not an emergency service, partners contract with the owner, make-safe cap,
 * targets not guarantees, separate marketing consent). English only until legal approves the wording; the
 * app says so in the other languages. Changing the text means a new TERMS_VERSION in packages/shared.
 */
import { MARKETING_VERSION, TERMS_VERSION } from '@jadplus/shared';

export interface LegalSection {
  readonly heading: string;
  readonly body: readonly string[];
}

export interface LegalText {
  readonly title: string;
  readonly version: string;
  readonly sections: readonly LegalSection[];
}

export const TERMS: LegalText = {
  title: 'Terms of use',
  version: TERMS_VERSION,
  sections: [
    {
      heading: 'About these terms',
      body: [
        'These terms apply when you use JAD+, the after-sales app of JAD Global Real Estate Development L.L.C ("JAD Global"). They sit alongside your purchase agreement or tenancy contract, which always takes priority.',
      ],
    },
    {
      heading: 'Who can use JAD+',
      body: [
        "JAD+ is for buyers of JAD Global residences whose purchase is recorded with JAD Global, their tenants invited through JAD+, and JAD Global's service partners. You sign in with the email or mobile number on your record and a one-time code. Do not share your codes, and tell the JAD+ desk at once if you think someone else has used your account.",
      ],
    },
    {
      heading: 'What JAD+ is',
      body: [
        'JAD+ is a platform that connects you with JAD Global and with independent, licensed service partners. JAD Global does not give legal, financial, tax or investment advice. Valuations are indicative only. Response and visit times are targets, not guarantees.',
      ],
    },
    {
      heading: 'Not an emergency service',
      body: [
        'JAD+ is not an emergency service. If anyone is in danger, call 999 (police), 998 (ambulance) or 997 (fire). For fire, smoke, a gas smell or an injury, call these numbers first; JAD+ does not send a technician until the building is safe.',
      ],
    },
    {
      heading: 'Service partners',
      body: [
        "Work in your residence is carried out by the service partner named on your request, under a contract between you and that partner. JAD Global checks partners' licences and insurance and follows up their service, but is not a party to that work.",
        'JAD Global never approves chargeable work for you: you approve every quote. The only exception is urgent work to make your residence safe, up to the make-safe amount you agree to in JAD+. Any permanent repair needs your approval of a quote.',
      ],
    },
    {
      heading: 'Your information in JAD+',
      body: [
        "JAD+ shows information from JAD Global's records: your residence, payment plan, payments, receipts, documents and construction progress. We work to keep it accurate, but the official records of JAD Global and the Dubai Land Department prevail. Payments may take up to two working days to appear. Construction progress and expected dates are for information and do not change your purchase agreement.",
      ],
    },
    {
      heading: 'Payments',
      body: [
        '"Pay now" opens JAD Global\'s secure payment page, which has its own terms. JAD+ never sees or stores your card details. A payment counts once JAD Global has received and confirmed it.',
      ],
    },
    {
      heading: 'Requests and offers',
      body: [
        'Requests to the JAD+ desk are handled by JAD Global within reasonable time. Exclusive offers are available only while the residence is available and until the date shown, and become binding only through a signed reservation and purchase agreement. News and offers are sent to you only if you agree to receive them; you can stop at any time in your profile.',
      ],
    },
    {
      heading: 'Fair use',
      body: [
        "Use JAD+ only for your own residences and requests. Do not try to access other people's information, interfere with JAD+, or arrange paid work with a partner outside JAD+. We may suspend access to protect owners, residents or JAD+.",
      ],
    },
    {
      heading: 'Availability and liability',
      body: [
        'We aim to keep JAD+ available at all times but cannot guarantee it will be uninterrupted. To the extent the law allows, JAD Global is not liable for indirect loss arising from the use of JAD+ or for the work of service partners.',
      ],
    },
    {
      heading: 'Closing your account',
      body: [
        'You can ask to close your JAD+ account at any time from your profile. Your purchase and its records remain in place with JAD Global.',
      ],
    },
    {
      heading: 'Law',
      body: [
        'These terms are governed by the laws of the United Arab Emirates as applied in Dubai, and the courts of Dubai have jurisdiction.',
      ],
    },
  ],
};

export const PRIVACY: LegalText = {
  title: 'Privacy notice',
  version: TERMS_VERSION,
  sections: [
    {
      heading: 'Who is responsible',
      body: [
        'JAD Global Real Estate Development L.L.C, Dubai, United Arab Emirates, is responsible for your personal data in JAD+. You can reach us through the JAD+ desk in your profile.',
      ],
    },
    {
      heading: 'What we use',
      body: [
        'From your purchase records (already held by JAD Global): your name, email, mobile, the residences you bought or reserved, your payment plan, receipts and statements, and copies of identity documents you gave JAD Global.',
        'What you give us in JAD+: your requests, messages and photos, your language and notification choices, and your consents.',
        'Security data: sign-in codes (stored only in scrambled form), sign-in times, and your IP address (stored only in scrambled form).',
        'JAD+ does not use advertising trackers, and we do not sell your personal data.',
      ],
    },
    {
      heading: 'Why we use it',
      body: [
        'To let you sign in securely and show you your own residences, payments, documents and requests; to pass your requests to the service partner who handles them; to protect your account and JAD+ against misuse; and to meet our legal obligations.',
        `With your consent only (version ${MARKETING_VERSION}): to send you JAD Global news, new launches and exclusive offers. You can switch this off at any time in your profile.`,
      ],
    },
    {
      heading: 'Who we share it with',
      body: [
        'The service partner handling your request sees only what it needs: your name, the residence and the request. All contact with partners happens inside JAD+.',
        "Service providers who run JAD+ for us, under contract: Salesforce (JAD Global's customer records) and Cloudflare (hosting, with your data encrypted). We may also share data where the law requires it, for example with the Dubai Land Department.",
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'Sign-in sessions end after a period of inactivity, or when you sign out. Security records are kept for one year. Requests and their photos are kept for five years for warranty and disputes. Consent records are kept for five years after your account closes. Purchase records stay with JAD Global as the law and your purchase agreement require.',
      ],
    },
    {
      heading: 'Your rights',
      body: [
        'Under the UAE Personal Data Protection Law you can ask to access your data, correct it, restrict or object to its use, withdraw your consent for news and offers, and close your JAD+ account. Use "Request a copy of my data", "Update my contact details" or "Close my JAD+ account" in your profile. We reply within 30 days.',
      ],
    },
    {
      heading: 'Changes',
      body: [
        'If this notice or the terms change in a meaningful way, JAD+ will ask you to read and accept the new version the next time you open the app.',
      ],
    },
  ],
};

export const LEGAL_TEXTS = { terms: TERMS, privacy: PRIVACY } as const;
export type LegalDoc = keyof typeof LEGAL_TEXTS;
