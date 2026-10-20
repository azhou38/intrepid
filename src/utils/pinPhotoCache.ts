import * as FileSystem from 'expo-file-system/legacy';
import { SPOTS, spotPhotoTitle, type Spot } from '../data/spots';
import { fetchWikiThumbnail, thumbCache } from './photoCache';

// Spot pin photos kept on disk, so a destination's pins show their photos at once on every later visit (and after a
// relaunch), and a destination's pin photos can be fetched the moment it is tapped, during the camera's flight.
//
//   pinPhotoUri(spot)          → a local file:// URI when the photo is on disk, else null (synchronous)
//   loadPinPhoto(spot)         → resolves to a local URI (downloading it once), or the remote URL if the disk fails
//   prefetchPinPhotos(spots)   → starts downloading every one of them now (most important first), without waiting
//
// Downloads run a few at a time (MAX_PARALLEL) so a destination with 84 spots doesn't open 84 connections at once.

export const PIN_PHOTO_WIDTH = 120;
const DIR = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}pinphotos/` : null;
const MAX_PARALLEL = 6;

const onDisk = new Map<string, string>();       // spot id -> local file URI
const inFlight = new Map<string, Promise<string | null>>();
const queue: (() => void)[] = [];
let running = 0;
let ready: Promise<void> | null = null;

const fileFor = (spotId: string) => `${DIR}${spotId.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;

// Read what is already on disk once, at first use.
function init(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    if (!DIR) return;
    try {
      const info = await FileSystem.getInfoAsync(DIR);
      if (!info.exists) { await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }); return; }
      const names = new Set(await FileSystem.readDirectoryAsync(DIR));
      for (const sp of SPOTS) {
        const f = fileFor(sp.id);
        if (names.has(f.slice(DIR.length))) onDisk.set(sp.id, f);
      }
    } catch { /* no disk cache this session: photos load from the network */ }
  })();
  return ready;
}
init();

export const pinPhotoUri = (spot: Spot): string | null => onDisk.get(spot.id) ?? null;

function runNext() {
  while (running < MAX_PARALLEL && queue.length) { running++; queue.shift()!(); }
}

export function loadPinPhoto(spot: Spot): Promise<string | null> {
  const have = onDisk.get(spot.id);
  if (have) return Promise.resolve(have);
  const pending = inFlight.get(spot.id);
  if (pending) return pending;
  const p = (async () => {
    await init();
    const again = onDisk.get(spot.id);
    if (again) return again;
    const url = await fetchWikiThumbnail(spotPhotoTitle(spot), PIN_PHOTO_WIDTH);
    if (!url) return null;
    thumbCache.set(`spotpin_${spot.id}`, url);
    if (!DIR) return url;
    return new Promise<string | null>(resolve => {
      queue.push(async () => {
        try {
          const target = fileFor(spot.id);
          const res = await FileSystem.downloadAsync(url, target);
          if (res.status >= 200 && res.status < 300) { onDisk.set(spot.id, target); resolve(target); }
          else { await FileSystem.deleteAsync(target, { idempotent: true }); resolve(url); }
        } catch { resolve(url); }
        finally { running--; runNext(); }
      });
      runNext();
    });
  })().finally(() => inFlight.delete(spot.id));
  inFlight.set(spot.id, p);
  return p;
}

// Start downloading these spots' pin photos now (in the given order, most important first).
export function prefetchPinPhotos(spots: Spot[]): void {
  for (const sp of spots) if (!onDisk.has(sp.id)) loadPinPhoto(sp);
}
