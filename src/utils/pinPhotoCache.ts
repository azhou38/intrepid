import * as FileSystem from 'expo-file-system/legacy';
import { SPOTS, spotPhotoTitle, type Spot } from '../data/spots';
import { DESTINATIONS } from '../data/destinations';
import type { Destination } from '../types';
import { fetchWikiThumbnail, thumbCache, manifestThumbUrl } from './photoCache';

// Spot pin photos kept on disk, so a destination's pins show their photos at once on every later visit (and after a
// relaunch), and a destination's pin photos can be fetched the moment it is tapped, during the camera's flight.
//
//   pinPhotoUri(spot)          → a local file:// URI when the photo is on disk, else null (synchronous)
//   loadPinPhoto(spot)         → resolves to a local URI (downloading it once), or the remote URL if the disk fails
//   prefetchPinPhotos(spots)   → starts downloading every one of them now (most important first), without waiting, behind
//                                any photo a pin is waiting for
//
// Downloads run a few at a time (MAX_PARALLEL) so a destination with 84 spots doesn't open 84 connections at once.

export const PIN_PHOTO_WIDTH = 120;
const DIR = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}pinphotos/` : null;
const MAX_PARALLEL = 6;

const onDisk = new Map<string, string>();       // spot id -> local file URI
const destOnDisk = new Map<string, string>();   // destination id -> local file URI (its photo pin; see loadDestPinPhoto)
const inFlight = new Map<string, Promise<string | null>>();
const queue: (() => void)[] = [];
const queuedSpots = new Map<string, () => void>();   // spot id -> its download, while it waits in the queue
const urgent = new Set<string>();                    // spots a pin is waiting for: ahead of every prefetch
const prefetched = new Set<string>();                // tried once this session: a failed photo isn't asked for again each pass
let running = 0;
let ready: Promise<void> | null = null;

// A cached file is named for the spot AND the photo it holds (a hash of the photo's URL), so when a spot's photo is
// replaced the old file no longer matches and the new photo is downloaded; keyed by spot alone, a pin kept showing the
// old photo while the spot's cards showed the new one.
const hash = (str: string) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36); };
const fileFor = (spot: Spot) => {
  const url = manifestThumbUrl(spotPhotoTitle(spot), PIN_PHOTO_WIDTH) ?? spotPhotoTitle(spot);
  return `${DIR}${spot.id.replace(/[^a-zA-Z0-9_-]/g, '_')}__${hash(url)}.jpg`;
};

// A destination's pin photo: the same kind of file, prefixed so it cannot collide with a spot's.
const destFileFor = (d: Destination) => {
  const url = manifestThumbUrl(d.name, PIN_PHOTO_WIDTH) ?? d.name;
  return `${DIR}dest__${d.id.replace(/[^a-zA-Z0-9_-]/g, '_')}__${hash(url)}.jpg`;
};

// Read what is already on disk once, at first use.
function init(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    if (!DIR) return;
    try {
      const info = await FileSystem.getInfoAsync(DIR);
      if (!info.exists) { await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }); return; }
      const names = new Set(await FileSystem.readDirectoryAsync(DIR));
      const current = new Set<string>();
      for (const sp of SPOTS) {
        const f = fileFor(sp);
        current.add(f.slice(DIR.length));
        if (names.has(f.slice(DIR.length))) onDisk.set(sp.id, f);
      }
      for (const d of DESTINATIONS) {
        const f = destFileFor(d);
        current.add(f.slice(DIR.length));
        if (names.has(f.slice(DIR.length))) destOnDisk.set(d.id, f);
      }
      // Files of replaced photos (and of the old spot-only names) are deleted in the background.
      for (const n of names) if (!current.has(n)) FileSystem.deleteAsync(`${DIR}${n}`, { idempotent: true }).catch(() => {});
    } catch { /* no disk cache this session: photos load from the network */ }
  })();
  return ready;
}
init();

export const pinPhotoUri = (spot: Spot): string | null => onDisk.get(spot.id) ?? null;

function runNext() {
  while (running < MAX_PARALLEL && queue.length) { running++; queue.shift()!(); }
}

export function loadPinPhoto(spot: Spot, background = false): Promise<string | null> {
  const have = onDisk.get(spot.id);
  if (have) return Promise.resolve(have);
  if (!background) {
    urgent.add(spot.id);
    const job = queuedSpots.get(spot.id);
    if (job) { queue.splice(queue.indexOf(job), 1); queue.unshift(job); }
  }
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
      const job = async () => {
        queuedSpots.delete(spot.id);
        try {
          const target = fileFor(spot);
          const res = await FileSystem.downloadAsync(url, target);
          if (res.status >= 200 && res.status < 300) { onDisk.set(spot.id, target); resolve(target); }
          else { await FileSystem.deleteAsync(target, { idempotent: true }); resolve(url); }
        } catch { resolve(url); }
        finally { running--; runNext(); }
      };
      queuedSpots.set(spot.id, job);
      if (urgent.has(spot.id)) queue.unshift(job); else queue.push(job);
      runNext();
    });
  })().finally(() => { inFlight.delete(spot.id); urgent.delete(spot.id); });
  inFlight.set(spot.id, p);
  return p;
}

// Start downloading these spots' pin photos now (in the given order, most important first).
export function prefetchPinPhotos(spots: Spot[]): void {
  for (const sp of spots) {
    if (onDisk.has(sp.id) || prefetched.has(sp.id)) continue;
    prefetched.add(sp.id);
    loadPinPhoto(sp, true);
  }
}

// Destination pin photos, kept on disk like the spots' (DestPinImages): each launch used to download every destination's
// pin photo again, and a request refused in that start-up burst left its pin a grey disc.
export const destPinPhotoUri = (d: Destination): string | null => destOnDisk.get(d.id) ?? null;
const destInFlight = new Map<string, Promise<string | null>>();
export function loadDestPinPhoto(d: Destination): Promise<string | null> {
  const have = destOnDisk.get(d.id);
  if (have) return Promise.resolve(have);
  const pending = destInFlight.get(d.id);
  if (pending) return pending;
  const p = (async () => {
    await init();
    const again = destOnDisk.get(d.id);
    if (again) return again;
    const url = await fetchWikiThumbnail(d.name, PIN_PHOTO_WIDTH);
    if (!url) return null;
    if (!thumbCache.has(d.id)) thumbCache.set(d.id, url);
    if (!DIR) return url;
    return new Promise<string | null>(resolve => {
      queue.push(async () => {
        try {
          const target = destFileFor(d);
          const res = await FileSystem.downloadAsync(url, target);
          if (res.status >= 200 && res.status < 300) { destOnDisk.set(d.id, target); resolve(target); }
          else { await FileSystem.deleteAsync(target, { idempotent: true }); resolve(url); }
        } catch { resolve(url); }
        finally { running--; runNext(); }
      });
      runNext();
    });
  })().finally(() => destInFlight.delete(d.id));
  destInFlight.set(d.id, p);
  return p;
}
