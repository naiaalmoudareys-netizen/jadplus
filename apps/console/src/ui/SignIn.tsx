/**
 * Sign in to the console with a one-time email code (C-AUTH-1, ADR 0022): email, then the 6-digit code. The
 * session comes back as an HttpOnly cookie; the page keeps only the anti-forgery token.
 */
import { codeSentResponse, consoleSessionResponse, type ConsoleSessionResponse } from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { errorMessage, type Api } from '../lib/api';
import { Notice } from './parts';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_SHAPE = /^\d{6}$/;

export function SignIn({
  api,
  notice,
  onSignedIn,
}: {
  api: Api;
  notice: string | null;
  onSignedIn: (s: ConsoleSessionResponse) => void;
}): ReactNode {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (work: () => Promise<void>): void => {
    setBusy(true);
    setError(null);
    work().then(
      () => {
        setBusy(false);
      },
      (err: unknown) => {
        setBusy(false);
        setError(errorMessage(err));
      },
    );
  };

  const askCode = (e: SyntheticEvent): void => {
    e.preventDefault();
    if (!EMAIL_SHAPE.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    run(async () => {
      const answer = await api.post('/api/auth/code', { email: email.trim() }, codeSentResponse, {
        signedIn: false,
      });
      setSent(answer.message);
      setCode('');
      setStep('code');
    });
  };

  const verify = (e: SyntheticEvent): void => {
    e.preventDefault();
    if (!CODE_SHAPE.test(code)) {
      setError('The code is 6 digits.');
      return;
    }
    run(async () => {
      const session = await api.post(
        '/api/auth/verify',
        { email: email.trim(), code, client: 'console' },
        consoleSessionResponse,
        { signedIn: false },
      );
      onSignedIn(session);
    });
  };

  return (
    <main className="signin">
      <div className="signin-card card">
        <p className="eyebrow">JAD+ Console</p>
        <h1 className="title">Sign in</h1>
        <p className="muted">For JAD+ Admin and partner offices. We send a one-time code to your email.</p>
        {notice === null ? null : <Notice tone="warn">{notice}</Notice>}
        {step === 'email' ? (
          <form onSubmit={askCode} className="stack">
            <label className="field">
              <span className="label">Work email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                required
                maxLength={254}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />
            </label>
            {error === null ? null : <Notice tone="bad">{error}</Notice>}
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            {sent === null ? null : <p className="muted">{sent}</p>}
            <label className="field">
              <span className="label">6-digit code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                required
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ''));
                }}
              />
            </label>
            {error === null ? null : <Notice tone="bad">{error}</Notice>}
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={busy}
              onClick={() => {
                setStep('email');
                setError(null);
              }}
            >
              Use another email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
