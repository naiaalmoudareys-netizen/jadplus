/**
 * Consultation words for the partner office console (ADR 0031): the owner's answers, the best time to call, the
 * consent and the stage names, in English (the console is English). The rules themselves are in packages/shared.
 */
import {
  consultationConsentText,
  consultationTimeline,
  questionsFor,
  stagesFor,
  type ConsultationView,
} from '@jadplus/shared';
import { dateTime, dayText, humanize, preferredText, type Tone } from './format';

const STEP_NAMES: Readonly<Record<string, string>> = {
  contact_made: 'Contact made',
  done: 'Done',
  did_not_proceed: 'Did not proceed',
};

/** "Bank valuation", "Contact made", "Did not proceed": a step of this service by its id. */
export function stepName(serviceCode: string, id: string): string {
  return STEP_NAMES[id] ?? stagesFor(serviceCode).find((s) => s.id === id)?.label ?? humanize(id);
}

/** The owner's answers as question / answer lines, in the service's order. */
export function answerLines(
  v: Pick<ConsultationView, 'serviceCode' | 'answers'>,
): { question: string; answer: string }[] {
  return questionsFor(v.serviceCode).map((q) => {
    const value = v.answers[q.id] ?? '';
    const answer =
      q.kind === 'date' ? dayText(value) : (q.options.find((o) => o.id === value)?.label ?? humanize(value));
    return { question: q.label, answer };
  });
}

/** "12 Nov 2026 · Morning (9:00 - 12:00)", or a dash when the owner gave none. */
export function bestTimeText(v: Pick<ConsultationView, 'bestTime'>): string {
  return v.bestTime === null ? '-' : preferredText(v.bestTime);
}

/** What the owner agreed to, when, and the wording version, for the job page. */
export function consentLine(v: Pick<ConsultationView, 'consent'>): string {
  const { providerName, at, version } = v.consent;
  return `“${consultationConsentText(providerName)}” Agreed ${dateTime(at)} (wording ${version}).`;
}

/**
 * A consultation is a call, not a visit (ADR 0031): instead of "Answered: no visit booked yet", whether the office
 * has made contact with the owner, and when.
 */
export function contactFact(v: Pick<ConsultationView, 'steps'>): { text: string; tone: Tone } {
  const made = v.steps.find((s) => s.step === 'contact_made');
  return made === undefined
    ? { text: 'Not contacted yet', tone: 'warn' }
    : { text: `Contact made ${dateTime(made.at)}`, tone: 'good' };
}

/** Where the consultation stands now: the current stage, or how it ended ("Done", "Did not proceed", "Closed"). */
export function currentStageText(v: Pick<ConsultationView, 'serviceCode' | 'status' | 'steps'>): string {
  const timeline = consultationTimeline(v.serviceCode, v.status, v.steps);
  const current = timeline.find((item) => item.state === 'current');
  if (current !== undefined) return stepName(v.serviceCode, current.id);
  const last = timeline.at(-1);
  if (last?.state === 'done') return stepName(v.serviceCode, last.id);
  return v.status === 'cancelled' ? 'Cancelled' : 'Closed';
}
