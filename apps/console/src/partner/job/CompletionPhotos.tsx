/**
 * The office adds photos of the finished work (E10, ADR 0018, 0025) while the job is in progress or waiting
 * for the resident to confirm: JPEG or PNG, up to 10 MB each, up to 3 per request. Photos are sent one at a
 * time through POST /api/requests/:id/photos, which checks the type from the bytes, removes location and camera
 * data, and files them as finished-work photos because of the job's status.
 */
import { MAX_REQUEST_PHOTOS } from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { apiPath } from '../../lib/api';
import { photoAddedResponse } from '../../lib/office-schemas';
import { PHOTO_TYPES, photoProblem } from '../../lib/photos';
import { useAction } from '../../ui/actions';
import { useConsole } from '../../ui/hooks';
import { Notice } from '../../ui/parts';

export function CompletionPhotos({
  jobId,
  slots,
  onAdded,
}: {
  jobId: string;
  /** How many more photos may be added (completionPhotoSlots). */
  slots: number;
  onAdded: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [files, setFiles] = useState<readonly File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  // Remounts the file input after a send, so the same file can be chosen again.
  const [round, setRound] = useState(0);
  const action = useAction();

  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const p = photoProblem(files, slots);
    setProblem(p);
    setAdded(null);
    if (p !== null) return;
    const chosen = [...files];
    action.run(async () => {
      let sent = 0;
      setProgress({ sent, total: chosen.length });
      try {
        for (const file of chosen) {
          await api.upload(apiPath('requests', jobId, 'photos'), file, file.type, photoAddedResponse);
          sent += 1;
          setProgress({ sent, total: chosen.length });
        }
      } finally {
        setProgress(null);
        setFiles([]);
        setRound((r) => r + 1);
        if (sent > 0) {
          setAdded(sent);
          onAdded();
        }
      }
    });
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="section-title">Add photos of the finished work</h2>
      <label className="field">
        <span className="label">
          JPEG or PNG, up to 10 MB each ({slots} of {MAX_REQUEST_PHOTOS} left)
        </span>
        <input
          key={round}
          type="file"
          accept={PHOTO_TYPES.join(',')}
          multiple={slots > 1}
          disabled={action.busy}
          onChange={(e) => {
            setProblem(null);
            setAdded(null);
            setFiles(Array.from(e.target.files ?? []));
          }}
        />
      </label>
      <p className="hint">Location and camera details are removed from each photo before it is kept.</p>
      {progress === null ? null : (
        <p className="hint" role="status">
          Sending photo {Math.min(progress.sent + 1, progress.total)} of {progress.total}…
        </p>
      )}
      {added === null ? null : (
        <Notice tone="good">{added === 1 ? '1 photo added.' : `${String(added)} photos added.`}</Notice>
      )}
      {problem === null ? null : <Notice tone="bad">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={action.busy || files.length === 0}>
          {action.busy ? 'Sending…' : 'Add photos'}
        </button>
      </div>
    </form>
  );
}
