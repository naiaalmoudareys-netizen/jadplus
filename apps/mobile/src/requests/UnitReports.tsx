/**
 * Reports filed for this unit, under My unit → Documents (ADR 0032; O3): each snagging, re-inspection or
 * valuation report on the owner's requests, opened in the phone's viewer. Nothing shows when there is none.
 */
import { dubaiDate } from '@jadplus/shared';
import { useCallback, type ReactNode } from 'react';
import { ownerReports } from '../api/reports.js';
import { useLang } from '../i18n/I18nProvider.js';
import { longDate } from '../portal/format.js';
import { LineItem } from '../portal/ui.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad } from '../ui/hooks.js';
import { Notice } from '../ui/kit.js';
import { REPORT_TITLE, reportsForUnit } from './reportLogic.js';
import { useOpenReport } from './useOpenReport.js';

export function UnitReports({ unitName }: { unitName: string | null }): ReactNode {
  const { api } = useSessionController();
  const { t, locale } = useLang();
  const load = useCallback(() => ownerReports(api), [api]);
  const all = useLoad(load);
  const opener = useOpenReport();
  const reports = reportsForUnit(all.data ?? [], unitName);
  if (reports.length === 0) return null;
  return (
    <>
      {reports.map((r) => (
        <LineItem
          key={r.id}
          title={t(REPORT_TITLE[r.kind])}
          detail={`${r.ref} · ${longDate(dubaiDate(r.uploadedAt), locale)}`}
          amount=""
          note={opener.opening === r.id ? t('owner.opening') : null}
          onPress={() => {
            opener.open(r.requestId, r.id, t(REPORT_TITLE[r.kind]));
          }}
        />
      ))}
      {opener.error === null ? null : <Notice tone="error">{opener.error}</Notice>}
    </>
  );
}
