// Pure helpers for turning an image manifest entry into a Wikimedia thumbnail URL of a given width.
// Shared by the app (utils/photoCache.ts) and the manifest build script (scripts/build-image-manifest.ts),
// so it must not import anything React Native or the manifest JSON itself.

// Wikimedia only generates thumbnails at a fixed set of widths and answers HTTP 400 for anything else
// (verified: 100/150/400/700/900/1024 are rejected; 120/250/330/500/960/1280/1920 are served). These are
// the steps the app uses. Every requested width is rounded UP to the next one so images are never
// blurrier than asked for.
export const THUMB_STEPS = [120, 250, 500, 960] as const;

export interface ManifestCredit {
  by?: string;          // photographer / author, plain text
  license?: string;     // e.g. "CC BY-SA 4.0"
  licenseUrl?: string;
  page?: string;        // the file's page on Commons/Wikipedia
}

export interface ManifestEntry {
  // Thumbnail URL with the width replaced by "{w}", or null when the source only exists as one
  // fixed-size file (then `o` is the only URL).
  t: string | null;
  o: string;            // original file URL — used when no thumbnail step fits
  ow: number;           // original width in px; a thumbnail can't be wider than this
  credit?: ManifestCredit;
}

// The manifest is keyed by the exact lookup the app makes: the title, plus the context string when the
// caller passes one (country headers pass the country so the search fallback is biased toward it).
export function manifestKey(title: string, context?: string): string {
  return context ? `${title}|${context}` : title;
}

// Smallest allowed step >= `want`, capped by what the original can actually supply. Returns null when
// even the smallest step is wider than the original (caller should then use the original URL).
export function snapWidth(want: number, originalWidth: number): number | null {
  const fit = THUMB_STEPS.filter(s => s <= originalWidth);
  if (fit.length === 0) return null;
  const up = fit.find(s => s >= want);
  return up ?? fit[fit.length - 1];
}

export function buildThumbUrl(entry: ManifestEntry, want: number): string {
  if (!entry.t) return entry.o;
  const w = snapWidth(want, entry.ow);
  return w == null ? entry.o : entry.t.replace('{w}', String(w));
}
