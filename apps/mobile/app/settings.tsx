/** Account page for technicians and partner offices (owners and tenants have the Profile tab). */
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { useSession } from '../src/session/SessionProvider.js';
import { AccountSection } from '../src/ui/AccountSection.js';
import { Heading, Page } from '../src/ui/kit.js';

export default function Settings(): ReactNode {
  const session = useSession();
  if (session.status !== 'signed_in') return <Redirect href="/" />;
  return (
    <Page>
      <Heading>Account</Heading>
      <AccountSection />
    </Page>
  );
}
