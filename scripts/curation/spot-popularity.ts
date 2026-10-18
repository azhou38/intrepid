// Builds src/data/spotPopularity.json: how popular each spot is, as the English Wikipedia page views of its own article over
// the last 12 full months (0 when it has no article of its own: a title that only redirects to a broader article, such as a
// beach redirecting to its suburb, scores 0 as in COVERAGE.md, since those views belong to the broader place). The
// destination sheet's "Popular Spots" row reads it (src/data/popularSpots.ts) to decide how many spots to show.
//
//   npx tsx scripts/curation/spot-popularity.ts [--dest <id>] [--refresh]
//
// Only spots missing from the file are fetched (a rerun after adding spots costs just the new ones); --refresh recomputes
// everything. Fetches go through the shared cache (http-cache.ts). Needs network access.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cachedJson } from './http-cache';
import { SPOTS, spotPhotoTitle } from '../../src/data/spots';

const args = process.argv.slice(2);
const destArg = args.includes('--dest') ? args[args.indexOf('--dest') + 1] : undefined;
const refresh = args.includes('--refresh');
const OUT = 'src/data/spotPopularity.json';
const book: Record<string, number> = !refresh && existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

const now = new Date();
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}00`;
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function viewsFor(title: string): Promise<number> {
  const q = `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=disambiguation&titles=${encodeURIComponent(title)}`;
  const d = await cachedJson<any>(q, 30);
  const page: any = d ? Object.values(d.query?.pages ?? {})[0] : null;
  if (!page || page.missing !== undefined) return 0;
  if (page.pageprops && 'disambiguation' in page.pageprops) return 0;
  const to = d.query?.redirects?.[0]?.to as string | undefined;
  if (to && norm(to) !== norm(title)) return 0;   // redirects to a different article: not its own views
  const u = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(page.title.replace(/ /g, '_'))}/monthly/${ymd(start)}/${ymd(end)}`;
  const v = await cachedJson<any>(u, 30);
  return v?.items ? v.items.reduce((s: number, it: any) => s + (it.views ?? 0), 0) : 0;
}

(async () => {
  const todo = SPOTS.filter(s => (!destArg || s.destinationId === destArg) && book[s.id] === undefined);
  let n = 0;
  for (const s of todo) {
    book[s.id] = await viewsFor(spotPhotoTitle(s));
    if (++n % 25 === 0) { console.error(`… ${n}/${todo.length}`); writeFileSync(OUT, JSON.stringify(book)); }
  }
  const sorted = Object.fromEntries(Object.entries(book).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`fetched ${todo.length} spots; ${Object.keys(sorted).length} in ${OUT}`);
})();
