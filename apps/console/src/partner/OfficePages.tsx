/**
 * Every partner office page by route (ADR 0023, 0025). Loaded on its own only when a partner office signs in,
 * so the office never downloads the JAD+ Admin screens.
 */
import type { ReactNode } from 'react';
import type { Route } from '../lib/router';
import { AfterHours } from './AfterHours';
import { Dispatch } from './Dispatch';
import { Documents } from './Documents';
import { OfficeInvoices } from './Invoices';
import { JobPage } from './JobPage';
import { JobsBoard } from './JobsBoard';
import { ManagedUnit } from './ManagedUnit';
import { ManagedUnits } from './ManagedUnits';
import { OfficeMessages } from './Messages';
import { OfficeOverview } from './Overview';
import { Performance } from './Performance';
import { Quotes } from './Quotes';
import { RateCard } from './RateCard';
import { Team } from './Team';
import { Technician } from './Technician';
import { Education } from '../journey/Education';
import { EducationSession } from '../journey/EducationSession';
import { HandoverPage } from '../journey/HandoverPage';
import { Handovers } from '../journey/Handovers';

/** The office's page for a route; JAD+ Admin routes show nothing (the router never allows them). */
export default function OfficePage({ route }: { route: Route }): ReactNode {
  switch (route.name) {
    case 'office':
      return <OfficeOverview />;
    case 'dispatch':
      return <Dispatch date={route.date} />;
    case 'jobs':
      return <JobsBoard />;
    case 'request':
      return <JobPage id={route.id} />;
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
    case 'invoices':
      return <OfficeInvoices />;
    case 'handovers':
      return <Handovers />;
    case 'handover':
      return <HandoverPage id={route.id} />;
    case 'education':
      return <Education />;
    case 'education_session':
      return <EducationSession id={route.id} />;
    case 'managed_units':
      return <ManagedUnits />;
    case 'managed_unit':
      return <ManagedUnit id={route.id} />;
    default:
      return null;
  }
}
