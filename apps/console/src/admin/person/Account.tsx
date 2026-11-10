/**
 * Account changes JAD+ Admin makes for a person (ADR 0025; U9, C-SES-1): sign them out on every device, and
 * freeze or unfreeze the account with a reason (a frozen account cannot sign in or raise requests). Every
 * change is audited; the reason is kept encrypted.
 */
import { adminPersonActionResponse, adminReasonBody } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { ApiError, apiPath } from '../../lib/api';
import { ConfirmButton } from '../../ui/actions';
import { useConsole } from '../../ui/hooks';
import { ReasonForm, Section } from '../../ui/parts';

export function AccountActions({
  id,
  status,
  activeSessions,
  onChanged,
}: {
  id: string;
  status: 'active' | 'frozen' | 'closed';
  activeSessions: number;
  onChanged: (message: string) => void;
}): ReactNode {
  const { api } = useConsole();
  const [freezing, setFreezing] = useState(false);
  const freeze = status === 'active';
  const setFrozen = async (reason: string): Promise<void> => {
    const body = adminReasonBody.safeParse({ reason });
    if (!body.success) throw new ApiError('Give a reason of at least 3 characters.', 400);
    await api.post(
      apiPath('admin', 'people', id, freeze ? 'freeze' : 'unfreeze'),
      body.data,
      adminPersonActionResponse,
    );
    setFreezing(false);
    onChanged(freeze ? 'The account is frozen.' : 'The account is active again.');
  };
  const signOut = async (): Promise<void> => {
    const done = await api.post(
      apiPath('admin', 'people', id, 'sign-out-everywhere'),
      {},
      adminPersonActionResponse,
    );
    onChanged(
      done.sessionsEnded === 1
        ? 'One session was ended.'
        : `${String(done.sessionsEnded)} sessions were ended.`,
    );
  };
  return (
    <Section title="Account">
      <p className="hint">
        {activeSessions === 1 ? 'Signed in on 1 device.' : `Signed in on ${String(activeSessions)} devices.`}
      </p>
      <div className="row-actions">
        <ConfirmButton
          label="Sign out everywhere"
          question="End every session of this person now? They sign in again with a new code."
          onConfirm={signOut}
        />
        {status === 'closed' || freezing ? null : (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setFreezing(true);
            }}
          >
            {freeze ? 'Freeze the account' : 'Unfreeze the account'}
          </button>
        )}
      </div>
      {freezing ? (
        <ReasonForm
          label={freeze ? 'Why freeze?' : 'Why unfreeze?'}
          submitLabel={freeze ? 'Freeze' : 'Unfreeze'}
          minLength={3}
          explain={
            freeze
              ? 'U9: a frozen account cannot sign in or raise requests until JAD+ unfreezes it.'
              : 'The person can sign in and raise requests again.'
          }
          onSubmit={setFrozen}
          onCancel={() => {
            setFreezing(false);
          }}
        />
      ) : null}
    </Section>
  );
}
