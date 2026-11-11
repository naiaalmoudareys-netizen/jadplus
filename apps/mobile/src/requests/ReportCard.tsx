/**
 * The report on the owner's snagging or valuation request (ADR 0032; O3, L2): "Open report" for each report on
 * file (opened in the phone's viewer like the owner's documents), the valuation line "Indicative valuation, not
 * a formal appraisal", the snag list, and "Ask for the free re-inspection" once every snag is fixed. Nothing is
 * shown for other services, and only owners see it (tenants never see reports, R2).
 */
import { dubaiDate } from '@jadplus/shared';
import { useCallback, useState, type ReactNode } from 'react';
import { askReinspection, requestReport } from '../api/reports.js';
import { useLang } from '../i18n/I18nProvider.js';
import { longDate } from '../portal/format.js';
import { LineItem } from '../portal/ui.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad } from '../ui/hooks.js';
import { Body, Button, Card, Eyebrow, Notice } from '../ui/kit.js';
import { REPORT_TITLE } from './reportLogic.js';
import { SnagList } from './SnagList.js';
import { useOpenReport } from './useOpenReport.js';

export function ReportCard({
  requestId,
  onChanged,
}: {
  requestId: string;
  onChanged: () => void;
}): ReactNode {
  const { api } = useSessionController();
  const { t, locale } = useLang();
  const load = useCallback(() => requestReport(api, requestId), [api, requestId]);
  const report = useLoad(load, 30_000);
  const opener = useOpenReport();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = report.data;
  const service = r?.service ?? null;
  if (r === null || service === null) return null;
  const changed = () => {
    void report.reload();
    onChanged();
  };
  const ask = () => {
    setAsking(true);
    setError(null);
    askReinspection(api, requestId)
      .then(changed)
      .catch(() => {
        setError(t('report.error'));
      })
      .finally(() => {
        setAsking(false);
      });
  };
  return (
    <>
      <Card>
        <Eyebrow>{t('report.title')}</Eyebrow>
        {r.reports.length === 0 ? <Body muted>{t('report.waiting')}</Body> : null}
        {r.reports.map((f) => (
          <LineItem
            key={f.id}
            title={t(REPORT_TITLE[f.kind])}
            detail={longDate(dubaiDate(f.uploadedAt), locale)}
            amount=""
            note={opener.opening === f.id ? t('owner.opening') : null}
            action={t('report.open')}
            onPress={() => {
              opener.open(requestId, f.id, t(REPORT_TITLE[f.kind]));
            }}
          />
        ))}
        {r.disclaimer === null ? null : <Body muted>{t('report.disclaimer')}</Body>}
        {r.reinspectionRequestedAt === null ? null : (
          <Body muted>
            {t('report.reinspection.asked', { date: longDate(dubaiDate(r.reinspectionRequestedAt), locale) })}
          </Body>
        )}
        {r.actions.includes('request_reinspection') ? (
          <>
            <Body>{t('report.reinspection.note')}</Body>
            <Button title={t('report.reinspection.ask')} busy={asking} onPress={ask} />
          </>
        ) : null}
        {opener.error === null ? null : <Notice tone="error">{opener.error}</Notice>}
        {error === null ? null : <Notice tone="error">{error}</Notice>}
      </Card>
      {service === 'snagging' ? (
        <SnagList key={String(r.reports.length)} requestId={requestId} onChanged={changed} />
      ) : null}
    </>
  );
}
