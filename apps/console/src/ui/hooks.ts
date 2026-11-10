/** Small React hooks shared by the console pages: the current route, a ticking clock, and loading data. */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SignedOutError, errorMessage, type Api } from '../lib/api';
import { formatRoute, parseHash, type Route } from '../lib/router';
import type { Session } from '../lib/session';

/** The route in the address hash, updated when it changes (links, back button). */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => {
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);
  return route;
}

export function navigate(route: Route): void {
  window.location.hash = formatRoute(route);
}

/** The time now, refreshed every 30 seconds so clocks and ages stay current. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return now;
}

export type Load<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: T };

/**
 * Loads data when `key` changes, and again on reload(). A late answer for an older key is dropped. A
 * signed-out error is left to the app (it shows sign-in), so it is not shown here.
 */
export function useLoad<T>(load: () => Promise<T>, key: string): { state: Load<T>; reload: () => void } {
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const [round, setRound] = useState(0);
  const lastKey = useRef(key);
  useEffect(() => {
    let current = true;
    // A reload keeps what is on screen until the new answer comes; another key starts afresh.
    const sameKey = lastKey.current === key;
    lastKey.current = key;
    setState((s) => (sameKey && s.status === 'ready' ? s : { status: 'loading' }));
    load().then(
      (data) => {
        if (current) setState({ status: 'ready', data });
      },
      (err: unknown) => {
        if (current && !(err instanceof SignedOutError))
          setState({ status: 'error', message: errorMessage(err) });
      },
    );
    return () => {
      current = false;
    };
    // `load` is a new function on every render on purpose: `key` names what it loads.
  }, [key, round]);
  const reload = useCallback(() => {
    setRound((r) => r + 1);
  }, []);
  return { state, reload };
}

export interface ConsoleContext {
  readonly api: Api;
  readonly session: Session;
}

export const Console = createContext<ConsoleContext | null>(null);

/** The API and the session, for pages inside the signed-in console. */
export function useConsole(): ConsoleContext {
  const value = useContext(Console);
  if (value === null) throw new Error('useConsole is used outside the signed-in console.');
  return value;
}
