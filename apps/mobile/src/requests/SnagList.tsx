/**
 * The snag list on the owner's snagging request (ADR 0032; O3): each snag with where it is, its photo, and once
 * fixed the photo of the fix, with "Confirm the fix" or "Not fixed" (which reopens it).
 */
import type { Snag } from '@jadplus/shared';
import { useCallback, useState, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { decideSnag, snagList, snagPhotoPath } from '../api/reports.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad } from '../ui/hooks.js';
import { Body, Button, Card, Eyebrow, Notice } from '../ui/kit.js';
import { colors, fonts, radius, space } from '../ui/theme.js';
import { SNAG_STATUS, reopenedLabel, snagCounts } from './reportLogic.js';

function SnagItem(props: {
  requestId: string;
  snag: Snag;
  canDecide: boolean;
  onChanged: () => void;
}): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { snag } = props;
  const decide = (confirm: boolean) => {
    setBusy(true);
    setError(null);
    decideSnag(api, props.requestId, snag.id, confirm)
      .then(props.onChanged)
      .catch(() => {
        setError(t('report.error'));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const photos = [
    ...(snag.hasPhoto ? [{ which: 'snag' as const, label: t('snag.photo') }] : []),
    ...(snag.hasFixPhoto ? [{ which: 'fix' as const, label: t('snag.fixPhoto') }] : []),
  ];
  return (
    <View style={styles.item}>
      <Text style={styles.title}>{snag.title}</Text>
      <Body muted>
        {snag.room} · {t(SNAG_STATUS[snag.status])}
      </Body>
      {snag.reopenCount > 0 ? <Body muted>{reopenedLabel(snag.reopenCount, t)}</Body> : null}
      {photos.length === 0 ? null : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {photos.map((p) => (
            <Image
              key={p.which}
              source={api.authorizedImage(snagPhotoPath(props.requestId, snag.id, p.which))}
              style={styles.photo}
              resizeMode="cover"
              accessibilityLabel={`${p.label}: ${snag.title}`}
            />
          ))}
        </ScrollView>
      )}
      {props.canDecide && snag.status === 'fixed' ? (
        <View style={styles.row}>
          <Button
            title={t('snag.confirm')}
            busy={busy}
            onPress={() => {
              decide(true);
            }}
          />
          <Button
            title={t('snag.reopen')}
            kind="secondary"
            disabled={busy}
            onPress={() => {
              decide(false);
            }}
          />
        </View>
      ) : null}
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </View>
  );
}

export function SnagList({ requestId, onChanged }: { requestId: string; onChanged: () => void }): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const load = useCallback(() => snagList(api, requestId), [api, requestId]);
  const list = useLoad(load, 30_000);
  const snags = list.data?.snags ?? [];
  if (snags.length === 0) return null;
  const counts = snagCounts(snags.map((s) => s.status));
  return (
    <Card>
      <Eyebrow>{t('snag.list')}</Eyebrow>
      <Body muted>{t('snag.summary', counts)}</Body>
      {snags.map((s) => (
        <SnagItem
          key={s.id}
          requestId={requestId}
          snag={s}
          canDecide={list.data?.canDecide ?? false}
          onChanged={() => {
            void list.reload();
            onChanged();
          }}
        />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { gap: space.xs, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.line },
  title: { fontFamily: fonts.medium, fontSize: 16, color: colors.navy },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  photo: { width: 120, height: 120, borderRadius: radius, backgroundColor: colors.backgroundAlt },
});
