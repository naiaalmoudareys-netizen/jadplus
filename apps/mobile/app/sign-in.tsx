/**
 * Sign-in with a one-time code (C-AUTH-1, C-AUTH-3): email or mobile number, then the 6-digit code.
 * The first answer is the same whether or not the person is registered (no account discovery).
 */
import { Redirect } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { errorText } from '../src/api/client.js';
import { useT } from '../src/i18n/I18nProvider.js';
import { LanguageRow } from '../src/profile/LanguagePicker.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { Hero } from '../src/ui/brand.js';
import { Body, Button, Field, Heading, Notice, Page } from '../src/ui/kit.js';

export default function SignIn(): ReactNode {
  const session = useSession();
  const controller = useSessionController();
  const t = useT();
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
      setError(errorText(err, t));
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
      <Hero eyebrow="JAD Global" title={t('access.welcome')} />
      <Heading>{t('access.signIn')}</Heading>
      {sentMessage === null ? (
        <>
          <Body muted>{t('access.signInHint')}</Body>
          <Field
            label={t('access.identifier')}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            inputMode="email"
            textContentType="username"
          />
          <Button
            title={t('access.sendCode')}
            onPress={() => void ask()}
            busy={busy}
            disabled={identifier.trim() === ''}
          />
        </>
      ) : (
        <>
          <Notice>{sentMessage}</Notice>
          <Field
            label={t('access.code')}
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
            title={t('access.signIn')}
            onPress={() => void verify(code)}
            busy={busy}
            disabled={code.length !== 6}
          />
          <Button
            title={t('access.useDifferent')}
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
      {/* Before signing in the choice is kept on the phone only (ADR 0016). */}
      <LanguageRow />
    </Page>
  );
}
