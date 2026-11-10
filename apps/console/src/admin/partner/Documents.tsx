/**
 * A partner's uploaded documents, verified by JAD+ Admin before they count (ADR 0025; S7, S10). A pending
 * upload can be opened (the PDF is fetched through the API, which audits the viewing, and shown from memory
 * in a new tab) and accepted or rejected with a reason the partner sees. Accepted copies are what the daily
 * partner check reads.
 */
import {
  adminPartnerDocumentsResponse,
  officeDecisionResponse,
  verifyDocumentBody,
  type PartnerDocumentKind,
} from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { ApiError, apiPath } from '../../lib/api';
import { bytesText, dateTime, dayText } from '../../lib/format';
import { DECISION_LABELS, DOCUMENT_KIND_LABELS } from '../../lib/labels';
import { forPartner } from '../../lib/partner-admin';
import { FileButton, useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Empty, Loaded, Notice, ReasonForm, Section, Tag } from '../../ui/parts';

type Upload = z.infer<typeof adminPartnerDocumentsResponse>['uploads'][number];

const kindLabel = (kind: PartnerDocumentKind): string => DOCUMENT_KIND_LABELS[kind];

function Decide({ upload, onDone }: { upload: Upload; onDone: (message: string) => void }): ReactNode {
  const { api } = useConsole();
  const [rejecting, setRejecting] = useState(false);
  const action = useAction();
  const path = apiPath('admin', 'partner-documents', upload.id, 'verify');
  const accept = (): void => {
    action.run(async () => {
      await api.post(path, { decision: 'accept' }, officeDecisionResponse);
      onDone(`${kindLabel(upload.kind)} accepted. It now counts for the daily check.`);
    });
  };
  const reject = async (reason: string): Promise<void> => {
    const body = verifyDocumentBody.safeParse({ decision: 'reject', reason });
    if (!body.success) throw new ApiError('Say why the document is rejected (at least 3 characters).', 400);
    await api.post(path, body.data, officeDecisionResponse);
    onDone(`${kindLabel(upload.kind)} rejected. The partner sees the reason.`);
  };
  if (rejecting) {
    return (
      <ReasonForm
        label="Why reject it? (the partner sees this)"
        submitLabel="Reject"
        minLength={3}
        onSubmit={reject}
        onCancel={() => {
          setRejecting(false);
        }}
      />
    );
  }
  return (
    <div className="stack">
      <div className="row-actions">
        <button type="button" className="btn btn-small" disabled={action.busy} onClick={accept}>
          {action.busy ? 'Saving…' : 'Accept'}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-small"
          disabled={action.busy}
          onClick={() => {
            setRejecting(true);
          }}
        >
          Reject
        </button>
      </div>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </div>
  );
}

export function PartnerDocuments({
  partnerId,
  editable,
}: {
  partnerId: string;
  editable: boolean;
}): ReactNode {
  const { api } = useConsole();
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(async () => {
    const lists = await Promise.all(
      (['pending', 'accepted', 'rejected'] as const).map((status) =>
        api.get(`/api/admin/partner-documents?status=${status}`, adminPartnerDocumentsResponse),
      ),
    );
    return forPartner(
      lists.flatMap((l) => l.uploads),
      partnerId,
    );
  }, partnerId);
  return (
    <Section title="Uploaded documents">
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      <Loaded state={state} reload={reload}>
        {(uploads) =>
          uploads.length === 0 ? (
            <Empty>This partner has uploaded no documents.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Uploaded</th>
                  <th scope="col">Decision</th>
                  <th scope="col">File</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => {
                  const [text, tone] = DECISION_LABELS[u.status];
                  return (
                    <tr key={u.id}>
                      <td>
                        <strong>{kindLabel(u.kind)}</strong>
                        <span className="block hint">{bytesText(u.byteSize)}</span>
                      </td>
                      <td>{u.expiresOn === null ? '—' : dayText(u.expiresOn)}</td>
                      <td>{dateTime(u.uploadedAt)}</td>
                      <td>
                        {u.status === 'pending' && editable ? (
                          <Decide
                            upload={u}
                            onDone={(message) => {
                              setDone(message);
                              reload();
                            }}
                          />
                        ) : (
                          <>
                            <Tag tone={tone}>{text}</Tag>
                            {u.decidedAt === null ? null : (
                              <span className="block hint">{dateTime(u.decidedAt)}</span>
                            )}
                            {u.reason === null ? null : <span className="block muted">{u.reason}</span>}
                          </>
                        )}
                      </td>
                      <td>
                        <FileButton
                          path={apiPath('admin', 'partner-documents', u.id, 'file')}
                          label="Open PDF"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        }
      </Loaded>
      <p className="hint">Opening a document is recorded in the audit log.</p>
    </Section>
  );
}
