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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AuditLog } from './admin/AuditLog';
import { Building } from './admin/Building';
import { Buildings } from './admin/Buildings';
import { Desk } from './admin/Desk';
import { DeskItem } from './admin/DeskItem';
import { AdminInvoices } from './admin/Invoices';
import { NeedsAction } from './admin/NeedsAction';
import { Offers } from './admin/Offers';
import { OnCall } from './admin/OnCall';
import { Overview } from './admin/Overview';
import { PartnerPage } from './admin/PartnerPage';
import { Partners } from './admin/Partners';
import { People } from './admin/People';
import { Person } from './admin/Person';
import { Reports } from './admin/Reports';
import { RequestPage } from './admin/RequestPage';
import { Requests } from './admin/Requests';
import { Services } from './admin/Services';
import { Settings } from './admin/Settings';
import { Staff } from './admin/Staff';
import { Api, SignedOutError, errorMessage } from './lib/api';
import { homeRoute, routeAllowed, type Route } from './lib/router';
import { sessionFromMe, sessionFromSignIn, type Session } from './lib/session';
import { AfterHours } from './partner/AfterHours';
import { Dispatch } from './partner/Dispatch';
import { Documents } from './partner/Documents';
import { OfficeInvoices } from './partner/Invoices';
import { JobPage } from './partner/JobPage';
import { JobsBoard } from './partner/JobsBoard';
import { OfficeMessages } from './partner/Messages';
import { OfficeOverview } from './partner/Overview';
import { Performance } from './partner/Performance';
import { Quotes } from './partner/Quotes';
import { RateCard } from './partner/RateCard';
import { Team } from './partner/Team';
import { Technician } from './partner/Technician';
import { Console, navigate, useRoute } from './ui/hooks';
import { Layout } from './ui/Layout';
import { Notice } from './ui/parts';
import { SignIn } from './ui/SignIn';

type Phase =
  | { readonly kind: 'starting' }
  | { readonly kind: 'signed_out'; readonly notice: string | null }
  | { readonly kind: 'signed_in'; readonly session: Session };

/** The page for a route; the role decides between JAD+ Admin's and the office's version of a shared route. */
function Page({ route, office }: { route: Route; office: boolean }): ReactNode {
  switch (route.name) {
    case 'overview':
      return <Overview />;
    case 'attention':
      return <NeedsAction />;
    case 'requests':
      // Keyed by the search, so the form shows what the address asks for after back/forward.
      return <Requests key={`${route.q}|${route.status ?? ''}`} q={route.q} status={route.status} />;
    case 'request':
      return office ? <JobPage id={route.id} /> : <RequestPage id={route.id} />;
    case 'people':
      return <People key={route.q} q={route.q} />;
    case 'person':
      return <Person id={route.id} />;
    case 'desk':
      return <Desk status={route.status} />;
    case 'desk_item':
      return <DeskItem id={route.id} />;
    case 'partners':
      return <Partners />;
    case 'partner':
      return <PartnerPage id={route.id} />;
    case 'services':
      return <Services />;
    case 'buildings':
      return <Buildings />;
    case 'building':
      return <Building project={route.project} building={route.building} />;
    case 'offers':
      return <Offers />;
    case 'on_call':
      return <OnCall />;
    case 'reports':
      return <Reports month={route.month} />;
    case 'audit':
      return <AuditLog />;
    case 'staff':
      return <Staff />;
    case 'settings':
      return <Settings />;
    case 'invoices':
      return office ? <OfficeInvoices /> : <AdminInvoices />;
    case 'office':
      return <OfficeOverview />;
    case 'dispatch':
      return <Dispatch date={route.date} />;
    case 'jobs':
      return <JobsBoard />;
    case 'messages':
      return <OfficeMessages />;
    case 'quotes':
      return <Quotes />;
    case 'team':
      return <Team />;
    case 'technician':
      return <Technician id={route.id} />;
    case 'documents':
      return <Documents />;
    case 'rate_card':
      return <RateCard />;
    case 'after_hours':
      return <AfterHours />;
    case 'performance':
      return <Performance month={route.month} />;
    case 'not_found':
      return null;
  }
}

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
          <Page
            key={`${session.role}:${session.partnerId ?? ''}`}
            route={route}
            office={session.role === 'partner_admin'}
          />
        ) : null}
      </Layout>
    </Console.Provider>
  );
}
