/**
 * The signed-in person's settings and consents (ADR 0016), loaded once per session for every screen.
 *
 * - Language: the phone's choice wins (it is what the person sees); it is copied to their account. A phone
 *   with no choice yet takes the account's language.
 * - Terms (L1): until the current terms are accepted, the terms screen covers the app. If the
 *   settings cannot be loaded (no connection) the app opens anyway, so nobody is locked out of reporting an
 *   emergency; the terms are asked again next time.
 */
import type { ConsentBody, Preferences, PreferencesBody } from '@jadplus/shared';
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { changePreferences, giveConsent, preferences } from '../api/endpoints.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { useSession, useSessionController } from '../session/SessionProvider.js';
import { TermsGate } from './TermsGate.js';

export interface PreferencesState {
  readonly prefs: Preferences | null;
  /** Saves a change; throws when it cannot be saved (the screen says so). */
  readonly change: (body: PreferencesBody) => Promise<void>;
  readonly consent: (body: ConsentBody) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesState | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const i18n = useI18n();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const signedIn = session.status === 'signed_in' ? `${session.me.userId}:${session.me.role}` : null;
  const { setLanguage } = i18n;
  // Read when the settings arrive, without reloading them each time the language changes.
  const phone = useRef({ chosen: i18n.chosen, language: i18n.language });
  useEffect(() => {
    phone.current = { chosen: i18n.chosen, language: i18n.language };
  }, [i18n.chosen, i18n.language]);

  useEffect(() => {
    setPrefs(null);
    if (signedIn === null) return;
    let live = true;
    preferences(api)
      .then(async (loaded) => {
        let current = loaded;
        const { chosen, language } = phone.current;
        if (chosen && loaded.language !== language) {
          current = await changePreferences(api, { language });
        } else if (!chosen) {
          setLanguage(loaded.language);
        }
        if (live) setPrefs(current);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, signedIn, setLanguage]);

  const change = useCallback(
    async (body: PreferencesBody) => {
      if (body.language !== undefined) setLanguage(body.language);
      setPrefs(await changePreferences(api, body));
    },
    [api, setLanguage],
  );
  const consent = useCallback(
    async (body: ConsentBody) => {
      setPrefs(await giveConsent(api, body));
    },
    [api],
  );

  const value: PreferencesState = { prefs, change, consent };
  return (
    <PreferencesContext value={value}>
      {children}
      {signedIn !== null && prefs !== null && !prefs.termsCurrent ? <TermsGate /> : null}
    </PreferencesContext>
  );
}

export function usePreferences(): PreferencesState {
  const state = use(PreferencesContext);
  if (state === null) throw new Error('usePreferences must be used inside PreferencesProvider');
  return state;
}
