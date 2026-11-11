/**
 * The console app (ADR 0022, 0023): restores the session on load (GET /api/auth/me), shows sign-in when there
 * is none, and otherwise the pages of the signed-in role. Pages a role may not open send it to its home page.
 */
import {
  consoleSessionResponse,
  meResponse,
  type ConsoleSessionResponse,
  type RoleContextView,
} from '@jadplus/shared';
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Api, SignedOutError, errorMessage } from './lib/api';
import { homeRoute, routeAllowed } from './lib/router';
import { sessionFromMe, sessionFromSignIn, type Session } from './lib/session';
import { Console, navigate, useRoute } from './ui/hooks';
import { Layout } from './ui/Layout';
import { Notice } from './ui/parts';
import { SignIn } from './ui/SignIn';

type Phase =
  | { readonly kind: 'starting' }
  | { readonly kind: 'signed_out'; readonly notice: string | null }
  | { readonly kind: 'signed_in'; readonly session: Session };

// Each console loads its own pages only after sign-in, so the first download stays small and a partner office
// never receives the JAD+ Admin screens (or the other way round).
const AdminPage = lazy(() => import('./admin/AdminPages'));
const OfficePage = lazy(() => import('./partner/OfficePages'));

export function App(): ReactNode {
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute();
  // The API client reads the token through this ref, so it always sends the latest one.
  const csrf = useRef<string | null>(null);

  const api = useMemo(
    () =>
      new Api({
        fetch: (input, init) => window.fetch(input, init),
        csrf: () => csrf.current,
        onSignedOut: () => {
          csrf.current = null;
          setPhase({ kind: 'signed_out', notice: 'Your session has ended. Please sign in again.' });
        },
      }),
    [],
  );

  const signedIn = (session: Session): void => {
    csrf.current = session.csrf;
    setPhase({ kind: 'signed_in', session });
  };

  useEffect(() => {
    api.get('/api/auth/me', meResponse, { signedIn: false }).then(
      (me) => {
        const session = sessionFromMe(me);
        if (session === null) setPhase({ kind: 'signed_out', notice: null });
        else signedIn(session);
      },
      () => {
        setPhase({ kind: 'signed_out', notice: null });
      },
    );
  }, [api]);

  const session = phase.kind === 'signed_in' ? phase.session : null;
  const allowed = session !== null && routeAllowed(route, session.role);
  useEffect(() => {
    if (session !== null && !allowed) navigate(homeRoute(session.role));
  }, [session, allowed]);

  if (phase.kind === 'starting') return <p className="muted starting">Loading…</p>;
  if (session === null) {
    return (
      <SignIn
        api={api}
        notice={phase.kind === 'signed_out' ? phase.notice : null}
        onSignedIn={(s: ConsoleSessionResponse) => {
          signedIn(sessionFromSignIn(s));
        }}
      />
    );
  }

  const act = (work: () => Promise<void>): void => {
    setBusy(true);
    setError(null);
    work().then(
      () => {
        setBusy(false);
      },
      (err: unknown) => {
        setBusy(false);
        if (!(err instanceof SignedOutError)) setError(errorMessage(err));
      },
    );
  };

  const switchTo = (to: RoleContextView): void => {
    act(async () => {
      const s = await api.post('/api/auth/switch', to, consoleSessionResponse);
      signedIn(sessionFromSignIn(s));
      navigate(homeRoute(s.context.role));
    });
  };

  const signOut = (): void => {
    act(async () => {
      try {
        await api.postOnly('/api/auth/sign-out');
      } finally {
        csrf.current = null;
        setPhase({ kind: 'signed_out', notice: null });
      }
    });
  };

  return (
    <Console.Provider value={{ api, session }}>
      <Layout session={session} route={route} busy={busy} onSwitch={switchTo} onSignOut={signOut}>
        {error === null ? null : <Notice tone="bad">{error}</Notice>}
        {/* Pages are keyed by view, so switching view starts every page afresh. */}
        {allowed ? (
          <Suspense fallback={<p className="muted">Loading…</p>}>
            {session.role === 'partner_admin' ? (
              <OfficePage key={`${session.role}:${session.partnerId ?? ''}`} route={route} />
            ) : (
              <AdminPage key={session.role} route={route} />
            )}
          </Suspense>
        ) : null}
      </Layout>
    </Console.Provider>
  );
}
