import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { PickedFile } from '@/lib/api';

export const MAX_BYTES = 8 * 1024 * 1024;
export type FileSource = 'camera' | 'library' | 'pdf';

const nameFor = () => `photo-${Date.now()}.jpg`;

// Phone photos are often 5 to 10 MB. Shrink them before upload: faster on mobile data, and well under the 8 MB limit.
async function shrink(uri: string): Promise<PickedFile> {
  const context = ImageManipulator.manipulate(uri, { maxWidth: 2000 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const size = (await (await fetch(saved.uri)).blob()).size;
  if (size > MAX_BYTES) throw new Error('This photo is too large. Please choose a smaller one.');
  return { uri: saved.uri, name: nameFor(), mimeType: 'image/jpeg' };
}

/** Returns null when the trainer cancels. Throws an Error with a message fit to show when something is wrong. */
export async function pickFile(source: FileSource, options: { front?: boolean } = {}): Promise<PickedFile | null> {
  if (source === 'pdf') {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset) return null;
    if (asset.size !== undefined && asset.size > MAX_BYTES) throw new Error('This PDF is larger than 8 MB. Please choose a smaller file.');
    return { uri: asset.uri, name: asset.name || `document-${Date.now()}.pdf`, mimeType: 'application/pdf' };
  }

  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Zoove needs the camera to take this photo. Allow camera access in your phone settings, or choose a photo from your gallery.');
  }
  const picked =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, ...(options.front ? { cameraType: ImagePicker.CameraType.front } : {}) })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: false });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  if (!asset) return null;
  try {
    return await shrink(asset.uri);
  } catch (error) {
    if (error instanceof Error && error.message.includes('too large')) throw error;
    throw new Error('Could not read this photo. Please try another.');
  }
}
