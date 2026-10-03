// Destination header images: the rule, and the checks that enforce it. See AGENTS.md ("Destination
// header images") for the rule in full.
//
// A destination's header (the big photo at the top of its sheet, also used for its map pin) is the
// first impression of the place, so it is never left to whatever photo leads the place's Wikipedia
// article — those are often a single building, a monument, a satellite/aerial view, a map or a crowd
// shot. Every destination must have a hand-picked Commons file in WIKI_IMAGE_OVERRIDES
// (src/data/imageOverrides.ts, keyed by the destination's name) that shows the place itself:
//   • cities and towns — a visually spectacular cityscape or panorama (skyline, waterfront, a sweeping
//     view over the rooftops); not one building or attraction, and not a high aerial/satellite view;
//   • nature destinations — the landscape the place is known for, seen wide.
// The header is cropped to roughly a square on a phone, so the file should be roughly 3:2, 4:3 or
// portrait, with the subject near the centre — a very wide panorama strip loses most of its view.

import { DESTINATIONS } from '../src/data/destinations';
import { WIKI_IMAGE_OVERRIDES } from '../src/data/imageOverrides';

// Header files narrower than this look soft on a phone at full sheet width.
export const HEADER_MIN_WIDTH = 2000;
// Width/height. Outside this range the phone's near-square crop throws most of the photo away.
export const HEADER_ASPECT_MIN = 0.6;
export const HEADER_ASPECT_MAX = 2.0;

// Destinations that predate the rule and still use an unreviewed header. NEVER add a new destination
// here — give it a hand-picked header instead. Remove an id once its header has been curated (the check
// warns about ids here that already have one).
export const HEADER_REVIEW_BACKLOG = new Set<string>([
  'nyc', 'grand-canyon', 'paris', 'nice', 'lyon', 'london', 'edinburgh', 'rome', 'florence',
  'barcelona', 'amsterdam', 'berlin', 'munich', 'lisbon', 'porto', 'zurich', 'interlaken', 'salzburg',
  'bruges', 'brussels', 'dublin', 'cliffs-of-moher', 'gothenburg', 'bergen', 'copenhagen', 'aarhus',
  'reykjavik', 'athens', 'prague', 'tokyo', 'kyoto', 'osaka', 'sydney',
]);

// Offline check: every destination has a hand-picked header (or is in the legacy backlog).
export function checkCuratedHeaders(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const overrides = WIKI_IMAGE_OVERRIDES as Record<string, string>;
  const ids = new Set(DESTINATIONS.map(d => d.id));
  for (const d of DESTINATIONS) {
    const curated = !!overrides[d.name];
    if (!curated && !HEADER_REVIEW_BACKLOG.has(d.id)) {
      errors.push(`${d.name} (${d.id}) has no hand-picked header image — add one to WIKI_IMAGE_OVERRIDES in `
        + `src/data/imageOverrides.ts (see AGENTS.md, "Destination header images").`);
    }
    if (curated && HEADER_REVIEW_BACKLOG.has(d.id)) {
      warnings.push(`${d.name} (${d.id}) now has a hand-picked header — remove it from HEADER_REVIEW_BACKLOG.`);
    }
  }
  for (const id of HEADER_REVIEW_BACKLOG) {
    if (!ids.has(id)) warnings.push(`HEADER_REVIEW_BACKLOG lists "${id}", which is not a destination — remove it.`);
  }
  return { errors, warnings };
}

// Online check, given the resolved original size of each destination's hand-picked header file.
export function checkHeaderDimensions(sizeOf: (file: string) => { w: number; h: number } | undefined): string[] {
  const problems: string[] = [];
  const overrides = WIKI_IMAGE_OVERRIDES as Record<string, string>;
  for (const d of DESTINATIONS) {
    const file = overrides[d.name];
    if (!file) continue;
    const size = sizeOf(file);
    if (!size || !size.w || !size.h) { problems.push(`${d.name}: could not read the size of "${file}".`); continue; }
    const aspect = size.w / size.h;
    if (size.w < HEADER_MIN_WIDTH) problems.push(`${d.name}: "${file}" is only ${size.w}px wide (min ${HEADER_MIN_WIDTH}).`);
    if (aspect < HEADER_ASPECT_MIN || aspect > HEADER_ASPECT_MAX) {
      problems.push(`${d.name}: "${file}" is ${size.w}×${size.h} (aspect ${aspect.toFixed(2)}), outside `
        + `${HEADER_ASPECT_MIN}–${HEADER_ASPECT_MAX}; the phone's near-square header crop will lose most of it.`);
    }
  }
  return problems;
}
