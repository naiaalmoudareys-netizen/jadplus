/**
 * Profile (ADR 0016; Naya, 10-Nov-2026: "that entire section needs to also be professionally done"). One
 * scrolling page of grouped settings, like the phone's own settings:
 *
 * - who you are (from the JAD Global record; changes go through the JAD+ desk, U2)
 * - language (English, Arabic, French, Russian, Chinese)
 * - notifications and the marketing consent (N4, L1)
 * - emergencies: the owner's make-safe limit (E8, ADR 0019)
 * - JAD+ desk requests and their status (ADR 0011)
 * - privacy and terms: what was accepted when, the privacy notice, a copy of my data, close my account
 * - sign-in and security: switch view (R5, U7), sign out, sign out everywhere (T3)
 * - help: talk to a person, the home guide (V1), report an emergency, app version
 */
import Constants from 'expo-constants';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { useI18n } from '../../src/i18n/I18nProvider.js';
import { localDate } from '../../src/i18n/format.js';
import { longDate } from '../../src/portal/format.js';
import { deskStatusLabel } from '../../src/portal/deskRows.js';
import { usePortalOptional } from '../../src/portal/PortalProvider.js';
import { DemoBadge } from '../../src/portal/ui.js';
import { LanguageRow } from '../../src/profile/LanguagePicker.js';
import { MakeSafeGroup } from '../../src/profile/MakeSafeGroup.js';
import { NotificationsGroup } from '../../src/profile/NotificationsGroup.js';
import { usePreferences } from '../../src/profile/preferencesContext.js';
import { Group, ProfileHeader, SettingsRow } from '../../src/profile/ProfileParts.js';
import { useAccountActions } from '../../src/ui/AccountSection.js';
import { Notice, Page } from '../../src/ui/kit.js';

export default function Profile(): ReactNode {
  const { t, info } = useI18n();
  const portal = usePortalOptional();
  const { prefs } = usePreferences();
  const account = useAccountActions();
  const router = useRouter();
  const reload = portal?.reload;
  // Back from a new desk request: show it in the list.
  useFocusEffect(
    useCallback(() => {
      if (reload !== undefined) void reload();
    }, [reload]),
  );
  if (account.role === null) return null;
  const owner = account.role === 'owner';
  const data = portal?.data ?? null;
  const person = data?.person ?? null;
  const roleName = t(`role.${account.role}`);
  const desk = (type: string, details?: string) => {
    router.push({
      pathname: '/desk-request',
      params: { type, ...(details === undefined ? {} : { details }) },
    });
  };
  const open = (href: Href) => () => {
    router.push(href);
  };

  return (
    <Page>
      {portal === null ? null : <DemoBadge />}
      <ProfileHeader
        name={person?.name ?? roleName}
        line={
          data === null
            ? roleName
            : `${roleName} · ${t('profile.residenceCount', { count: data.deals.length })}`
        }
      />

      {person === null ? null : (
        <Group title={t('profile.details')}>
          <SettingsRow icon="person-outline" title={t('profile.name')} value={person.name} />
          <SettingsRow icon="mail-outline" title={t('profile.email')} value={person.email} />
          <SettingsRow icon="call-outline" title={t('profile.mobile')} value={person.mobile} />
          <SettingsRow
            icon="create-outline"
            title={t('profile.updateDetails')}
            detail={t('profile.detailsNote')}
            onPress={() => {
              desk('Update my contact details');
            }}
          />
        </Group>
      )}

      <Group title={t('profile.preferences')}>
        <LanguageRow bare />
      </Group>

      <NotificationsGroup owner={owner} />

      {owner ? <MakeSafeGroup /> : null}

      {data === null ? null : (
        <Group title={t('profile.desk')}>
          {data.deskRequests.length === 0 ? (
            <SettingsRow icon="chatbox-ellipses-outline" title={t('profile.deskEmpty')} />
          ) : null}
          {data.deskRequests.map((r) => (
            <SettingsRow
              key={r.id}
              icon="document-text-outline"
              title={r.type}
              detail={[r.ref, r.unitName, r.reply, longDate(r.createdAt.slice(0, 10), info.locale)]
                .filter((x) => x !== null)
                .join(' · ')}
              value={deskStatusLabel(r.status, t)}
            />
          ))}
        </Group>
      )}

      <Group title={t('profile.privacy')}>
        <SettingsRow
          icon="document-outline"
          title={t('profile.terms')}
          detail={
            prefs?.terms === null || prefs === null
              ? null
              : t('profile.termsAccepted', { date: localDate(prefs.terms.at, info.locale) })
          }
          onPress={open('/legal/terms')}
        />
        <SettingsRow
          icon="shield-checkmark-outline"
          title={t('profile.privacyNotice')}
          detail={t('profile.privacyNoticeNote')}
          onPress={open('/legal/privacy')}
        />
        {owner ? (
          <>
            <SettingsRow
              icon="download-outline"
              title={t('profile.dataCopy')}
              onPress={() => {
                desk('Other', t('profile.dataCopyText'));
              }}
            />
            <SettingsRow
              icon="close-circle-outline"
              title={t('profile.closeAccount')}
              danger
              onPress={() => {
                desk('Close my JAD+ account');
              }}
            />
          </>
        ) : null}
      </Group>

      <Group title={t('profile.security')}>
        <SettingsRow icon="eye-outline" title={t('profile.currentView')} value={roleName} />
        {account.others.map((c) => (
          <SettingsRow
            key={`${c.role}:${c.partnerId ?? ''}`}
            icon="swap-horizontal-outline"
            title={t('profile.switchTo', { role: t(`role.${c.role}`) })}
            busy={account.busy}
            onPress={() => {
              account.switchTo(c);
            }}
          />
        ))}
        <SettingsRow
          icon="log-out-outline"
          title={t('profile.signOut')}
          busy={account.busy}
          onPress={() => {
            account.signOut(false);
          }}
        />
        <SettingsRow
          icon="phone-portrait-outline"
          title={t('profile.signOutEverywhere')}
          detail={t('profile.signOutEverywhereNote')}
          danger
          busy={account.busy}
          onPress={() => {
            account.signOut(true);
          }}
        />
      </Group>
      {account.error === null ? null : <Notice tone="error">{account.error}</Notice>}

      <Group title={t('profile.help')}>
        {owner ? (
          <SettingsRow
            icon="chatbubbles-outline"
            title={t('profile.talk')}
            detail={t('profile.talkNote')}
            onPress={() => {
              desk('Other');
            }}
          />
        ) : null}
        <SettingsRow
          icon="book-outline"
          title={t('guide.title')}
          detail={t('guide.linkNote')}
          onPress={open('/guide')}
        />
        <SettingsRow
          icon="warning-outline"
          title={t('profile.emergency')}
          detail={t('profile.emergencyNote')}
          danger
          onPress={open('/emergency')}
        />
        <SettingsRow
          icon="information-circle-outline"
          title={t('profile.version')}
          value={Constants.expoConfig?.version ?? '-'}
        />
      </Group>
    </Page>
  );
}
