// Fetches each spot's Google rating and review count from the Places API (New) into src/data/spotRatings.json, which the
// spot sheet reads (SpotSheet.tsx → GoogleRating). One Text Search request per spot, biased to the spot's coordinates.
//
//   GOOGLE_PLACES_API_KEY=… npx tsx scripts/fetch-google-ratings.ts [--dest id] [--country NZ] [--limit 25] [--refresh] [--dry]
//
// The key is read from the environment or from .env.local (gitignored); it never goes into the app. By default a spot that
// already has a rating is skipped, so a run only pays for new spots; --refresh re-fetches everything (Google's terms limit
// how long ratings may be cached, so refresh periodically — see PIPELINES.md). --dry prints the spots it would query.
//
// A match is kept only when the place found is within MAX_METRES of the spot's pin. Matches over REVIEW_METRES, or whose
// name shares no word with the spot's, are written but listed under "check these" at the end. Place IDs are stored in
// scripts/spot-place-ids.json (Google lets place IDs be kept indefinitely) so later refreshes can skip the search.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SPOTS } from '../src/data/spots';
import { DESTINATIONS } from '../src/data/destinations';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
const destArg = arg('--dest'), countryArg = arg('--country'), limit = Number(arg('--limit') ?? Infinity);
const refresh = process.argv.includes('--refresh'), dry = process.argv.includes('--dry');
const ROOT = process.cwd();
const RATINGS = resolve(ROOT, 'src/data/spotRatings.json');
const PLACES = resolve(ROOT, 'scripts/spot-place-ids.json');
const MAX_METRES = 1500, REVIEW_METRES = 400;

function loadKey(): string | undefined {
  if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
  const f = resolve(ROOT, '.env.local');
  if (!existsSync(f)) return undefined;
  return readFileSync(f, 'utf8').match(/^GOOGLE_PLACES_API_KEY=(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
}
const key = loadKey();
if (!key && !dry) { console.error('No key: set GOOGLE_PLACES_API_KEY in the environment or in .env.local.'); process.exit(1); }

type Rating = { rating: number; count?: number };
type Place = { placeId: string; name: string; metres: number; fetched: string };
const read = <T>(f: string): Record<string, T> => existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
const ratings = read<Rating>(RATINGS), places = read<Place>(PLACES);

const metres = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const R = 6371000, rad = (x: number) => x * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const words = (s: string) => new Set(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function search(query: string, at: { latitude: number; longitude: number }) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': key!,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({ textQuery: query, pageSize: 1, locationBias: { circle: { center: at, radius: 1000 } } }),
    });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * 2 ** i); continue; }
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return (await res.json()).places?.[0] as { id: string; displayName?: { text: string }; location: { latitude: number; longitude: number }; rating?: number; userRatingCount?: number } | undefined;
  }
  throw new Error('rate limited');
}

async function main() {
  const destName = new Map(DESTINATIONS.map(d => [d.id, d.name]));
  const todo = SPOTS.filter(s => (!destArg || s.destinationId === destArg) && (!countryArg || (s.countryCode ?? DESTINATIONS.find(d => d.id === s.destinationId)?.countryCode) === countryArg)
    && (refresh || !ratings[s.id])).slice(0, limit);
  console.log(`${todo.length} spot(s) to query${dry ? ' (dry run)' : ''}.`);
  const check: string[] = []; let got = 0, none = 0, far = 0;
  for (const s of todo) {
    const place = s.destinationId ? destName.get(s.destinationId) : s.country;
    const query = [s.name, place].filter(Boolean).join(', ');
    if (dry) { console.log(`  ${s.id}: ${query}`); continue; }
    try {
      const p = await search(query, s.coordinates);
      if (!p) { none++; console.log(`  –  ${s.name}: no place found`); continue; }
      const m = Math.round(metres(s.coordinates, p.location)), found = p.displayName?.text ?? '';
      if (m > MAX_METRES) { far++; console.log(`  ✗  ${s.name}: "${found}" is ${m} m away, skipped`); continue; }
      places[s.id] = { placeId: p.id, name: found, metres: m, fetched: new Date().toISOString().slice(0, 10) };
      if (p.rating === undefined) { none++; console.log(`  –  ${s.name}: "${found}" has no rating`); continue; }
      ratings[s.id] = { rating: p.rating, ...(p.userRatingCount !== undefined && { count: p.userRatingCount }) };
      got++;
      const shared = [...words(s.name)].some(w => words(found).has(w));
      if (m > REVIEW_METRES || !shared) check.push(`${s.name} → "${found}" (${m} m)`);
      console.log(`  ✓  ${s.name}: ${p.rating} (${p.userRatingCount ?? '?'}) — "${found}", ${m} m`);
      await sleep(120);
    } catch (e) { console.error(`  !  ${s.name}: ${(e as Error).message}`); if (/403|API_KEY|PERMISSION/.test((e as Error).message)) break; }
    if (got % 20 === 0) { writeFileSync(RATINGS, JSON.stringify(ratings, null, 1) + '\n'); writeFileSync(PLACES, JSON.stringify(places, null, 1) + '\n'); }
  }
  if (dry) return;
  const sorted = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(RATINGS, JSON.stringify(sorted(ratings), null, 1) + '\n');
  writeFileSync(PLACES, JSON.stringify(sorted(places), null, 1) + '\n');
  console.log(`\n${got} rated, ${none} without a rating or place, ${far} too far from the pin.`);
  if (check.length) console.log(`Check these matches:\n  ${check.join('\n  ')}`);
}
main();
