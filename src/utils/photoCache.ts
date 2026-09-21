import { WIKI_IMAGE_OVERRIDES } from '../data/imageOverrides';
import imageManifest from '../data/imageManifest.json';
import { buildThumbUrl, manifestKey, type ManifestEntry } from './imageUrl';

// Which Wikimedia image each place uses, resolved ahead of time by scripts/build-image-manifest.ts. With
// an entry the thumbnail URL is built right here for any width — no Wikipedia API round trip, so photos
// no longer need a lookup on every launch. Anything the manifest doesn't have (a place added since it was
// last generated, or one it couldn't find a photo for) falls through to the live lookup below.
const MANIFEST = (imageManifest as { entries: Record<string, ManifestEntry> }).entries;

// Full-resolution images (headers/hero photos) — keyed by destination/spot/country id.
export const photoCache = new Map<string, string>();

// Small images (map pins, list thumbnails, preview cards) — separate namespace so a pin's
// low-res thumbnail never gets reused for a full-screen header, and vice versa.
export const thumbCache = new Map<string, string>();

/**
 * Fetches a Wikipedia lead image sized to a specific pixel width via the MediaWiki
 * "pageimages" API (which supports an explicit `pithumbsize`, unlike the summary
 * endpoint's two fixed sizes). Requesting only the size actually needed keeps map-pin
 * and list-thumbnail loads small/fast while still allowing full-screen headers to ask
 * for a sharp, appropriately large image — instead of every caller downloading and
 * decoding the same multi-megapixel original.
 *
 * Tries an exact article-title match first (cheap, works for most names), then falls
 * back to full-text search for names that don't exactly match a Wikipedia title — extra
 * or missing words ("Bryggen Wharf" vs "Bryggen"), diacritic mismatches, or names that
 * resolve to a disambiguation page (which has no image of its own, so the first search
 * result that actually has a thumbnail is used instead).
 *
 * `context` (e.g. the parent destination's name) is appended to the search-fallback query
 * only — exact-title lookups ignore it. Many spot names are shared across places ("Grand
 * Canal", "Ribeira") or match an unrelated article more strongly than the intended one;
 * biasing the full-text search toward the right city/country meaningfully improves which
 * result search ranks first.
 */
export async function fetchWikiThumbnail(title: string, width: number, context?: string): Promise<string | null> {
  const known = MANIFEST[manifestKey(title, context)];
  if (known) return buildThumbUrl(known, width);

  // A hand-picked photo takes precedence over whatever the article's own lead image is — see
  // WIKI_IMAGE_OVERRIDES for why some places need one. Falls through to the normal lookup if
  // the override can't be resolved (offline, file renamed on Commons).
  const override = WIKI_IMAGE_OVERRIDES[title];
  if (override) {
    const url = await fetchCommonsFileThumbnail(override, width);
    if (url) return url;
  }
  const exact = await fetchExactTitleThumbnail(title, width);
  if (exact) return exact;
  return fetchSearchThumbnail(context ? `${title} ${context}` : title, width);
}

// In-flight requests, keyed the same way as photoCache/thumbCache — lets a prefetch fired at
// pin-tap time and the sheet's own mount-time fetch share one network request instead of
// racing two, when the sheet mounts (as it normally does) before the prefetch has resolved.
const pendingFetches = new Map<string, Promise<string | null>>();

/**
 * Starts (or reuses) a thumbnail fetch for `cacheKey` without waiting on the result — fire
 * this the moment the user taps a pin, so the network round trip overlaps the sheet's
 * slide-up animation instead of only starting once the sheet has already mounted. A no-op if
 * the URL is already cached or a fetch for this key is already in flight (e.g. re-tapping the
 * same pin quickly). Callers that need the eventual result should use `getOrFetchWikiThumbnail`
 * instead, which attaches to this same in-flight promise rather than double-fetching.
 */
export function prefetchWikiThumbnail(
  cacheKey: string, cache: Map<string, string>, title: string, width: number, context?: string,
): void {
  if (cache.has(cacheKey) || pendingFetches.has(cacheKey)) return;
  const promise = fetchWikiThumbnail(title, width, context).then(url => {
    pendingFetches.delete(cacheKey);
    if (url) cache.set(cacheKey, url);
    return url;
  });
  pendingFetches.set(cacheKey, promise);
}

/**
 * Resolves `cacheKey`'s thumbnail, reusing an in-flight fetch (e.g. one kicked off by
 * `prefetchWikiThumbnail` at pin-tap time) instead of starting a duplicate network request.
 */
export function getOrFetchWikiThumbnail(
  cacheKey: string, cache: Map<string, string>, title: string, width: number, context?: string,
): Promise<string | null> {
  if (cache.has(cacheKey)) return Promise.resolve(cache.get(cacheKey)!);
  const pending = pendingFetches.get(cacheKey);
  if (pending) return pending;
  const promise = fetchWikiThumbnail(title, width, context).then(url => {
    pendingFetches.delete(cacheKey);
    if (url) cache.set(cacheKey, url);
    return url;
  });
  pendingFetches.set(cacheKey, promise);
  return promise;
}

// Resolves a Wikimedia Commons file (name without the "File:" prefix) to a thumbnail URL of the
// requested width.
async function fetchCommonsFileThumbnail(file: string, width: number): Promise<string | null> {
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent('File:' + file)}` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=${width}&format=json&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const page = data?.query?.pages ? Object.values(data.query.pages)[0] as any : null;
    return page?.imageinfo?.[0]?.thumburl ?? null;
  } catch {
    return null;
  }
}

async function fetchExactTitleThumbnail(title: string, width: number): Promise<string | null> {
  try {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}` +
      `&prop=pageimages&format=json&pithumbsize=${width}&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;
    const page = pages ? Object.values(pages)[0] as any : null;
    return page?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

async function fetchSearchThumbnail(title: string, width: number): Promise<string | null> {
  try {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(title)}` +
      `&gsrlimit=5&prop=pageimages&format=json&pithumbsize=${width}&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    // Search results come back keyed by pageid, not in relevance order — resort by the
    // API's own `index` field so the closest title match is tried first.
    const ordered = (Object.values(pages) as any[]).sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
    for (const page of ordered) {
      if (page?.thumbnail?.source) return page.thumbnail.source;
    }
    return null;
  } catch {
    return null;
  }
}
