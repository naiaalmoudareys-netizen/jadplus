/** Construction progress (O1, docs/DESIGN.md): JAD Global's published updates for the owner's projects. */
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { longDate } from '../../src/portal/format.js';
import { usePortal } from '../../src/portal/PortalProvider.js';
import { DemoBadge, ProgressBar } from '../../src/portal/ui.js';
import { Body, Card, Eyebrow, Heading, Loading, Notice, Page } from '../../src/ui/kit.js';
import { colors, fonts } from '../../src/ui/theme.js';

export default function Progress(): ReactNode {
  const { data, error, loading } = usePortal();
  if (loading && data === null) return <Loading />;
  if (data === null) {
    return (
      <Page>
        <Notice tone="error">{error ?? 'Construction updates are not available right now.'}</Notice>
      </Page>
    );
  }
  return (
    <Page>
      <DemoBadge />
      <Heading>Construction</Heading>
      {data.updates.length === 0 ? <Body muted>No construction updates yet.</Body> : null}
      {data.updates.map((u) => (
        <Card key={u.id}>
          <Eyebrow>{[u.project, u.building, u.stage].filter((x) => x !== null).join(' · ')}</Eyebrow>
          <Text style={styles.title}>{u.title}</Text>
          {u.date === null ? null : <Body muted>{longDate(u.date)}</Body>}
          {u.percent === null ? null : (
            <>
              <ProgressBar percent={u.percent} />
              <Body muted>{`${String(Math.round(u.percent))}% complete`}</Body>
            </>
          )}
          {u.details === null ? null : <Body>{u.details}</Body>}
          {u.handover === null ? null : <Body muted>{`Expected handover ${longDate(u.handover)}`}</Body>}
        </Card>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 24, color: colors.navy },
});
