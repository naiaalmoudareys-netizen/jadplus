/** One button's call to the API: busy while it runs, the error in the person's language when it fails. */
import { useCallback, useState } from 'react';
import { errorText } from '../api/client.js';
import { useT } from '../i18n/I18nProvider.js';

export interface Action {
  readonly busy: boolean;
  readonly error: string | null;
  /** Runs `task`; on success calls `after` (e.g. reload the page). */
  readonly run: (task: () => Promise<unknown>, after?: () => void) => Promise<void>;
}

export function useAction(): Action {
  const t = useT();
  const [busy, setBusy] = useState(false);
  // The failure itself is kept (not its words), so the message follows a change of language.
  const [failure, setFailure] = useState<{ readonly err: unknown } | null>(null);
  const run = useCallback(async (task: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setFailure(null);
    try {
      await task();
      after?.();
    } catch (err) {
      setFailure({ err });
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error: failure === null ? null : errorText(failure.err, t), run };
}
