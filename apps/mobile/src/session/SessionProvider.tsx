/** Makes the session (and the API client tied to it) available to every screen. */
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { createApiClient } from '../api/client.js';
import { apiBaseUrl } from '../config.js';
import { clearDocuments } from '../portal/documents.js';
import { secureTokenStore } from './secure-token-store.js';
import { SessionController, type SessionState } from './session.js';

const SessionContext = createContext<SessionController | null>(null);

function createController(): SessionController {
  const baseUrl = apiBaseUrl(process.env.EXPO_PUBLIC_API_URL, __DEV__);
  return new SessionController(secureTokenStore, (token, onUnauthorized) =>
    createApiClient({ baseUrl, fetch: (input, init) => fetch(input, init), token, onUnauthorized }),
  );
}

export function SessionProvider({ children }: { children: ReactNode }): ReactNode {
  const [controller] = useState(createController);
  useEffect(() => {
    void controller.restore();
  }, [controller]);
  // Documents opened in the viewer (e.g. a passport copy) are removed from the phone on sign-out.
  useEffect(
    () =>
      controller.subscribe((state) => {
        if (state.status === 'signed_out') clearDocuments();
      }),
    [controller],
  );
  return <SessionContext value={controller}>{children}</SessionContext>;
}

export function useSessionController(): SessionController {
  const controller = use(SessionContext);
  if (controller === null) throw new Error('useSessionController must be used inside SessionProvider');
  return controller;
}

/** The current session state; screens re-render when it changes. */
export function useSession(): SessionState {
  const controller = useSessionController();
  const [state, setState] = useState(controller.state);
  useEffect(() => controller.subscribe(setState), [controller]);
  return state;
}
