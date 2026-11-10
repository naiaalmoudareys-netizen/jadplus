/**
 * Profile (docs/DESIGN.md): the owner's contact details as Salesforce holds them, how to change them (through
 * the JAD+ desk, U2), and account actions. Notification and marketing switches (N4, L1) come next.
 */
import type { ReactNode } from 'react';
import { usePortalOptional } from '../../src/portal/PortalProvider.js';
import { DemoBadge, Fact } from '../../src/portal/ui.js';
import { AccountSection } from '../../src/ui/AccountSection.js';
import { Body, Card, Eyebrow, Heading, Page } from '../../src/ui/kit.js';

export default function Profile(): ReactNode {
  const portal = usePortalOptional();
  const person = portal?.data?.person ?? null;
  return (
    <Page>
      {portal === null ? null : <DemoBadge />}
      <Eyebrow>Your account</Eyebrow>
      <Heading>{person?.firstName ?? 'Profile'}</Heading>
      {person === null ? null : (
        <Card>
          <Fact label="Name" value={person.name} />
          <Fact label="Email" value={person.email} />
          <Fact label="Mobile" value={person.mobile} />
          <Body muted>
            To change these details, contact the JAD+ desk. They are kept in your JAD Global record.
          </Body>
        </Card>
      )}
      <AccountSection />
    </Page>
  );
}
