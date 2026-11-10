/** Account: switch view (R5, U7), sign out, and sign out on every device (T3 lost phone). */
import { Redirect, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import type { RoleContextView } from '@jadplus/shared';
import { ApiError } from '../src/api/client.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { Body, Button, Heading, Notice, Page } from '../src/ui/kit.js';

const ROLE_NAMES: Readonly<Record<RoleContextView['role'], string>> = {
  owner: 'Owner',
  tenant: 'Tenant',
  partner: 'Technician',
  partner_admin: 'Partner office',
  jad_admin: 'JAD+ Admin',
  jad_viewer: 'JAD+ staff',
};

export default function Settings(): ReactNode {
  const session = useSession();
  const controller = useSessionController();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (session.status !== 'signed_in') return <Redirect href="/" />;
  const { me } = session;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const others = me.contexts.filter((c) => c.role !== me.role || c.partnerId !== me.partnerId);
  return (
    <Page>
      <Heading>Account</Heading>
      <Body muted>Current view: {ROLE_NAMES[me.role]}</Body>
      {others.map((c) => (
        <Button
          key={`${c.role}:${c.partnerId ?? ''}`}
          title={`Switch to ${ROLE_NAMES[c.role]}`}
          kind="secondary"
          busy={busy}
          onPress={() => void run(() => controller.switchTo(c))}
        />
      ))}
      <Button
        title="Sign out"
        kind="secondary"
        busy={busy}
        onPress={() => void run(() => controller.signOut())}
      />
      <Body muted>Lost a phone? This signs you out on every device, including this one.</Body>
      <Button
        title="Sign out everywhere"
        kind="danger"
        busy={busy}
        onPress={() => void run(() => controller.signOut(true))}
      />
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </Page>
  );
}
