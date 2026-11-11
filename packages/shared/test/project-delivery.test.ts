/** Furnishing delivery date and interior design stages (ADR 0034): S4, O5, L4. */
import { describe, expect, it } from 'vitest';
import {
  PROJECT_STAGES,
  currentProjectStage,
  deliveryAllowed,
  deliveryBody,
  deliveryRefusal,
  nextProjectStages,
  projectStageBody,
  projectTimeline,
  stagesAllowed,
  type ProjectState,
} from '../src/index.js';

const TODAY = '2026-11-11';
const furnishing: ProjectState = { serviceCode: 'furnishing', status: 'scheduled', quoteApproved: true };
const design: ProjectState = { serviceCode: 'interior-design', status: 'in_progress', quoteApproved: true };

describe('furnishing delivery date (S4)', () => {
  it('S4: the provider sets the delivery date after the owner approved the furnishing quote (L4)', () => {
    expect(deliveryAllowed('partner', furnishing)).toBe(true);
    expect(deliveryAllowed('partner_admin', { ...furnishing, status: 'in_progress' })).toBe(true);
    expect(deliveryAllowed('partner', { ...furnishing, quoteApproved: false })).toBe(false);
    expect(deliveryAllowed('partner', { ...furnishing, status: 'quote_sent' })).toBe(false);
    expect(deliveryAllowed('partner', { ...furnishing, status: 'completed' })).toBe(false);
    expect(deliveryAllowed('partner', { ...furnishing, serviceCode: 'maintenance' })).toBe(false);
    expect(deliveryAllowed('owner', furnishing)).toBe(false);
  });

  it('S4: the first date needs no reason; moving it needs one; today up to a year ahead', () => {
    const first = { date: '2026-11-20', slot: 'morning' as const, reason: null };
    expect(deliveryRefusal(null, first, TODAY)).toBeNull();
    expect(deliveryRefusal(null, { ...first, date: '2026-11-10' }, TODAY)).toBe('in_past');
    expect(deliveryRefusal(null, { ...first, date: '2027-11-12' }, TODAY)).toBe('too_far');
    const current = { date: '2026-11-20', slot: 'morning' as const };
    expect(deliveryRefusal(current, { ...first, date: '2026-11-21' }, TODAY)).toBe('reason_needed');
    expect(
      deliveryRefusal(current, { ...first, slot: 'afternoon', reason: 'Supplier delay.' }, TODAY),
    ).toBeNull();
    expect(deliveryRefusal(current, first, TODAY)).toBe('unchanged');
  });

  it('S4: the body is strict, the window is a visit window and the reason plain text', () => {
    expect(deliveryBody.safeParse({ date: '2026-11-20', slot: 'midday', reason: null }).success).toBe(true);
    expect(deliveryBody.safeParse({ date: '2026-11-20', slot: 'night', reason: null }).success).toBe(false);
    expect(deliveryBody.safeParse({ date: '2026-11-20', slot: 'midday', reason: '<b>x</b>' }).success).toBe(
      false,
    );
    expect(deliveryBody.safeParse({ date: '2026-11-20', slot: 'midday', reason: null, x: 1 }).success).toBe(
      false,
    );
  });
});

describe('interior design stages (O5)', () => {
  it('O5: Concept → Design approved → Fit-out → Handover, in that order', () => {
    expect(PROJECT_STAGES).toEqual(['concept', 'design_approved', 'fit_out', 'handover']);
  });

  it('O5: only the office moves stages, on an interior design request with an approved quote', () => {
    expect(stagesAllowed('partner_admin', design)).toBe(true);
    expect(stagesAllowed('partner_admin', { ...design, status: 'completed' })).toBe(true);
    expect(stagesAllowed('partner', design)).toBe(false);
    expect(stagesAllowed('partner_admin', { ...design, quoteApproved: false })).toBe(false);
    expect(stagesAllowed('partner_admin', { ...design, serviceCode: 'furnishing' })).toBe(false);
    expect(stagesAllowed('partner_admin', { ...design, status: 'closed' })).toBe(false);
  });

  it('O5: stages move forward only; skipping is allowed', () => {
    expect(nextProjectStages([])).toEqual(PROJECT_STAGES);
    expect(nextProjectStages(['concept'])).toEqual(['design_approved', 'fit_out', 'handover']);
    expect(nextProjectStages(['concept', 'fit_out'])).toEqual(['handover']);
    expect(nextProjectStages(['handover'])).toEqual([]);
    expect(currentProjectStage(['concept', 'fit_out'])).toBe('fit_out');
    expect(currentProjectStage([])).toBeNull();
  });

  it('O5: the owner’s timeline lists every stage, reached or not, with its note', () => {
    const t = projectTimeline([{ stage: 'concept', at: 5, note: 'Mood board shared.' }]);
    expect(t.map((s) => s.stage)).toEqual(PROJECT_STAGES);
    expect(t[0]).toEqual({ stage: 'concept', at: 5, note: 'Mood board shared.' });
    expect(t[1]).toEqual({ stage: 'design_approved', at: null, note: null });
    expect(projectStageBody.safeParse({ stage: 'fit_out', note: null }).success).toBe(true);
    expect(projectStageBody.safeParse({ stage: 'party', note: null }).success).toBe(false);
  });
});
