/** The signed-in frame: left navigation for the role, and a header with the view, a view switch and Sign out. */
import type { RoleContextView } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { formatRoute, isCurrent, navFor, type Route } from '../lib/router';
import { contextKey, viewName, type Session } from '../lib/session';
import { useCapabilities } from './capabilities';

export function Layout({
  session,
  route,
  busy,
  onSwitch,
  onSignOut,
  children,
}: {
  session: Session;
  route: Route;
  busy: boolean;
  onSwitch: (to: RoleContextView) => void;
  onSignOut: () => void;
  children: ReactNode;
}): ReactNode {
  const current: RoleContextView = { role: session.role, partnerId: session.partnerId };
  const others = session.contexts.length > 1;
  // ADR 0034: a partner office sees the pages of the services its company holds.
  const caps = useCapabilities();
  return (
    <div className="shell">
      <aside className="nav">
        <p className="brand">
          JAD<span className="brand-plus">+</span>
        </p>
        <nav aria-label="Pages">
          <ul>
            {navFor(session.role, caps).map((item) => (
              <li key={item.label}>
                <a
                  href={formatRoute(item.route)}
                  className={isCurrent(item.route, route) ? 'nav-link nav-current' : 'nav-link'}
                  aria-current={isCurrent(item.route, route) ? 'page' : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          {others ? (
            <label className="view-switch">
              <span className="label">View</span>
              <select
                value={contextKey(current)}
                disabled={busy}
                onChange={(e) => {
                  const to = session.contexts.find((c) => contextKey(c) === e.target.value);
                  if (to !== undefined) onSwitch(to);
                }}
              >
                {session.contexts.map((c) => (
                  <option key={contextKey(c)} value={contextKey(c)}>
                    {viewName(c, session.contexts)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="view-name">{viewName(current, session.contexts)}</p>
          )}
          <button type="button" className="btn btn-outline" onClick={onSignOut} disabled={busy}>
            Sign out
          </button>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
