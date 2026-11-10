/**
 * Messages on a request (ADR 0009: all contact inside JAD+). Shown to residents, the assigned partner and
 * JAD+ staff. People appear as "Owner", "Tenant", the partner company or "JAD+"; contact details typed in are
 * removed by the API, and the writer is told when that happened.
 */
import { dubaiClock, type RequestMessage } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorText, type ApiClient } from '../api/client.js';
import { postMessage } from '../api/endpoints.js';
import { useT } from '../i18n/I18nProvider.js';
import { Body, Button, Field, Heading, Notice } from './kit.js';
import { colors, fonts, radius, space } from './theme.js';

const MAX_LENGTH = 1000;

function Bubble({ m }: { m: RequestMessage }): ReactNode {
  const t = useT();
  return (
    <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
      <Text style={[styles.author, m.mine && styles.onNavy]}>
        {m.mine ? t('req.msg.you') : m.author} · {dubaiClock(m.at)}
      </Text>
      <Text style={[styles.body, m.mine && styles.onNavy]}>{m.body}</Text>
    </View>
  );
}

export function Conversation(props: {
  api: ApiClient;
  requestId: string;
  messages: readonly RequestMessage[];
  canMessage: boolean;
  onSent: () => void;
}): ReactNode {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  const send = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const sent = await postMessage(props.api, props.requestId, draft);
      setDraft('');
      if (sent.masked) {
        setNotice({ text: t('req.msg.masked'), tone: 'info' });
      }
      props.onSent();
    } catch (err) {
      setNotice({
        text: errorText(err, t),
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <Heading>{t('req.msg.title')}</Heading>
      {props.messages.length === 0 ? <Body muted>{t('req.msg.none')}</Body> : null}
      {props.messages.map((m) => (
        <Bubble key={m.id} m={m} />
      ))}
      {props.canMessage ? (
        <>
          <Field
            label={t('req.msg.write')}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={MAX_LENGTH}
          />
          <Button
            title={t('req.msg.send')}
            busy={busy}
            disabled={draft.trim() === ''}
            onPress={() => void send()}
          />
        </>
      ) : null}
      {notice === null ? null : <Notice tone={notice.tone}>{notice.text}</Notice>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, marginTop: space.md },
  bubble: { borderRadius: radius, padding: space.md, gap: space.xs, maxWidth: '90%' },
  mine: { backgroundColor: colors.navy, alignSelf: 'flex-end' },
  theirs: { backgroundColor: colors.card, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.line },
  author: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted },
  body: { fontSize: 17, fontFamily: fonts.regular, lineHeight: 23, color: colors.text },
  onNavy: { color: colors.onNavy },
});
