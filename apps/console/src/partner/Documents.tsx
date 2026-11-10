/**
 * The partner office's contract documents (ADR 0025; S7, S10): where each stands (valid, expiring within 30
 * days, expired, missing), an upload waiting for JAD+ to verify, and why the last one was rejected. A new PDF
 * (with the expiry date printed on it; required for the trade licence and insurance) counts only once JAD+
 * Admin accepts it. The API checks the file itself again (first bytes "%PDF-", 15 MB at most).
 */
import {
  PARTNER_DOCUMENT_KINDS,
  PARTNER_DOCUMENT_MAX_BYTES,
  documentUploadedResponse,
  expiryRequired,
  partnerDocumentsResponse,
  type PartnerDocumentKind,
} from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import type { z } from 'zod';
import { apiPath, withQuery } from '../lib/api';
import { shiftDay, today } from '../lib/dates';
import { bytesText, dateTime, dayText } from '../lib/format';
import { DOCUMENT_KIND_LABELS, STANDING_LABELS } from '../lib/labels';
import { useAction } from '../ui/actions';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';

type Doc = z.infer<typeof partnerDocumentsResponse>['documents'][number];

function Upload({
  kind,
  now,
  onUploaded,
}: {
  kind: PartnerDocumentKind;
  now: number;
  onUploaded: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [file, setFile] = useState<File | null>(null);
  const [expiresOn, setExpiresOn] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const needsDate = expiryRequired(kind);
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    if (file === null) return;
    if (file.type !== 'application/pdf') {
      setProblem('Choose a PDF file.');
      return;
    }
    if (file.size > PARTNER_DOCUMENT_MAX_BYTES) {
      setProblem(`This file is ${bytesText(file.size)}. Documents can be up to 15 MB.`);
      return;
    }
    if (needsDate && expiresOn === '') {
      setProblem('Give the expiry date printed on the document.');
      return;
    }
    setProblem(null);
    action.run(async () => {
      await api.upload(
        withQuery(apiPath('partner', 'documents', kind), { expiresOn }),
        file,
        'application/pdf',
        documentUploadedResponse,
      );
      setFile(null);
      setExpiresOn('');
      onUploaded();
    });
  };
  return (
    <form className="stack upload" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span className="label">PDF file</span>
          <input
            type="file"
            accept="application/pdf"
            required
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </label>
        <label className="field">
          <span className="label">Expires on{needsDate ? '' : ' (if printed)'}</span>
          <input
            type="date"
            value={expiresOn}
            min={shiftDay(today(now), 1)}
            required={needsDate}
            onChange={(e) => {
              setExpiresOn(e.target.value);
            }}
          />
        </label>
        <button type="submit" className="btn" disabled={action.busy || file === null}>
          {action.busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </form>
  );
}

function DocumentCard({
  doc,
  now,
  onUploaded,
}: {
  doc: Doc;
  now: number;
  onUploaded: () => void;
}): ReactNode {
  const [text, tone] = STANDING_LABELS[doc.standing];
  return (
    <Section title={DOCUMENT_KIND_LABELS[doc.kind]}>
      <p>
        <Tag tone={tone}>{text}</Tag>
        {doc.expiresOn === null ? null : <span className="muted">Expires {dayText(doc.expiresOn)}</span>}
      </p>
      {doc.pending === null ? null : (
        <Notice tone="calm">
          Uploaded {dateTime(doc.pending.uploadedAt)}
          {doc.pending.expiresOn === null ? '' : ` (expires ${dayText(doc.pending.expiresOn)})`}: waiting for
          JAD+ to check it.
        </Notice>
      )}
      {doc.lastRejected === null ? null : (
        <Notice tone="warn">
          Rejected {dateTime(doc.lastRejected.at)}: {doc.lastRejected.reason}
        </Notice>
      )}
      {doc.pending === null ? (
        <Upload kind={doc.kind} now={now} onUploaded={onUploaded} />
      ) : (
        <p className="hint">You can upload a new copy once JAD+ has decided on this one.</p>
      )}
    </Section>
  );
}

export function Documents(): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const { state, reload } = useLoad(
    () => api.get('/api/partner/documents', partnerDocumentsResponse),
    'docs',
  );
  return (
    <>
      <PageHeader eyebrow="Partner office" title="Documents" />
      <p className="hint page-intro">
        JAD+ checks each upload before it counts. A lapsed licence or insurance stops new jobs (S7).
      </p>
      <Loaded state={state} reload={reload}>
        {({ documents }) => (
          <div className="columns">
            {PARTNER_DOCUMENT_KINDS.map((kind) => {
              const doc = documents.find((d) => d.kind === kind);
              return doc === undefined ? null : (
                <DocumentCard key={kind} doc={doc} now={now} onUploaded={reload} />
              );
            })}
          </div>
        )}
      </Loaded>
    </>
  );
}
