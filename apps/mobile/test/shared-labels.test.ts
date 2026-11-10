/**
 * packages/shared's labels in the app (ADR 0016): the English is exactly packages/shared's (so nothing changes
 * for English readers and a new or renamed label is caught here), and the other languages are looked up by code.
 */
import {
  DESK_REQUEST_HINTS,
  DESK_REQUEST_TYPES,
  EMERGENCY_TYPE_LABELS,
  SERVICES,
  SERVICE_GROUPS,
  VISIT_SLOTS,
  arrivalChoices,
  instalmentState,
  type Instalment,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { translator } from '../src/i18n/lang.js';
import {
  arrivalChoiceLabel,
  deskHint,
  deskTypeLabel,
  emergencyTypeLabel,
  instalmentLabel,
  serviceBlurb,
  serviceGroupLabel,
  serviceName,
  visitSlotLabel,
  visitSlotText,
} from '../src/i18n/sharedLabels.js';

const en = translator('en');
const ar = translator('ar');
const ru = translator('ru');
const zh = translator('zh');

describe('shared labels in English match packages/shared', () => {
  it('S1: every service name, blurb and group', () => {
    for (const s of SERVICES) {
      expect(serviceName(s.code, '?', en)).toBe(s.name);
      expect(serviceBlurb(s.code, '?', en)).toBe(s.blurb);
    }
    expect(SERVICE_GROUPS.map((g) => serviceGroupLabel(g, en))).toEqual([...SERVICE_GROUPS]);
  });

  it('ADR 0013: visit windows', () => {
    for (const s of VISIT_SLOTS) {
      expect(visitSlotLabel(s.key, en)).toBe(s.label);
      expect(visitSlotText(s, en)).toBe(`${s.label} (${s.hours})`);
    }
  });

  it('E2: emergency kinds (older requests keep their label)', () => {
    for (const [type, label] of Object.entries(EMERGENCY_TYPE_LABELS)) {
      expect(emergencyTypeLabel(type as keyof typeof EMERGENCY_TYPE_LABELS, en)).toBe(label);
    }
  });

  it('E4: arrival windows a technician picks', () => {
    arrivalChoices(Date.UTC(2026, 10, 10, 6)).forEach((c, i) => {
      expect(arrivalChoiceLabel(i, '?', en)).toBe(c.label);
    });
    expect(arrivalChoiceLabel(9, 'Later', en)).toBe('Later');
  });

  it('ADR 0011: desk request types and hints', () => {
    for (const type of DESK_REQUEST_TYPES) {
      expect(deskTypeLabel(type, en)).toBe(type);
      expect(deskHint(type, en)).toBe(DESK_REQUEST_HINTS[type]);
    }
  });

  it('R1/O1: instalment states read exactly as packages/shared words them', () => {
    const today = '2026-11-10';
    const cases: Instalment[] = [
      { name: 'Down payment', seq: 1, amount: 100, paid: 100, due: '2026-01-01', description: null },
      { name: 'On handover', seq: 9, amount: 100, paid: 0, due: null, description: null },
      { name: 'Instalment 4', seq: 4, amount: 100, paid: 0, due: null, description: null },
      { name: 'Instalment 2', seq: 2, amount: 100, paid: 0, due: '2026-11-09', description: null },
      { name: 'Instalment 2', seq: 2, amount: 100, paid: 0, due: '2026-11-07', description: null },
      { name: 'Instalment 3', seq: 3, amount: 100, paid: 0, due: '2026-11-10', description: null },
      { name: 'Instalment 3', seq: 3, amount: 100, paid: 0, due: '2026-11-11', description: null },
      { name: 'Instalment 3', seq: 3, amount: 100, paid: 0, due: '2026-11-25', description: null },
      { name: 'Instalment 5', seq: 5, amount: 100, paid: 40, due: '2027-06-01', description: null },
      { name: 'Instalment 6', seq: 6, amount: 100, paid: 0, due: '2027-06-01', description: null },
    ];
    for (const i of cases) {
      const state = instalmentState(i, today);
      expect(instalmentLabel(i, state, today, en)).toBe(state.label);
    }
  });
});

describe('shared labels in other languages', () => {
  it('ADR 0016: translated by code; an unknown code keeps the API English', () => {
    expect(serviceName('maintenance', 'Maintenance', ar)).toBe('الصيانة');
    expect(serviceName('new-service', 'New Service', ar)).toBe('New Service');
    expect(deskTypeLabel('SPA', zh)).toBe('买卖协议（SPA）');
    expect(visitSlotText({ key: 'morning', hours: '9:00 - 12:00' }, zh)).toBe('上午（9:00 - 12:00）');
  });

  it('ADR 0016: day counts fit every number', () => {
    const late: Instalment = {
      name: 'I2',
      seq: 2,
      amount: 100,
      paid: 0,
      due: '2026-11-07',
      description: null,
    };
    const today = '2026-11-10';
    expect(instalmentLabel(late, instalmentState(late, today), today, ru)).toBe('Просрочено на 3 дн.');
  });
});
