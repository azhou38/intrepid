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
  const exact = await fetchExactTitleThumbnail(title, width);
  if (exact) return exact;
  return fetchSearchThumbnail(context ? `${title} ${context}` : title, width);
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
