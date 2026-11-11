/**
 * The report side of a job on the partner office's job page (ADR 0032; O3): shown only for snagging and
 * valuation jobs. The report (with its upload) and, for snagging, the snag list.
 */
import { requestReportResponse } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { apiPath } from '../../lib/api';
import { useConsole, useLoad } from '../../ui/hooks';
import { Loaded } from '../../ui/parts';
import { ReportUpload } from './ReportUpload';
import { Snags } from './Snags';

export function ReportSection({
  requestId,
  refText,
  onChanged,
}: {
  requestId: string;
  refText: string;
  /** The job page reloads too: the report moves the job on. */
  onChanged: () => void;
}): ReactNode {
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
            <ReportUpload
              requestId={requestId}
              refText={refText}
              report={report}
              onUploaded={() => {
                reload();
                onChanged();
              }}
            />
            {report.service === 'snagging' ? (
              <Snags
                key={`${String(report.reports.length)}-${report.actions.join()}`}
                requestId={requestId}
              />
            ) : null}
          </>
        )
      }
    </Loaded>
  );
}
