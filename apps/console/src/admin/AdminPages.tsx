/**
 * Every JAD+ Admin page by route (ADR 0023, 0025). Loaded on its own only when a staff member signs in, so a
 * partner office never downloads the admin screens (and the first load stays small).
 */
import type { ReactNode } from 'react';
import type { Route } from '../lib/router';
import { AuditLog } from './AuditLog';
import { Building } from './Building';
import { Buildings } from './Buildings';
import { Desk } from './Desk';
import { DeskItem } from './DeskItem';
import { AdminInvoices } from './Invoices';
import { NeedsAction } from './NeedsAction';
import { Offers } from './Offers';
import { OnCall } from './OnCall';
import { Overview } from './Overview';
import { PartnerPage } from './PartnerPage';
import { Partners } from './Partners';
import { People } from './People';
import { Person } from './Person';
import { Reports } from './Reports';
import { RequestPage } from './RequestPage';
import { Requests } from './Requests';
import { Services } from './Services';
import { Settings } from './Settings';
import { Staff } from './Staff';
import { Education } from '../journey/Education';
import { EducationSession } from '../journey/EducationSession';
import { HandoverPage } from '../journey/HandoverPage';
import { Handovers } from '../journey/Handovers';

/** JAD+ Admin's page for a route; routes of the partner office show nothing (the router never allows them). */
export default function AdminPage({ route }: { route: Route }): ReactNode {
  switch (route.name) {
    case 'overview':
      return <Overview />;
    case 'attention':
      return <NeedsAction />;
    case 'requests':
      // Keyed by the search, so the form shows what the address asks for after back/forward.
      return <Requests key={`${route.q}|${route.status ?? ''}`} q={route.q} status={route.status} />;
    case 'request':
      return <RequestPage id={route.id} />;
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
      return <AdminInvoices />;
    case 'handovers':
      return <Handovers />;
    case 'handover':
      return <HandoverPage id={route.id} />;
    case 'education':
      return <Education />;
    case 'education_session':
      return <EducationSession id={route.id} />;
    default:
      return null;
  }
}
