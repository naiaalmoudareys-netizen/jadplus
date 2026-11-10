/** File names for documents saved for the phone's viewer: never taken from the server or the title as-is. */

const EXTENSIONS: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** A safe file name from a title: letters, digits and dashes only, with the extension of the file type. */
export function fileName(title: string, type: string): string {
  const base =
    title
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'document';
  return `${base}.${EXTENSIONS[type] ?? 'bin'}`;
}
