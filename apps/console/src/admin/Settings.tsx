/**
 * JAD+ Admin "Settings" (ADR 0025): what the platform runs on, read-only: versions of the terms, make-safe and
 * marketing texts (L1, L2), the make-safe limits owners choose from (E8), the working calendar and holidays,
 * SLA targets (S4), emergency types and the AC emergency season (E14), and the app's languages. Changing any of
 * these is a code change with its own review, never a click here. The one exception is the public holidays
 * (E20, ADR 0028): JAD+ Admin adds and removes days after today in the Holidays section.
 */
import { platformSettingsResponse, type PlatformSettings } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { weekdayName } from '../lib/dates';
import { aed, minutesText } from '../lib/format';
import { monthName } from '../lib/platform';
import { SLA_METRIC_LABELS } from '../lib/labels';
import { canChange } from '../lib/session';
import { useConsole, useLoad } from '../ui/hooks';
import { Fact, Loaded, PageHeader, Section } from '../ui/parts';
import { Holidays } from './settings/Holidays';

const LANGUAGE_NAMES: Readonly<Record<string, string>> = { en: 'English', ar: 'Arabic' };

function SettingsView({ s }: { s: PlatformSettings }): ReactNode {
  return (
    <>
      <Section title="Versions and limits">
        <dl className="facts">
          <Fact label="Terms">{s.versions.terms}</Fact>
          <Fact label="Make-safe consent">{s.versions.makeSafe}</Fact>
          <Fact label="Marketing consent">{s.versions.marketing}</Fact>
          <Fact label="Make-safe limits owners choose from">
            {s.makeSafeCapChoicesAed.map((n) => aed(n)).join(' · ')}
          </Fact>
          <Fact label="App languages">{s.languages.map((l) => LANGUAGE_NAMES[l] ?? l).join(', ')}</Fact>
        </dl>
      </Section>
      <div className="columns">
        <Section title="Working calendar">
          <dl className="facts">
            <Fact label="Working days">{s.calendar.workingDays.map(weekdayName).join(', ')}</Fact>
            <Fact label="Weekend">{s.calendar.weekendDays.map(weekdayName).join(', ')}</Fact>
            <Fact label="Hours (Dubai)">
              {s.calendar.opens} to {s.calendar.closes}
            </Fact>
            <Fact label="Public holidays">Not working days: see Public holidays below.</Fact>
          </dl>
        </Section>
        <Section title="Service-level targets">
          <dl className="facts">
            <Fact label="Emergency acknowledged within">{minutesText(s.sla.emergencyAckMinutes)}</Fact>
            <Fact label="Moved to the backup partner after">{minutesText(s.sla.emergencyBackupMinutes)}</Fact>
          </dl>
          <h3 className="label">Maintenance</h3>
          <ul className="plain">
            {s.sla.maintenance.map((t) => (
              <li key={t.metric}>
                {SLA_METRIC_LABELS[t.metric]}: {minutesText(t.minutes)}
                <span className="hint">{t.clock === '24x7' ? ' (round the clock)' : ' (working hours)'}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <Section title="Emergencies">
        <dl className="facts">
          <Fact label="Types residents can raise">{s.emergencyTypes.map((t) => t.label).join(', ')}</Fact>
          <Fact label="AC failure counts as an emergency in">
            {s.acSeasonMonths.map(monthName).join(', ')}
          </Fact>
        </dl>
      </Section>
    </>
  );
}

export function Settings(): ReactNode {
  const { api, session } = useConsole();
  const { state, reload } = useLoad(
    () => api.get('/api/admin/settings', platformSettingsResponse),
    'settings',
  );
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Settings" />
      <p className="hint page-intro">
        These are fixed rules. To change one, contact IT. The one exception is the public holidays, which JAD+
        Admin keeps up to date below.
      </p>
      <Loaded state={state} reload={reload}>
        {(s) => <SettingsView s={s} />}
      </Loaded>
      <Holidays editable={canChange(session.role)} />
    </>
  );
}
