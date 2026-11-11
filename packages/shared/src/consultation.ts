/**
 * Flow C "consultation" (ADR 0031; BUILD_SPEC O5, O6, P5, S4): property management, leasing, resale, mortgage and
 * Golden Visa run as a conversation in stages, not as a home visit. This file is the pure data: the questions the
 * owner answers when asking, the stages the provider moves the request through, and the consent text.
 *
 * Every id here is mirrored in the database (migration 0028 CHECK lists, drift-tested). The apps translate the
 * labels by id (mobile i18n); the English here is what the console and the API use.
 */

/** The services that run as consultations (services.flow = 'consultation', ADR 0030). */
export const CONSULTATION_SERVICE_CODES = [
  'property-management',
  'leasing',
  'resale',
  'mortgage',
  'golden-visa',
] as const;
export type ConsultationServiceCode = (typeof CONSULTATION_SERVICE_CODES)[number];

export function isConsultationService(code: string): code is ConsultationServiceCode {
  return (CONSULTATION_SERVICE_CODES as readonly string[]).includes(code);
}

export interface ChoiceQuestion {
  readonly id: string;
  readonly kind: 'choice';
  readonly label: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
}

/** A date in the coming year (YYYY-MM-DD, Dubai), e.g. "available from". */
export interface DateQuestion {
  readonly id: string;
  readonly kind: 'date';
  readonly label: string;
}

export type ConsultationQuestion = ChoiceQuestion | DateQuestion;

/** O5: one to three short questions per service, so the provider's first call starts informed. All required. */
export const CONSULTATION_QUESTIONS: Readonly<
  Record<ConsultationServiceCode, readonly ConsultationQuestion[]>
> = {
  'property-management': [
    {
      id: 'tenanted',
      kind: 'choice',
      label: 'Is the unit tenanted now?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
    },
  ],
  leasing: [
    {
      id: 'furnished',
      kind: 'choice',
      label: 'Furnished?',
      options: [
        { id: 'furnished', label: 'Furnished' },
        { id: 'unfurnished', label: 'Unfurnished' },
        { id: 'not_sure', label: 'Not sure yet' },
      ],
    },
    { id: 'available_from', kind: 'date', label: 'Available from' },
  ],
  resale: [
    {
      id: 'timeframe',
      kind: 'choice',
      label: 'When would you like to sell?',
      options: [
        { id: 'asap', label: 'As soon as possible' },
        { id: 'within_3_months', label: 'Within 3 months' },
        { id: 'within_6_months', label: 'Within 6 months' },
        { id: 'exploring', label: 'Just exploring' },
      ],
    },
  ],
  mortgage: [
    {
      id: 'purpose',
      kind: 'choice',
      label: 'Buying or refinancing?',
      options: [
        { id: 'buying', label: 'Buying' },
        { id: 'refinancing', label: 'Refinancing' },
      ],
    },
    {
      id: 'amount',
      kind: 'choice',
      label: 'Approximate amount',
      options: [
        { id: 'under_1m', label: 'Under AED 1 million' },
        { id: '1m_3m', label: 'AED 1 - 3 million' },
        { id: '3m_5m', label: 'AED 3 - 5 million' },
        { id: 'over_5m', label: 'Over AED 5 million' },
      ],
    },
  ],
  'golden-visa': [
    {
      id: 'applicants',
      kind: 'choice',
      label: 'Who is it for?',
      options: [
        { id: 'me', label: 'Me' },
        { id: 'me_and_family', label: 'Me and my family' },
      ],
    },
  ],
};

/** The stages a provider moves a consultation through after first contact (O5, P5). Each one is a milestone reached. */
export const CONSULTATION_STAGES: Readonly<
  Record<ConsultationServiceCode, readonly { readonly id: string; readonly label: string }[]>
> = {
  mortgage: [
    { id: 'pre_approval', label: 'Pre-approval' },
    { id: 'bank_valuation', label: 'Bank valuation' },
    { id: 'offer', label: 'Offer' },
  ],
  'golden-visa': [
    { id: 'eligibility', label: 'Eligibility' },
    { id: 'documents', label: 'Documents' },
    { id: 'submitted', label: 'Submitted' },
    { id: 'approved', label: 'Approved' },
  ],
  resale: [
    { id: 'valuation_plan', label: 'Valuation & plan' },
    { id: 'listed', label: 'Listed' },
    { id: 'offer', label: 'Offer' },
    { id: 'sold', label: 'Sold' },
  ],
  leasing: [
    { id: 'listed', label: 'Listed' },
    { id: 'viewings', label: 'Viewings' },
    { id: 'tenant_found', label: 'Tenant found' },
    { id: 'contract', label: 'Contract' },
  ],
  'property-management': [
    { id: 'proposal', label: 'Proposal' },
    { id: 'agreement_signed', label: 'Agreement signed' },
    { id: 'active', label: 'Active' },
  ],
};

/** Every stage id of every service, once (the database CHECK list). */
export const CONSULTATION_STAGE_IDS = [
  ...new Set(Object.values(CONSULTATION_STAGES).flatMap((stages) => stages.map((s) => s.id))),
] as readonly string[];

/** How a consultation ends (P5): the work was done, or it did not go ahead, with a reason the owner sees. */
export const CONSULTATION_OUTCOMES = ['done', 'did_not_proceed'] as const;
export type ConsultationOutcome = (typeof CONSULTATION_OUTCOMES)[number];

/** Everything recorded on a consultation, in order: first contact, the stages, the end. Mirrors migration 0028. */
export const CONSULTATION_STEP_IDS = [
  'contact_made',
  ...CONSULTATION_STAGE_IDS,
  ...CONSULTATION_OUTCOMES,
] as readonly string[];

/**
 * The consent the owner gives before a consultation is sent (ADR 0031). The version names the wording in every
 * language; a new wording needs a new version, and each request keeps the version the owner accepted.
 */
export const CONSULTATION_CONSENT_VERSION = 'consult-2026-11';

/** The English wording of the consent, with the provider's name (the app shows the same in the owner's language). */
export function consultationConsentText(provider: string): string {
  return `Share my name, unit and contact details with ${provider} so they can contact me.`;
}

/** The questions of a consultation service, or none for any other service. */
export function questionsFor(code: string): readonly ConsultationQuestion[] {
  return isConsultationService(code) ? CONSULTATION_QUESTIONS[code] : [];
}

/** The stages of a consultation service, or none for any other service. */
export function stagesFor(code: string): readonly { readonly id: string; readonly label: string }[] {
  return isConsultationService(code) ? CONSULTATION_STAGES[code] : [];
}
