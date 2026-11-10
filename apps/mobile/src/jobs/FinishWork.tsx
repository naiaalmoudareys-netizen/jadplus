/**
 * Starting the work, and marking it done (E10; ADR 0018) with photos of the finished work and an optional
 * note to the resident. The photos are uploaded first (the API takes them while the work is in progress);
 * a photo already uploaded is not sent again if "Work done" has to be tapped a second time.
 */
import { MAX_REQUEST_PHOTOS, type JobAction } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { addRequestPhoto, startWork, workDone } from '../api/endpoints.js';
import { useT } from '../i18n/I18nProvider.js';
import { PhotoAdder } from '../requests/PhotoAdder.js';
import { pickPhoto, preparePhoto, type PickedPhoto } from '../requests/photoPicker.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Eyebrow, Field, Notice } from '../ui/kit.js';
import { useAction } from '../ui/useAction.js';
import { space } from '../ui/theme.js';

export function FinishWork(props: {
  jobId: string;
  actions: readonly JobAction[];
  /** Finished-work photos already on the request. */
  photosSent: number;
  onDone: () => void;
}): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const action = useAction();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [uploaded, setUploaded] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState('');
  const max = Math.max(0, MAX_REQUEST_PHOTOS - props.photosSent);

  const addPhoto = async (source: 'camera' | 'library') => {
    const picked = await pickPhoto(source);
    if (picked !== null) setPhotos((p) => [...p, picked].slice(0, max));
  };

  const finish = async () => {
    for (const photo of photos) {
      if (uploaded.has(photo.uri)) continue;
      await addRequestPhoto(api, props.jobId, await preparePhoto(photo));
      setUploaded((done) => new Set(done).add(photo.uri));
    }
    const text = note.trim();
    await workDone(api, props.jobId, text === '' ? {} : { note: text });
  };

  if (props.actions.includes('start_work')) {
    return (
      <View style={styles.box}>
        <Button
          title={t('journey.work.start')}
          busy={action.busy}
          onPress={() => void action.run(() => startWork(api, props.jobId), props.onDone)}
        />
        {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
      </View>
    );
  }
  if (!props.actions.includes('work_done')) return null;
  return (
    <View style={styles.box}>
      <Eyebrow>{t('journey.work.finish')}</Eyebrow>
      {max === 0 ? null : <Body muted>{t('journey.work.photosHint', { max })}</Body>}
      <PhotoAdder
        photos={photos}
        max={max}
        onAdd={(source) => void addPhoto(source)}
        onRemove={(photo) => {
          if (!uploaded.has(photo.uri)) setPhotos((all) => all.filter((x) => x !== photo));
        }}
      />
      <Field label={t('journey.work.note')} value={note} onChangeText={setNote} multiline maxLength={1000} />
      <Button
        title={t('journey.work.done')}
        busy={action.busy}
        onPress={() => void action.run(finish, props.onDone)}
      />
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm } });
