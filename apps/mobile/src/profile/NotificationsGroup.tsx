/**
 * Notification switches and the marketing consent (N4, L1; ADR 0016). A switch moves at once; if the change
 * cannot be saved it moves back and says so. News and offers can only be chosen with marketing consent.
 */
import { MARKETING_VERSION, type NotificationTopic } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { useT } from '../i18n/I18nProvider.js';
import { Notice } from '../ui/kit.js';
import { Group, SwitchRow } from './ProfileParts.js';
import { usePreferences } from './PreferencesProvider.js';

export function NotificationsGroup({ owner }: { owner: boolean }): ReactNode {
  const t = useT();
  const { prefs, change, consent } = usePreferences();
  const [draft, setDraft] = useState<Partial<Record<NotificationTopic | 'marketing', boolean | undefined>>>(
    {},
  );
  const [error, setError] = useState(false);
  if (prefs === null) return null;

  const value = (topic: NotificationTopic) => draft[topic] ?? prefs.notifications[topic];
  const marketing = draft.marketing ?? prefs.marketing !== null;

  const save = (key: NotificationTopic | 'marketing', next: boolean, work: () => Promise<void>) => {
    setError(false);
    setDraft((d) => ({ ...d, [key]: next }));
    work()
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setDraft((d) => ({ ...d, [key]: undefined }));
      });
  };
  const toggle = (topic: NotificationTopic) => (next: boolean) => {
    save(topic, next, () => change({ notifications: { [topic]: next } }));
  };

  return (
    <Group title={t('profile.notifications')}>
      <SwitchRow
        icon="construct-outline"
        title={t('profile.notify.requests')}
        detail={t('profile.notify.requestsNote')}
        value
        disabled
        onChange={() => undefined}
      />
      {owner ? (
        <>
          <SwitchRow
            icon="card-outline"
            title={t('profile.notify.payments')}
            detail={t('profile.notify.paymentsNote')}
            value={value('payments')}
            onChange={toggle('payments')}
          />
          <SwitchRow
            icon="business-outline"
            title={t('profile.notify.construction')}
            detail={t('profile.notify.constructionNote')}
            value={value('construction')}
            onChange={toggle('construction')}
          />
          <SwitchRow
            icon="megaphone-outline"
            title={t('profile.marketing')}
            detail={t('profile.marketingNote')}
            value={marketing}
            onChange={(next) => {
              save('marketing', next, () =>
                consent({ kind: 'marketing', version: MARKETING_VERSION, accepted: next }),
              );
            }}
          />
          <SwitchRow
            icon="newspaper-outline"
            title={t('profile.notify.news')}
            {...(marketing ? {} : { detail: t('profile.marketingOff') })}
            value={marketing && value('news')}
            disabled={!marketing}
            onChange={toggle('news')}
          />
          <SwitchRow
            icon="pricetag-outline"
            title={t('profile.notify.offers')}
            value={marketing && value('offers')}
            disabled={!marketing}
            onChange={toggle('offers')}
          />
        </>
      ) : null}
      {error ? <Notice tone="error">{t('profile.saveError')}</Notice> : null}
    </Group>
  );
}
