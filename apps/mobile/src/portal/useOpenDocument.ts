/** Opens one of the owner's documents in the phone's viewer, remembering which one is loading and any error. */
import { useState } from 'react';
import { ApiError } from '../api/client.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { openDocument } from './documents.js';

export interface DocumentOpener {
  readonly opening: string | null;
  readonly error: string | null;
  readonly open: (fileId: string, title: string) => void;
}

export function useOpenDocument(): DocumentOpener {
  const { api } = useSessionController();
  const t = useT();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = (fileId: string, title: string) => {
    setOpening(fileId);
    setError(null);
    openDocument(api, fileId, title)
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError && err.status === 404
            ? t('owner.doc.notAvailable')
            : t('owner.doc.openError'),
        );
      })
      .finally(() => {
        setOpening(null);
      });
  };
  return { opening, error, open };
}
