/**
 * Changes and files on console pages: a change that shows "Saving…" and the API's own message on failure, a
 * button that asks for an inline confirmation before a destructive change, and buttons that open or save a
 * file (a PDF, a CSV) fetched through the API with the session cookie. Files are held in memory as an object
 * URL, released shortly after use; nothing is cached (the API sends `private, no-store`).
 */
import { useState, type ReactNode } from 'react';
import { SignedOutError, errorMessage } from '../lib/api';
import { useConsole } from './hooks';
import { Notice } from './parts';

/** How long an object URL stays alive after a file was opened or saved. */
const RELEASE_AFTER_MS = 60_000;

export interface Action {
  readonly busy: boolean;
  readonly error: string | null;
  /** Runs one change; its failure message is kept in `error` (a signed-out error is left to the app). */
  readonly run: (work: () => Promise<void>) => void;
  readonly clear: () => void;
}

export function useAction(): Action {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    busy,
    error,
    clear: () => {
      setError(null);
    },
    run: (work) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      work().then(
        () => {
          setBusy(false);
        },
        (err: unknown) => {
          setBusy(false);
          if (!(err instanceof SignedOutError)) setError(errorMessage(err));
        },
      );
    },
  };
}

/**
 * A change that is hard to undo: the first click asks "Are you sure?" in place, with what will happen; the
 * second runs it. The API's message shows in place when it fails.
 */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  question: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
}): ReactNode {
  const [asking, setAsking] = useState(false);
  const action = useAction();
  if (!asking) {
    return (
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => {
          setAsking(true);
        }}
      >
        {label}
      </button>
    );
  }
  return (
    <div className="inline-form confirm">
      <p>{question}</p>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-danger"
          disabled={action.busy}
          onClick={() => {
            action.run(async () => {
              await onConfirm();
              setAsking(false);
            });
          }}
        >
          {action.busy ? 'Saving…' : (confirmLabel ?? label)}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={action.busy}
          onClick={() => {
            setAsking(false);
            action.clear();
          }}
        >
          Keep as it is
        </button>
      </div>
    </div>
  );
}

function withObjectUrl(blob: Blob, use: (url: string) => void): void {
  const url = URL.createObjectURL(blob);
  use(url);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, RELEASE_AFTER_MS);
}

/** Saves a file to the computer under `filename`. */
export function saveBlob(blob: Blob, filename: string): void {
  withObjectUrl(blob, (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.click();
  });
}

/** Opens a file (a PDF) in a new tab, from memory. */
export function openBlob(blob: Blob): void {
  withObjectUrl(blob, (url) => {
    window.open(url, '_blank', 'noopener');
  });
}

/** A button that fetches a file from the API, then opens it in a new tab or saves it. */
export function FileButton({
  path,
  label,
  saveAs,
  outline = true,
}: {
  path: string;
  label: string;
  /** Save under this name; without it the file opens in a new tab. */
  saveAs?: string;
  outline?: boolean;
}): ReactNode {
  const { api } = useConsole();
  const action = useAction();
  return (
    <span className="file-button">
      <button
        type="button"
        className={outline ? 'btn btn-outline' : 'btn'}
        disabled={action.busy}
        onClick={() => {
          action.run(async () => {
            const blob = await api.file(path);
            if (saveAs === undefined) openBlob(blob);
            else saveBlob(blob, saveAs);
          });
        }}
      >
        {action.busy ? 'Getting the file…' : label}
      </button>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </span>
  );
}
