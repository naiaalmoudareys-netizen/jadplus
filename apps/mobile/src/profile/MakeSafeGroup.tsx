/**
 * The owner's make-safe limit (E8, L2 "make-safe cap pre-authorised"; ADR 0019). In an emergency the technician
 * may do urgent work to make the home safe up to this amount without waiting for a quote; anything more, and
 * every permanent repair, still needs the owner's approval (L4). The row opens the choices in place; a choice
 * is saved at once as a consent with the current wording's version.
 */
import { MAKE_SAFE_CAP_CHOICES, MAKE_SAFE_VERSION } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n/I18nProvider.js';
import { localDate } from '../i18n/format.js';
import { aed } from '../portal/format.js';
import { Choice } from '../ui/Choice.js';
import { Body, Notice } from '../ui/kit.js';
import { space } from '../ui/theme.js';
import { Group, SettingsRow } from './ProfileParts.js';
import { usePreferences } from './preferencesContext.js';

export function MakeSafeGroup(): ReactNode {
  const { t, info } = useI18n();
  const { prefs, consent } = usePreferences();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<number | 'none' | null>(null);
  const [error, setError] = useState(false);
  if (prefs === null) return null;

  const current = prefs.makeSafeCap;
  const shown = saving ?? current?.aed ?? 'none';
  const label = (cap: number | 'none') => (cap === 'none' ? t('extras.cap.none') : aed(cap, info.locale));

  const choose = (cap: number | 'none') => {
    if (saving !== null || cap === (current?.aed ?? 'none')) return;
    setError(false);
    setSaving(cap);
    consent({
      kind: 'make_safe_cap',
      version: MAKE_SAFE_VERSION,
      accepted: cap !== 'none',
      capAed: cap === 'none' ? null : cap,
    })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setSaving(null);
      });
  };

  return (
    <Group title={t('extras.cap.group')}>
      <SettingsRow
        icon="shield-checkmark-outline"
        title={t('extras.cap.title')}
        detail={
          current === null
            ? t('extras.cap.noneNote')
            : t('extras.cap.setOn', { date: localDate(current.at, info.locale) })
        }
        value={label(current?.aed ?? 'none')}
        onPress={() => {
          setOpen((o) => !o);
        }}
      />
      {open ? (
        <View style={styles.choices}>
          <Body muted>{t('extras.cap.explain')}</Body>
          {(['none', ...MAKE_SAFE_CAP_CHOICES] as const).map((cap) => (
            <Choice
              key={String(cap)}
              compact
              title={label(cap)}
              selected={shown === cap}
              disabled={saving !== null}
              onPress={() => {
                choose(cap);
              }}
            />
          ))}
          {error ? <Notice tone="error">{t('profile.saveError')}</Notice> : null}
        </View>
      ) : null}
    </Group>
  );
}

const styles = StyleSheet.create({ choices: { gap: space.sm, paddingVertical: space.md } });
