import { describe, expect, it } from 'vitest';
import {
  dispatchFor,
  emergencyConfirmationText,
  emergencyEscalation,
  qualifiesAsEmergency,
} from '../src/emergency.js';
import { allowedTransitions, canTransition, clockPaused } from '../src/lifecycle.js';

describe('emergency rules', () => {
  it('E5/E6: reminder at 15 min, backup at 30 min, nothing once acknowledged', () => {
    expect(emergencyEscalation(10, false)).toBe('none');
    expect(emergencyEscalation(15, false)).toBe('remind_primary');
    expect(emergencyEscalation(30, false)).toBe('move_to_backup');
    expect(emergencyEscalation(45, true)).toBe('none');
  });

  it('E14: AC failure is an emergency only from May to October', () => {
    expect(qualifiesAsEmergency('ac_failure', 5)).toBe(true);
    expect(qualifiesAsEmergency('ac_failure', 10)).toBe(true);
    expect(qualifiesAsEmergency('ac_failure', 11)).toBe(false);
    expect(qualifiesAsEmergency('water_leak', 1)).toBe(true);
  });

  it('L3: confirmation text has no instructions', () => {
    expect(emergencyConfirmationText('our maintenance partner')).toBe(
      'Your emergency has been sent to our maintenance partner.',
    );
  });

  it('E12: shared parts go to building FM, fire systems to FM only', () => {
    expect(dispatchFor('unit')).toEqual({ partner: true, buildingFm: false });
    expect(dispatchFor('building')).toEqual({ partner: true, buildingFm: true });
    expect(dispatchFor('fire_system')).toEqual({ partner: false, buildingFm: true });
  });
});

describe('request lifecycle', () => {
  it('A1: only the owner (or JAD after calling) approves a tenant request', () => {
    expect(canTransition('owner', 'awaiting_owner', 'submitted')).toBe(true);
    expect(canTransition('tenant', 'awaiting_owner', 'submitted')).toBe(false);
    expect(canTransition('partner', 'awaiting_owner', 'submitted')).toBe(false);
  });

  it('L4: JAD and partners never approve a quote for the owner', () => {
    expect(canTransition('owner', 'quote_sent', 'scheduled')).toBe(true);
    expect(canTransition('jad_admin', 'quote_sent', 'scheduled')).toBe(false);
    expect(canTransition('partner', 'quote_sent', 'scheduled')).toBe(false);
  });

  it('A5: residents can reopen completed work', () => {
    expect(canTransition('tenant', 'completed', 'reopened')).toBe(true);
    expect(canTransition('owner', 'completed', 'reopened')).toBe(true);
  });

  it('viewers can never change anything (deny by default)', () => {
    expect(allowedTransitions('jad_viewer', 'submitted')).toEqual([]);
  });

  it('A6: the clock pauses on hold and while waiting for the owner', () => {
    expect(clockPaused('on_hold')).toBe(true);
    expect(clockPaused('quote_sent')).toBe(true);
    expect(clockPaused('in_progress')).toBe(false);
  });
});
