import * as FileSystem from 'expo-file-system/legacy';

// Files the app keeps (visit photos, the avatar) are stored by their full path, which includes the app's data container:
// .../Data/Application/<id>/Documents/..., .../Library/Caches/.... iOS can give the app a new container id when it is
// reinstalled or updated (moving its files across), so a path saved before then points at a container that no longer
// exists and the photo showed as an empty space. This puts a saved path back in the current container.
const CONTAINER_RE = /^(file:\/\/)?\/(?:private\/)?var\/mobile\/Containers\/Data\/Application\/[0-9A-F-]{36}\//i;
const currentContainer = (() => {
  const doc = FileSystem.documentDirectory ?? '';
  const m = doc.match(CONTAINER_RE);
  return m ? m[0].replace(/^file:\/\//, '') : null;
})();

export function localFileUri(uri: string): string {
  if (!currentContainer || !uri) return uri;
  const m = uri.match(CONTAINER_RE);
  if (!m) return uri;
  return `file://${currentContainer}${uri.slice(m[0].length)}`;
}

// A photo picked for a visit, copied into the app's documents (the picker hands back its own copy in the app's cache, which
// iOS may clear at any time, and the visit then shows an empty space where it was). Falls back to the picker's copy should
// the copy fail, rather than losing the photo from the visit.
const PHOTO_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}visit-photos/` : null;
let photoDirReady: Promise<void> | null = null;
export async function keepPickedPhoto(uri: string): Promise<string> {
  if (!PHOTO_DIR) return uri;
  try {
    photoDirReady ??= FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true }).catch(() => {});
    await photoDirReady;
    const ext = (uri.match(/\.(jpe?g|png|heic|webp)$/i)?.[1] ?? 'jpg').toLowerCase();
    const dest = `${PHOTO_DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}
