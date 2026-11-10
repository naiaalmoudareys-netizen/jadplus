/**
 * Sign-in with a one-time code (C-AUTH-1, C-AUTH-3): email or mobile number, then the 6-digit code.
 * The first answer is the same whether or not the person is registered (no account discovery).
 */
import { Redirect } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../src/api/client.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { Hero } from '../src/ui/brand.js';
import { Body, Button, Field, Heading, Notice, Page } from '../src/ui/kit.js';

function message(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

export default function SignIn(): ReactNode {
  const session = useSession();
  const controller = useSessionController();
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.status === 'signed_in') return <Redirect href="/" />;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const ask = () =>
    run(async () => {
      setSentMessage((await controller.requestCode(identifier)).message);
    });
  const verify = (entered: string) => run(() => controller.verify(identifier, entered));

  return (
    <Page>
      <Hero eyebrow="JAD Global" title="Welcome to JAD+" />
      <Heading>Sign in</Heading>
      {sentMessage === null ? (
        <>
          <Body muted>Use the email or mobile number registered with JAD Global.</Body>
          <Field
            label="Email or mobile number"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            inputMode="email"
            textContentType="username"
          />
          <Button
            title="Send me a code"
            onPress={() => void ask()}
            busy={busy}
            disabled={identifier.trim() === ''}
          />
        </>
      ) : (
        <>
          <Notice>{sentMessage}</Notice>
          <Field
            label="6-digit code"
            value={code}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              // Sign in as soon as all 6 digits are there (typed, pasted or filled from the message).
              if (digits.length === 6 && !busy) void verify(digits);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <Button
            title="Sign in"
            onPress={() => void verify(code)}
            busy={busy}
            disabled={code.length !== 6}
          />
          <Button
            title="Use a different email or number"
            kind="secondary"
            onPress={() => {
              setSentMessage(null);
              setCode('');
              setError(null);
            }}
          />
        </>
      )}
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </Page>
  );
}
