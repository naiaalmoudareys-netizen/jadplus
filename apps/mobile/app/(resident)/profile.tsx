/**
 * Profile (docs/DESIGN.md): the owner's contact details as Salesforce holds them, requests to the JAD+ desk
 * (ADR 0011: contact change, close account, anything else; status and the desk's reply), and account actions.
 * Notification and marketing switches (N4, L1) come next.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { longDate } from '../../src/portal/format.js';
import { deskStatusLabel } from '../../src/portal/deskRows.js';
import { usePortalOptional } from '../../src/portal/PortalProvider.js';
import { DemoBadge, Fact, LineItem } from '../../src/portal/ui.js';
import { AccountSection } from '../../src/ui/AccountSection.js';
import { Body, Button, Card, Eyebrow, Heading, Page } from '../../src/ui/kit.js';

const ACCOUNT_REQUESTS = ['Update my contact details', 'Close my JAD+ account', 'Other'] as const;

export default function Profile(): ReactNode {
  const portal = usePortalOptional();
  const router = useRouter();
  const reload = portal?.reload;
  // Back from a new desk request: show it in the list.
  useFocusEffect(
    useCallback(() => {
      if (reload !== undefined) void reload();
    }, [reload]),
  );
  const data = portal?.data ?? null;
  const person = data?.person ?? null;
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
            These are kept in your JAD Global record. To change them, ask the JAD+ desk below.
          </Body>
        </Card>
      )}
      {data === null ? null : (
        <>
          <Heading>JAD+ desk</Heading>
          <Card>
            {data.deskRequests.length === 0 ? <Body muted>No requests yet.</Body> : null}
            {data.deskRequests.map((r) => (
              <LineItem
                key={r.id}
                title={r.type}
                detail={[r.ref, r.unitName, r.reply].filter((x) => x !== null).join(' · ')}
                amount={deskStatusLabel(r.status)}
                note={longDate(r.createdAt.slice(0, 10))}
                tone={r.status === 'Completed' ? 'good' : 'normal'}
              />
            ))}
          </Card>
          {ACCOUNT_REQUESTS.map((type) => (
            <Button
              key={type}
              title={type === 'Other' ? 'Ask the JAD+ desk something else' : type}
              kind="secondary"
              onPress={() => {
                router.push({ pathname: '/desk-request', params: { type } });
              }}
            />
          ))}
        </>
      )}
      <AccountSection />
    </Page>
  );
}
