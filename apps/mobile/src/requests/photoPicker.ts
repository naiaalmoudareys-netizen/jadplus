/**
 * Choosing a photo for a request (ADR 0013). The photo is shrunk to at most 1600 px wide and re-saved as a
 * fresh JPEG on the phone, which leaves out the camera's location and other metadata; the API checks and
 * strips again before storing. The app asks for camera or photo access only when the person taps the button.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

export interface PickedPhoto {
  readonly uri: string;
  readonly width: number;
}

const MAX_WIDTH = 1600;

/** Opens the camera or the photo library; null when cancelled or access was refused. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  return asset === undefined ? null : { uri: asset.uri, width: asset.width };
}

/** The photo as a new JPEG without metadata, ready to upload. */
export async function preparePhoto(photo: PickedPhoto): Promise<Uint8Array<ArrayBuffer>> {
  const context = ImageManipulator.manipulate(photo.uri);
  if (photo.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
  return new File(saved.uri).bytes();
}
