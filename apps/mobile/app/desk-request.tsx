/**
 * A request to the JAD+ desk that needs words (ADR 0011): update contact details, close the JAD+ account, or
 * anything else. Contact details are never changed in the app itself: the desk checks the owner's identity and
 * updates Salesforce (U2).
 */
import {
  DESK_REQUEST_HINTS,
  DESK_REQUEST_TYPES,
  DETAILS_REQUIRED,
  type DeskRequestType,
} from '@jadplus/shared';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../src/api/client.js';
import { deskRequest } from '../src/api/endpoints.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { Body, Button, Eyebrow, Field, Heading, Notice, Page } from '../src/ui/kit.js';

function asType(value: string | undefined): DeskRequestType | null {
  return DESK_REQUEST_TYPES.find((t) => t === value) ?? null;
}

export default function DeskRequest(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const router = useRouter();
  // `details` may come filled in from Profile ("Request a copy of my data"); the owner can still change it.
  const { type: raw, details: prefill } = useLocalSearchParams<{ type: string; details?: string }>();
  const [details, setDetails] = useState(typeof prefill === 'string' ? prefill.slice(0, 1000) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = asType(raw);
  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if (type === null) return <Redirect href="/profile" />;
  const required = DETAILS_REQUIRED.includes(type);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await deskRequest(api, { type, dealId: null, details: details.trim() });
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The request could not be sent. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Eyebrow>JAD+ desk</Eyebrow>
      <Heading>{type}</Heading>
      <Body muted>{DESK_REQUEST_HINTS[type]}</Body>
      <Field
        label={required ? 'What do you need?' : 'Anything to add? (optional)'}
        value={details}
        onChangeText={setDetails}
        multiline
        maxLength={1000}
      />
      <Button
        title="Send to the JAD+ desk"
        busy={busy}
        disabled={required && details.trim() === ''}
        onPress={() => void send()}
      />
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </Page>
  );
}
