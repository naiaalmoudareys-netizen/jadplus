/**
 * The signed-in frame (ADR 0023, 0036): the left navigation grouped under section labels, and a header with the
 * view, a view switch and Sign out. A partner office's header names its company, its kind (JAD Global team or
 * partner), its workspace and the services it handles; its menu shows exactly its workspace's pages.
 */
import type { RoleContextView } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { navGroups } from '../lib/nav';
import { formatRoute, isCurrent, type Route } from '../lib/router';
import { contextKey, viewName, type Session } from '../lib/session';
import { officeHeader } from '../lib/workspace';
import { Icon } from './icons';
import { Tag } from './parts';
import { useWorkspace } from './workspace';

/** The office's identity; in JAD+ Admin, the view's name. */
function Identity({ view }: { view: string }): ReactNode {
  const ws = useWorkspace();
  if (ws === null) return <p className="view-name">{view}</p>;
  const h = officeHeader(ws);
  return (
    <div className="identity">
      <p className="identity-company">
        <span className="identity-name">{h.company}</span> <Tag tone={h.kind.tone}>{h.kind.label}</Tag>
      </p>
      <p className="identity-workspace">
        <span className="eyebrow">{h.title}</span>
        {h.also === null ? null : <span className="hint"> · {h.also}</span>}
      </p>
      {h.chips.length === 0 ? null : (
        <ul className="chips" aria-label="Services handled">
          {h.chips.map((c) => (
            <li key={c} className="chip">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  const ws = useWorkspace();
  return (
    <div className="shell">
      <aside className="nav">
        <p className="brand">
          JAD<span className="brand-plus">+</span>
        </p>
        <nav aria-label="Pages">
          {navGroups(session.role, ws?.workspace.pages ?? null).map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-group-label">{group.label}</p>
              <ul>
                {group.items.map((item) => {
                  const here = isCurrent(item.route, route);
                  return (
                    <li key={item.label}>
                      <a
                        href={formatRoute(item.route)}
                        className={here ? 'nav-link nav-current' : 'nav-link'}
                        aria-current={here ? 'page' : undefined}
                      >
                        <Icon name={item.icon} />
                        <span>{item.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <Identity view={viewName(current, session.contexts)} />
          <div className="topbar-actions">
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
            ) : null}
            <button type="button" className="btn btn-outline" onClick={onSignOut} disabled={busy}>
              Sign out
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
