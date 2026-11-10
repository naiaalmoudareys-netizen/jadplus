/**
 * Steps at the door: "no access" (A7: a photo taken at the closed door first, then the job stays with the
 * partner, to be rebooked within 24 hours) and make-safe work on an emergency (E8: within the owner's
 * pre-agreed limit, no quote needed; above it the API says so and a quote is sent instead).
 */
import { MAX_REQUEST_PHOTOS, PHOTO_MAX_BYTES, makeSafeBody, noAccessBody } from '@jadplus/shared';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { apiPath } from '../../lib/api';
import { jobStepResponse, makeSafeRecordedResponse, photoAddedResponse } from '../../lib/office-schemas';
import { useAction } from '../../ui/actions';
import { useConsole } from '../../ui/hooks';
import { StepShell, type StepProps } from './shared';

const PHOTO_TYPES = ['image/jpeg', 'image/png'];

export function NoAccess({ jobId, onDone, onCancel }: StepProps): ReactNode {
  const { api } = useConsole();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    if (file === null) return;
    if (!PHOTO_TYPES.includes(file.type) || file.size > PHOTO_MAX_BYTES) {
      setProblem('Choose a JPEG or PNG photo of up to 10 MB.');
      return;
    }
    setProblem(null);
    action.run(async () => {
      const photo = await api.upload(
        apiPath('requests', jobId, 'photos'),
        file,
        file.type,
        photoAddedResponse,
      );
      const body = noAccessBody.parse({ photoId: photo.id });
      await api.post(apiPath('partner', 'jobs', jobId, 'no-access'), body, jobStepResponse);
      onDone('No access recorded. Book a new visit within 24 hours.');
    });
  };
  return (
    <StepShell
      title="No access at the door"
      action={action}
      problem={problem}
      submitLabel="Record no access"
      ready={file !== null}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <label className="field wide">
        <span className="label">Photo taken at the door (JPEG or PNG)</span>
        <input
          type="file"
          accept={PHOTO_TYPES.join(',')}
          required
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
          }}
        />
      </label>
      <p className="hint wide">
        A request keeps up to {MAX_REQUEST_PHOTOS} photos of each kind. This is not held against the
        technician.
      </p>
    </StepShell>
  );
}

export function MakeSafe({ jobId, onDone, onCancel }: StepProps): ReactNode {
  const { api } = useConsole();
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAction();
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = makeSafeBody.safeParse({ amountAed: Number(amount), scope });
    if (!body.success) {
      setProblem('Give the amount in AED (up to 2 decimals) and what was done.');
      return;
    }
    setProblem(null);
    action.run(async () => {
      await api.post(apiPath('partner', 'jobs', jobId, 'make-safe'), body.data, makeSafeRecordedResponse);
      onDone('Make-safe work recorded; the owner is told.');
    });
  };
  return (
    <StepShell
      title="Record make-safe work"
      action={action}
      problem={problem}
      submitLabel="Record"
      ready={amount !== '' && scope.trim() !== ''}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <label className="field">
        <span className="label">Amount (AED)</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          required
          onChange={(e) => {
            setAmount(e.target.value);
          }}
        />
      </label>
      <label className="field wide">
        <span className="label">What was done to make it safe</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={scope}
          required
          onChange={(e) => {
            setScope(e.target.value);
          }}
        />
      </label>
      <p className="hint wide">Only within the owner&apos;s agreed limit. Above it, send a quote instead.</p>
    </StepShell>
  );
}
