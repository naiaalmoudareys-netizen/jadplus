/** Start: send the person to sign-in, or to the home of the view they are signed in to. */
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { useT } from '../src/i18n/I18nProvider.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { Button, Loading, Notice, Page } from '../src/ui/kit.js';

export default function Start(): ReactNode {
  const session = useSession();
  const controller = useSessionController();
  const t = useT();
  switch (session.status) {
    case 'loading':
      return <Loading />;
    case 'signed_out':
      return <Redirect href="/sign-in" />;
    case 'offline':
      return (
        <Page>
          <Notice tone="error">{t('access.startOffline')}</Notice>
          <Button title={t('common.retry')} onPress={() => void controller.restore()} />
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
