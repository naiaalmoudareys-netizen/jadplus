/**
 * One Investor Education session (O5; ADR 0033): title, time, place, seats, and "Reserve my seat" or "Give back
 * my seat". An online session's joining link is opened in the browser, only for an owner holding a seat.
 */
import type { OwnerSession } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { Linking, StyleSheet, Text } from 'react-native';
import { errorText } from '../api/client.js';
import { useLang } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Card, Eyebrow, Notice } from '../ui/kit.js';
import { colors, fonts } from '../ui/theme.js';
import { giveBackSeat, reserveSeat } from './api.js';
import { joinLink, placeLine, seatAction, seatLine, sessionWhen } from './logic.js';

export function SessionCard({
  session,
  now,
  onChanged,
}: {
  session: OwnerSession;
  now: number;
  onChanged: (message: string) => void;
}): ReactNode {
  const { api } = useSessionController();
  const lang = useLang();
  const { t } = lang;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = seatAction(session, now);
  const link = joinLink(session);

  const act = (kind: 'reserve' | 'give_back') => {
    setBusy(true);
    setError(null);
    const call = kind === 'reserve' ? reserveSeat(api, session.id) : giveBackSeat(api, session.id);
    call
      .then(() => {
        onChanged(t(kind === 'reserve' ? 'education.reserved' : 'education.gaveBack'));
      })
      .catch((err: unknown) => {
        setError(errorText(err, t, 'education.error'));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Card>
      <Eyebrow>{sessionWhen(session, lang)}</Eyebrow>
      <Text style={styles.title}>{session.title}</Text>
      <Body muted>{placeLine(session, lang)}</Body>
      <Body>{session.description}</Body>
      <Text style={[styles.seats, session.mySeat && styles.mine]}>{seatLine(session, lang)}</Text>
      {link === null ? null : (
        <Button
          title={t('education.openLink')}
          kind="secondary"
          onPress={() => {
            Linking.openURL(link).catch(() => {
              setError(t('education.linkError'));
            });
          }}
        />
      )}
      {action === null ? null : (
        <Button
          title={t(action === 'reserve' ? 'education.reserve' : 'education.giveBack')}
          kind={action === 'reserve' ? 'primary' : 'secondary'}
          busy={busy}
          onPress={() => {
            act(action);
          }}
        />
      )}
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 24, color: colors.navy },
  seats: { fontFamily: fonts.semibold, fontSize: 14, color: colors.slate },
  mine: { color: colors.ok },
});
