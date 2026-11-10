/**
 * The person's settings as every screen reads them (ADR 0016). Kept apart from PreferencesProvider so the
 * screens the provider shows (the terms screen) can read them without the two files importing each other.
 */
import type { ConsentBody, Preferences, PreferencesBody } from '@jadplus/shared';
import { createContext, use } from 'react';

export interface PreferencesState {
  readonly prefs: Preferences | null;
  /** Saves a change; throws when it cannot be saved (the screen says so). */
  readonly change: (body: PreferencesBody) => Promise<void>;
  readonly consent: (body: ConsentBody) => Promise<void>;
}

export const PreferencesContext = createContext<PreferencesState | null>(null);

export function usePreferences(): PreferencesState {
  const state = use(PreferencesContext);
  if (state === null) throw new Error('usePreferences must be used inside PreferencesProvider');
  return state;
}
