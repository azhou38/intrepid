import popularity from './spotPopularity.json';

// Which of a destination's spots the destination sheet's "Popular Spots" row shows, and how many. Popularity is each spot's
// English Wikipedia page views over the last year (src/data/spotPopularity.json, built by scripts/curation/spot-popularity.ts;
// 0 for a spot with no article of its own). The row holds the spots that clear POPULAR_VIEWS, most viewed first, so a
// destination with many well-known spots shows up to POPULAR_MAX of them and one with few shows only POPULAR_MIN: the
// count follows how popular the spots actually are rather than being a fixed number. A spot with no views of its own (no
// article, or not counted yet) sorts after the viewed ones in its existing order, which is the data's importance order, and
// fills the row only up to the minimum.
export const POPULAR_MIN = 2;
export const POPULAR_MAX = 10;
export const POPULAR_VIEWS = 2000;

const VIEWS = popularity as Record<string, number>;

export function popularSpotsOf<T extends { id: string }>(spots: T[]): T[] {
  const ranked = spots
    .map((s, i) => ({ s, i, v: VIEWS[s.id] ?? 0 }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  const popular = ranked.filter(r => r.v >= POPULAR_VIEWS).length;
  return ranked.slice(0, Math.min(POPULAR_MAX, Math.max(POPULAR_MIN, popular))).map(r => r.s);
}
