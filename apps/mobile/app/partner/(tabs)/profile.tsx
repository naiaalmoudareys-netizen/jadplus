/**
 * The technician's Profile (ADR 0016, built from the owners' parts): who you are and for which company, "My
 * numbers" (S5, S8), language, notifications (job alerts always on; partners get no marketing, L1), terms and
 * privacy, sign-in and security (switch view R5, sign out, sign out everywhere T3), help and the app version.
 */
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { partnerTeam } from '../../../src/api/endpoints.js';
import { useI18n } from '../../../src/i18n/I18nProvider.js';
import { localDate } from '../../../src/i18n/format.js';
import { MyNumbers } from '../../../src/partner/MyNumbers.js';
import { LanguageRow } from '../../../src/profile/LanguagePicker.js';
import { NotificationsGroup } from '../../../src/profile/NotificationsGroup.js';
import { usePreferences } from '../../../src/profile/preferencesContext.js';
import { Group, ProfileHeader, SettingsRow } from '../../../src/profile/ProfileParts.js';
import { useSessionController } from '../../../src/session/SessionProvider.js';
import { useAccountActions } from '../../../src/ui/AccountSection.js';
import { useLoad } from '../../../src/ui/hooks.js';
import { Notice, Page } from '../../../src/ui/kit.js';

export default function PartnerProfile(): ReactNode {
  const { t, info } = useI18n();
  const { prefs } = usePreferences();
  const account = useAccountActions();
  const router = useRouter();
  const { api } = useSessionController();
  const loadTeam = useCallback(() => partnerTeam(api), [api]);
  const team = useLoad(loadTeam);
  if (account.role === null) return null;
  const roleName = t(`role.${account.role}`);
  const self = team.data?.technicians.find((tech) => tech.self) ?? null;
  const company = team.data?.partner?.name ?? null;
  const open = (href: Href) => () => {
    router.push(href);
  };

  return (
    <Page>
      <ProfileHeader
        name={self?.name ?? company ?? roleName}
        line={company === null ? roleName : `${roleName} · ${company}`}
      />

      <MyNumbers />

      <Group title={t('profile.preferences')}>
        <LanguageRow bare />
      </Group>

      <NotificationsGroup owner={false} />

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
        <SettingsRow
          icon="chatbubbles-outline"
          title={t('partner.help.job')}
          detail={t('partner.help.jobNote')}
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
