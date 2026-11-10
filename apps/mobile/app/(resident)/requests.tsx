/**
 * Requests tab (Naya, 10-Nov-2026: between Payments and Profile): report an emergency, raise a new request
 * (owners; tenants' requests need the owner's approval and come with the tenant features, A1), and follow
 * every request with its status, who is handling it and when they arrive (R1, R2).
 */
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { myRequests } from '../../src/api/endpoints.js';
import { RequestRow } from '../../src/requests/RequestRow.js';
import { useSession, useSessionController } from '../../src/session/SessionProvider.js';
import { useLoad } from '../../src/ui/hooks.js';
import { Body, Button, Heading, Notice, Page } from '../../src/ui/kit.js';

const REFRESH_MS = 30_000;

export default function Requests(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const router = useRouter();
  const load = useCallback(() => myRequests(api), [api]);
  const requests = useLoad(load, REFRESH_MS);
  const { reload } = requests;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  if (session.status !== 'signed_in') return <Redirect href="/" />;
  const owner = session.me.role === 'owner';
  return (
    <Page>
      <Button
        title="Report an emergency"
        kind="danger"
        onPress={() => {
          router.push('/emergency');
        }}
      />
      {owner ? (
        <Button
          title="New request"
          onPress={() => {
            router.push('/new-request');
          }}
        />
      ) : null}
      <Heading>My requests</Heading>
      {requests.error === null ? null : <Notice tone="error">{requests.error}</Notice>}
      {requests.data !== null && requests.data.length === 0 ? <Body muted>No requests yet.</Body> : null}
      {(requests.data ?? []).map((r) => (
        <RequestRow
          key={r.id}
          r={r}
          onPress={() => {
            router.push({ pathname: '/request/[id]', params: { id: r.id } });
          }}
        />
      ))}
    </Page>
  );
}
