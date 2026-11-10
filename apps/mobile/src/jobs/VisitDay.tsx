/**
 * The partner on the day of the visit (ADR 0019): "No one at the door"
 * records a visit where nobody let the technician in (A7), with a photo of the closed door taken first. It is
 * not held against the partner, who must book a new visit within 24 hours.
 */
import { NO_ACCESS_REBOOK_HOURS } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { addRequestPhoto, noAccess } from '../api/endpoints.js';
import { useT } from '../i18n/I18nProvider.js';
import { PhotoAdder } from '../requests/PhotoAdder.js';
import { pickPhoto, preparePhoto, type PickedPhoto } from '../requests/photoPicker.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Notice } from '../ui/kit.js';
import { useAction } from '../ui/useAction.js';
import { space } from '../ui/theme.js';

/** The door photo, then "Record no access". A photo already uploaded is not sent again on a second try. */
export function NoAccess(props: { jobId: string; onDone: () => void }): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const action = useAction();
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);

  const addPhoto = async (source: 'camera' | 'library') => {
    const picked = await pickPhoto(source);
    if (picked !== null) setPhoto(picked);
  };

  const record = async (door: PickedPhoto) => {
    let id = photoId;
    if (id === null) {
      id = (await addRequestPhoto(api, props.jobId, await preparePhoto(door))).id;
      setPhotoId(id);
    }
    await noAccess(api, props.jobId, { photoId: id });
  };

  return (
    <View style={styles.box}>
      <Body muted>{t('extras.noAccess.explain', { hours: NO_ACCESS_REBOOK_HOURS })}</Body>
      <PhotoAdder
        photos={photo === null ? [] : [photo]}
        max={1}
        onAdd={(source) => void addPhoto(source)}
        onRemove={() => {
          if (photoId === null) setPhoto(null);
        }}
      />
      <Button
        title={t('extras.noAccess.record')}
        busy={action.busy}
        disabled={photo === null}
        onPress={() => {
          if (photo !== null) void action.run(() => record(photo), props.onDone);
        }}
      />
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm } });
