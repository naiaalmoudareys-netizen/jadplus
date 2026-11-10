/**
 * A1 (ADR 0021): a tenant's routine request waits for the owner. The owner approves it (it goes to the
 * partner or the JAD+ team) or declines it (closed; the tenant is told), declining asked once more on the
 * card itself. Shown only when the API allows it (`actions`).
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { decideApproval } from '../api/endpoints.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Card, Eyebrow, Notice } from '../ui/kit.js';
import { space } from '../ui/theme.js';
import { useAction } from '../ui/useAction.js';

export function OwnerApproval(props: { requestId: string; onDone: () => void }): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const action = useAction();
  const [confirming, setConfirming] = useState(false);
  const decide = (decision: 'approve' | 'decline') => {
    void action.run(() => decideApproval(api, props.requestId, { decision }), props.onDone);
  };
  return (
    <Card>
      <Eyebrow>{t('tenancy.approval.eyebrow')}</Eyebrow>
      <View style={styles.box} accessibilityLiveRegion="polite">
        {confirming ? (
          <>
            <Body>{t('tenancy.approval.confirmDecline')}</Body>
            <Button
              title={t('tenancy.approval.yesDecline')}
              kind="danger"
              busy={action.busy}
              onPress={() => {
                decide('decline');
              }}
            />
            <Button
              title={t('tenancy.keep')}
              kind="secondary"
              disabled={action.busy}
              onPress={() => {
                setConfirming(false);
              }}
            />
          </>
        ) : (
          <>
            <Body muted>{t('tenancy.approval.note')}</Body>
            <Button
              title={t('tenancy.approval.approve')}
              busy={action.busy}
              onPress={() => {
                decide('approve');
              }}
            />
            <Button
              title={t('tenancy.approval.decline')}
              kind="secondary"
              disabled={action.busy}
              onPress={() => {
                setConfirming(true);
              }}
            />
          </>
        )}
        {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm, marginTop: space.xs } });
