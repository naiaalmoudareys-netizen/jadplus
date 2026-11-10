/**
 * Opening the owner's documents (receipts, floor plan, passport / Emirates ID copies) in the phone's own
 * viewer (ADR 0010). The file is fetched with the session, written to a private JAD+ folder in the app's
 * temporary storage and shown with the system preview. That folder is emptied before each new document and on
 * sign-out, so copies of identity documents do not stay on the phone.
 */
import { Directory, File, Paths } from 'expo-file-system';
import type { ApiClient } from '../api/client.js';
import { fileName } from './filename.js';

function folder(): Directory {
  return new Directory(Paths.cache, 'jadplus-documents');
}

/** Deletes every document the app has opened. */
export function clearDocuments(): void {
  const dir = folder();
  if (dir.exists) dir.delete();
}

export async function openDocument(api: ApiClient, fileId: string, title: string): Promise<void> {
  const { bytes, type } = await api.download(`/api/owner/files/${encodeURIComponent(fileId)}`);
  clearDocuments();
  const dir = folder();
  dir.create();
  const file = new File(dir, fileName(title, type));
  await file.write(bytes);
  await File.preview(file, { title, mimeType: type });
}
