/**
 * Investor Education (O5, S4; ADR 0033; service 'education', flow 'booking'), opened from New request. The next
 * session date is always shown ("Next date to be announced" when none is scheduled), then the upcoming sessions
 * with "Reserve my seat" (one seat per owner; "Full" when none is left; no waiting list) and "Send me the book".
 * Owners only (R2).
 */
import { Redirect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorText } from '../src/api/client.js';
import { askForBook, education } from '../src/education/api.js';
import { bookLine, nextDateLine } from '../src/education/logic.js';
import { SessionCard } from '../src/education/SessionCard.js';
import { useLang } from '../src/i18n/I18nProvider.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { useLoad, useNow } from '../src/ui/hooks.js';
import { Body, Button, Card, Eyebrow, Heading, Loading, Notice, Page } from '../src/ui/kit.js';
import { colors, fonts, space } from '../src/ui/theme.js';

function BookCard({ line, onAsked }: { line: string | null; onAsked: () => void }): ReactNode {
  const { api } = useSessionController();
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <Eyebrow>{t('education.book')}</Eyebrow>
      <Body muted>{t('education.bookAbout')}</Body>
      {line === null ? (
        <Button
          title={t('education.bookAsk')}
          kind="secondary"
          busy={busy}
          onPress={() => {
            setBusy(true);
            setError(null);
            askForBook(api)
              .then(onAsked)
              .catch((err: unknown) => {
                setError(errorText(err, t, 'education.error'));
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        />
      ) : (
        <Body>{line}</Body>
      )}
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </Card>
  );
}

export default function Education(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const lang = useLang();
  const { t } = lang;
  const now = useNow(60_000);
  const load = useCallback(() => education(api), [api]);
  const data = useLoad(load);
  const [note, setNote] = useState<string | null>(null);
  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if (data.loading && data.data === null) return <Loading />;
  const e = data.data;
  const changed = (message: string | null) => {
    setNote(message);
    void data.reload();
  };
  return (
    <Page>
      <Heading>{t('education.title')}</Heading>
      <Body muted>{t('education.intro')}</Body>
      {data.error === null ? null : <Notice tone="error">{data.error}</Notice>}
      {note === null ? null : <Notice>{note}</Notice>}
      {e === null ? null : (
        <>
          <Card>
            <Eyebrow>{t('education.next')}</Eyebrow>
            <Text style={styles.next}>{nextDateLine(e, lang)}</Text>
          </Card>
          <View style={styles.list}>
            <Eyebrow>{t('education.sessions')}</Eyebrow>
            {e.sessions.length === 0 ? <Body muted>{t('education.noSessions')}</Body> : null}
            {e.sessions.map((s) => (
              <SessionCard key={s.id} session={s} now={now} onChanged={changed} />
            ))}
          </View>
          <BookCard
            line={bookLine(e.book, lang)}
            onAsked={() => {
              changed(null);
            }}
          />
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  next: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 24, color: colors.navy },
});
