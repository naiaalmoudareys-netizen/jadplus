/** Account actions: switch view (R5, U7), sign out, and sign out on every device (T3 lost phone). */
import type { RoleContextView } from '@jadplus/shared';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { errorText } from '../api/client.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSession, useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Notice } from './kit.js';

export interface AccountActions {
  readonly role: RoleContextView['role'] | null;
  /** The other views this person can switch to. */
  readonly others: readonly RoleContextView[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly switchTo: (context: RoleContextView) => void;
  readonly signOut: (everywhere: boolean) => void;
}

/** The actions, for any screen that offers them (Profile, technicians' Account page). */
export function useAccountActions(): AccountActions {
  const session = useSession();
  const controller = useSessionController();
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = session.status === 'signed_in' ? session.me : null;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      // Close every screen of the old view, so nothing keeps loading with the old session.
      if (router.canDismiss()) router.dismissAll();
      router.replace('/');
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  return {
    role: me?.role ?? null,
    others: me === null ? [] : me.contexts.filter((c) => c.role !== me.role || c.partnerId !== me.partnerId),
    busy,
    error,
    switchTo: (c) => void run(() => controller.switchTo(c)),
    signOut: (everywhere) => void run(() => controller.signOut(everywhere)),
  };
}

/** The same actions as plain buttons (technicians' and partner offices' Account page). */
export function AccountSection(): ReactNode {
  const t = useT();
  const a = useAccountActions();
  if (a.role === null) return null;
  return (
    <>
      <Body muted>{`${t('profile.currentView')}: ${t(`role.${a.role}`)}`}</Body>
      {a.others.map((c) => (
        <Button
          key={`${c.role}:${c.partnerId ?? ''}`}
          title={t('profile.switchTo', { role: t(`role.${c.role}`) })}
          kind="secondary"
          busy={a.busy}
          onPress={() => {
            a.switchTo(c);
          }}
        />
      ))}
      <Button
        title={t('profile.signOut')}
        kind="secondary"
        busy={a.busy}
        onPress={() => {
          a.signOut(false);
        }}
      />
      <Body muted>{t('profile.signOutEverywhereNote')}</Body>
      <Button
        title={t('profile.signOutEverywhere')}
        kind="danger"
        busy={a.busy}
        onPress={() => {
          a.signOut(true);
        }}
      />
      {a.error === null ? null : <Notice tone="error">{a.error}</Notice>}
    </>
  );
}
