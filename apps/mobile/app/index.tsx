/** Start: send the person to sign-in, or to the home of the view they are signed in to. */
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { Button, Loading, Notice, Page } from '../src/ui/kit.js';

export default function Start(): ReactNode {
  const session = useSession();
  const controller = useSessionController();
  switch (session.status) {
    case 'loading':
      return <Loading />;
    case 'signed_out':
      return <Redirect href="/sign-in" />;
    case 'offline':
      return (
        <Page>
          <Notice tone="error">Cannot reach JAD+. Check your connection.</Notice>
          <Button title="Try again" onPress={() => void controller.restore()} />
        </Page>
      );
    case 'signed_in':
      return (
        <Redirect
          href={session.me.role === 'partner' || session.me.role === 'partner_admin' ? '/partner' : '/home'}
        />
      );
  }
}
