/**
 * The report on a snagging or valuation job (ADR 0032; O3, S4, L2): the reports on file (each download is
 * audited by the API), when the next report is due, and the upload of the report PDF when the API allows it
 * (after the inspection starts; a valuation also without a visit). For snagging, list the snags first: the
 * report is sent with them and the list is closed after that.
 */
import { reportUploadedResponse, type RequestReport } from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { apiPath } from '../../lib/api';
import { bytesText, dateTime } from '../../lib/format';
import { REPORT_KIND_LABELS, SNAGGING_TYPE_LABELS, reportFileName, reportProblem } from '../../lib/reports';
import { FileButton, useAction } from '../../ui/actions';
import { useConsole } from '../../ui/hooks';
import { Fact, Notice } from '../../ui/parts';

/** The reports on file, with their download buttons; shared with JAD+ Admin's request page. */
export function ReportFiles({
  requestId,
  refText,
  report,
}: {
  requestId: string;
  refText: string;
  report: RequestReport;
}): ReactNode {
  return (
    <>
      {report.snaggingType === null ? null : (
        <Fact label="Snagging">{SNAGGING_TYPE_LABELS[report.snaggingType]}</Fact>
      )}
      {report.reinspectionRequestedAt === null ? null : (
        <Fact label="Free re-inspection asked for">{dateTime(report.reinspectionRequestedAt)}</Fact>
      )}
      {report.reports.length === 0 ? (
        <p className="muted">No report yet.</p>
      ) : (
        <ul className="plain stack">
          {report.reports.map((r) => (
            <li key={r.id}>
              <strong>{REPORT_KIND_LABELS[r.kind]}</strong>{' '}
              <span className="hint">
                {dateTime(r.uploadedAt)} · {bytesText(r.byteSize)}
              </span>{' '}
              <FileButton
                path={apiPath('requests', requestId, 'report', r.id, 'file')}
                label="Download PDF"
                saveAs={reportFileName(refText, r.kind)}
              />
            </li>
          ))}
        </ul>
      )}
      {report.disclaimer === null ? null : <p className="hint">{report.disclaimer}</p>}
    </>
  );
}

export function ReportUpload({
  requestId,
  refText,
  report,
  onUploaded,
}: {
  requestId: string;
  refText: string;
  report: RequestReport;
  onUploaded: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const action = useAction();
  const canUpload = report.actions.includes('upload_report');
  const reinspection = report.reports.length > 0;

  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const p = reportProblem(file);
    setProblem(p);
    if (p !== null || file === null) return;
    action.run(async () => {
      await api.upload(
        apiPath('requests', requestId, 'report'),
        file,
        'application/pdf',
        reportUploadedResponse,
      );
      setFile(null);
      setRound((r) => r + 1);
      onUploaded();
    });
  };

  return (
    <section className="card stack">
      <h2 className="section-title">Report</h2>
      <ReportFiles requestId={requestId} refText={refText} report={report} />
      {report.reportDueAt === null ? null : <Fact label="Report due">{dateTime(report.reportDueAt)}</Fact>}
      {!canUpload ? null : (
        <form className="stack upload" onSubmit={submit}>
          <label className="field">
            <span className="label">
              {reinspection ? 'Re-inspection report' : 'Report'} (PDF, up to 20 MB)
            </span>
            <input
              key={round}
              type="file"
              accept="application/pdf"
              disabled={action.busy}
              onChange={(e) => {
                setProblem(null);
                setFile(e.target.files?.[0] ?? null);
              }}
            />
          </label>
          {report.service === 'snagging' && !reinspection ? (
            <p className="hint">List every snag below before sending: the list closes with the report.</p>
          ) : null}
          {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
          {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
          <div className="row-actions">
            <button type="submit" className="btn" disabled={action.busy || file === null}>
              {action.busy ? 'Sending…' : 'Send the report'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
