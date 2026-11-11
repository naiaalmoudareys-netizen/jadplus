/** Opens a request's report PDF in the phone's viewer, like the owner's documents (ADR 0010, 0032). */
import { useState } from 'react';
import { useT } from '../i18n/I18nProvider.js';
import { reportFilePath } from '../api/reports.js';
import { openFile } from '../portal/documents.js';
import { useSessionController } from '../session/SessionProvider.js';

export interface ReportOpener {
  readonly opening: string | null;
  readonly error: string | null;
  readonly open: (requestId: string, reportId: string, title: string) => void;
}

export function useOpenReport(): ReportOpener {
  const { api } = useSessionController();
  const t = useT();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = (requestId: string, reportId: string, title: string) => {
    setOpening(reportId);
    setError(null);
    openFile(api, reportFilePath(requestId, reportId), title)
      .catch(() => {
        setError(t('owner.doc.openError'));
      })
      .finally(() => {
        setOpening(null);
      });
  };
  return { opening, error, open };
}
