// Atlas step 1's mechanical half (COVERAGE.md → "Finding what is missing", step 2): fills in, for every candidate in a
// region's candidates.json, what a script can look up so the enumerator agent doesn't spend its budget on it.
//
//   npx tsx scripts/curation/score-candidates.ts curation/<branch>/region-<id>/candidates.json
//
// Per candidate (by its `wiki` title, else `name`), written back in place:
//   views          English Wikipedia page views over the last 12 full months (0 with no article)
//   redirect_to    set when the title only redirects; COVERAGE.md counts that as 0 views when the target is a broader
//                  article — `views` here is the target's, so the agent zeroes it when the target is broader
//   existing_spot_by_proximity true when the existing_spot match is by 300 m distance only (judge it as a new place unless it really is the same)
//   disambiguation true when the title is a disambiguation page (the agent must pick the right article)
//   coordinates    from Wikipedia when the candidate has none ({ lat, lng }), with coordinates_source
//   existing_spot  the id of a spot already in the app with the same name within 50 km (or the same Wikipedia title), or within 300 m
// Fetches go through the shared cache (http-cache.ts), so a rerun is nearly free. Accepts either an array of candidates
// or an object with a `candidates` array.
import { readFileSync, writeFileSync } from 'node:fs';
import { cachedJson } from './http-cache';
import { SPOTS } from '../../src/data/spots';

const file = process.argv[2];
if (!file) { console.error('usage: score-candidates.ts <candidates.json>'); process.exit(1); }

type C = Record<string, any> & { name: string; wiki?: string };
const raw = JSON.parse(readFileSync(file, 'utf8'));
const list: C[] = Array.isArray(raw) ? raw : raw.candidates;

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const coordOf = (c: C): { lat: number; lng: number } | null => {
  const k = c.coordinates;
  if (!k) return null;
  const lat = k.lat ?? k.latitude, lng = k.lng ?? k.longitude;
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
};

// Last 12 full months, as the pageviews API wants them (YYYYMMDD00).
const now = new Date();
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}00`;

async function lookup(title: string) {
  const q = `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=coordinates|pageprops&ppprop=disambiguation&titles=${encodeURIComponent(title)}`;
  const d = await cachedJson<any>(q, 30);
  const page: any = d ? Object.values(d.query?.pages ?? {})[0] : null;
  if (!page || page.missing !== undefined) return null;
  const redirect = d.query?.redirects?.[0]?.to as string | undefined;
  const co = page.coordinates?.[0];
  return { title: page.title as string, redirect, disambiguation: !!page.pageprops && 'disambiguation' in page.pageprops, coords: co ? { lat: co.lat, lng: co.lon } : null };
}
async function views(title: string): Promise<number> {
  const u = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${ymd(start)}/${ymd(end)}`;
  const d = await cachedJson<any>(u, 30);
  return d?.items ? d.items.reduce((s: number, it: any) => s + (it.views ?? 0), 0) : 0;
}

(async () => {
  // Names repeat across the world (Chinatown, Castle Rock, Rainbow Valley): a match by name counts only within NAME_MATCH_KM of
  // the candidate, and without the candidate's coordinates only by its exact Wikipedia title (which names one place).
  const NAME_MATCH_KM = 50;
  const byName = new Map<string, typeof SPOTS>();
  const byWiki = new Map<string, string>();
  for (const sp of SPOTS) {
    for (const k of [norm(sp.name), ...(sp.wiki ? [norm(sp.wiki)] : [])]) byName.set(k, [...(byName.get(k) ?? []), sp]);
    byWiki.set(norm(sp.wiki ?? sp.name), sp.id);
  }
  const nameMatch = (c: any, here: { lat: number; lng: number } | null): string | undefined => {
    if (c.wiki && byWiki.has(norm(c.wiki)) && norm(c.wiki) !== norm(c.name)) return byWiki.get(norm(c.wiki));
    if (!here) return undefined;
    const near = (byName.get(norm(c.name)) ?? []).concat(c.wiki ? byName.get(norm(c.wiki)) ?? [] : [])
      .filter(sp => km(here, { lat: sp.coordinates.latitude, lng: sp.coordinates.longitude }) <= NAME_MATCH_KM);
    return near[0]?.id;
  };
  let n = 0;
  for (const c of list) {
    n++;
    const title = c.wiki || c.name;
    const info = await lookup(title);
    if (info) {
      c.views = await views(info.title);
      if (info.redirect && norm(info.redirect) !== norm(title)) c.redirect_to = info.redirect; else delete c.redirect_to;
      if (info.disambiguation) c.disambiguation = true; else delete c.disambiguation;   // a flag from an earlier run must not outlive a corrected title
      if (!coordOf(c) && info.coords) { c.coordinates = info.coords; c.coordinates_source = `wikipedia:${info.title}`; }
    } else {
      c.views = 0; delete c.disambiguation;
    }
    const here = coordOf(c);
    const named = nameMatch(c, here);
    const match = named
      ?? (here ? SPOTS.find(sp => km(here, { lat: sp.coordinates.latitude, lng: sp.coordinates.longitude }) < 0.3)?.id : undefined);
    if (match) {
      c.existing_spot = match;
      // A match by name is the same place; one by distance alone is only a pointer (the placement runs found many wrong ones).
      const byNm = named !== undefined;
      if (byNm) delete c.existing_spot_by_proximity; else c.existing_spot_by_proximity = true;
    } else { delete c.existing_spot; delete c.existing_spot_by_proximity; }
    if (n % 25 === 0) console.error(`… ${n}/${list.length}`);
  }
  writeFileSync(file, JSON.stringify(raw, null, 1) + '\n');
  const existing = list.filter(c => c.existing_spot).length;
  const noCoords = list.filter(c => !coordOf(c)).length;
  console.log(`scored ${list.length} candidates: ${existing} already in the app, ${noCoords} still without coordinates, ${list.filter(c => c.redirect_to).length} redirects, ${list.filter(c => c.disambiguation).length} disambiguation pages`);
})();
