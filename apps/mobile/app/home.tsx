/**
 * Home for owners and tenants. Their screens (units, requests, emergencies) come in phase B; until then this
 * shows who is signed in and the way to account settings.
 */
import { Link, Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { useSession } from '../src/session/SessionProvider.js';
import { Body, Heading, Notice, Page } from '../src/ui/kit.js';

const VIEW_NAMES = { owner: 'Owner', tenant: 'Tenant' } as const;

export default function Home(): ReactNode {
  const session = useSession();
  if (session.status !== 'signed_in') return <Redirect href="/" />;
  const role = session.me.role;
  const view = role === 'owner' || role === 'tenant' ? VIEW_NAMES[role] : 'JAD+';
  return (
    <Page>
      <Heading>Welcome to JAD+</Heading>
      <Body muted>Signed in as: {view}</Body>
      <Notice>Your residence, requests and emergency button arrive in the next version of the app.</Notice>
      <Link href="/settings" style={{ fontSize: 17, textDecorationLine: 'underline' }}>
        Account and sign out
      </Link>
    </Page>
  );
}
