/**
 * Ending a request early (ADR 0019), each asked once more on the screen itself: "Cancel request" before the
 * work starts (a tenant only their own request), and the owner's "I arranged it myself" (E19), which closes
 * the request because they used their own contractor. Shown only when `actions` allows it.
 */
import type { CloseRequestBody, JobAction } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { closeRequest } from '../api/endpoints.js';
import type { MessageKey } from '../i18n/dictionary.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Card, Notice } from '../ui/kit.js';
import { useAction } from '../ui/useAction.js';
import { space } from '../ui/theme.js';

type Reason = CloseRequestBody['reason'];

const WORDS: Readonly<Record<Reason, { open: MessageKey; confirm: MessageKey; yes: MessageKey }>> = {
  cancel: { open: 'extras.cancel.open', confirm: 'extras.cancel.confirm', yes: 'extras.cancel.yes' },
  arranged_myself: {
    open: 'extras.arranged.open',
    confirm: 'extras.arranged.confirm',
    yes: 'extras.arranged.yes',
  },
};

const ACTION_OF: Readonly<Record<Reason, JobAction>> = {
  cancel: 'cancel',
  arranged_myself: 'arranged_myself',
};

export function CloseRequest(props: {
  requestId: string;
  actions: readonly JobAction[];
  onDone: () => void;
}): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const action = useAction();
  const [asking, setAsking] = useState<Reason | null>(null);
  const reasons = (['arranged_myself', 'cancel'] as const).filter((r) =>
    props.actions.includes(ACTION_OF[r]),
  );
  if (reasons.length === 0) return null;

  if (asking !== null) {
    const w = WORDS[asking];
    return (
      <Card>
        <View style={styles.box} accessibilityLiveRegion="polite">
          <Body>{t(w.confirm)}</Body>
          <Button
            title={t(w.yes)}
            kind="danger"
            busy={action.busy}
            onPress={() =>
              void action.run(() => closeRequest(api, props.requestId, { reason: asking }), props.onDone)
            }
          />
          <Button
            title={t('extras.keep')}
            kind="secondary"
            disabled={action.busy}
            onPress={() => {
              setAsking(null);
            }}
          />
          {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
        </View>
      </Card>
    );
  }
  return (
    <View style={styles.box}>
      {reasons.map((r) => (
        <Button
          key={r}
          title={t(WORDS[r].open)}
          kind="secondary"
          onPress={() => {
            setAsking(r);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm } });
