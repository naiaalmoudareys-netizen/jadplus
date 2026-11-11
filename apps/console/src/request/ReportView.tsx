/**
 * JAD+ Admin's view of a request's report side (ADR 0032; O3, L2): the reports on file (every download is
 * audited by the API) and, for snagging, the snag list, read-only. Nothing is shown for other services.
 */
import { requestReportResponse } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { apiPath } from '../lib/api';
import { ReportFiles } from '../partner/job/ReportUpload';
import { Snags } from '../partner/job/Snags';
import { useConsole, useLoad } from '../ui/hooks';
import { Loaded } from '../ui/parts';

export function ReportView({ requestId, refText }: { requestId: string; refText: string }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(apiPath('requests', requestId, 'report'), requestReportResponse),
    `report-${requestId}`,
  );
  return (
    <Loaded state={state} reload={reload}>
      {(report) =>
        report.service === null ? null : (
          <>
            <section className="card stack">
              <h2 className="section-title">Report</h2>
              <ReportFiles requestId={requestId} refText={refText} report={report} />
            </section>
            {report.service === 'snagging' ? <Snags requestId={requestId} /> : null}
          </>
        )
      }
    </Loaded>
  );
}
