/**
 * Stricter spot-coordinate audit than verify-coordinates.ts. Needs network access.
 *
 *   npx tsx scripts/audit-spot-coordinates.ts [--country NZ] [--dest rotorua] [--max-m 100] [--json out.json]
 *
 * For every spot it gathers two independent references and checks the point itself:
 *   - the coordinates of the spot's Wikipedia article (looked up by the spot's name, redirects followed);
 *   - OpenStreetMap's best match for the name near the spot's destination, with its feature type;
 *   - whether the current point lies in water on the map itself (Mapbox Streets' water layer) — a spot drawn in the sea.
 * It flags a spot whose point is in water, or more than --max-m (default 100 m) from a reference. A flag is a prompt to
 * look at a map: a reference can itself be a centroid (a bay's centre is in the sea, a park's in its middle).
 */
import { readFileSync, writeFileSync } from 'fs';
import { DESTINATIONS } from '../src/data/destinations';
import { SPOTS, spotCountryCode, spotPhotoTitle } from '../src/data/spots';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
const country = arg('--country'), destFilter = arg('--dest'), jsonOut = arg('--json');
const maxM = Number(arg('--max-m') ?? 100);
const UA = { 'User-Agent': 'intrepid-coordinate-audit (azhou38/intrepid)' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const metres = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(x));
};
async function getJson(url: string, init?: RequestInit, tries = 4): Promise<any> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) } });
      if (res.status === 429 || res.status >= 500) { await sleep(5000 * (i + 1)); continue; }
      return await res.json();
    } catch { await sleep(3000 * (i + 1)); }
  }
  return null;
}

// Wikipedia coordinates for many titles at once (50 per request).
async function wikiCoords(titles: string[]): Promise<Map<string, [number, number]>> {
  const out = new Map<string, [number, number]>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=coordinates&colimit=max&titles='
      + encodeURIComponent(batch.join('|'));
    const d = await getJson(url);
    const norm = new Map<string, string>();
    for (const n of d?.query?.normalized ?? []) norm.set(n.to, n.from);
    for (const r of d?.query?.redirects ?? []) norm.set(r.to, norm.get(r.from) ?? r.from);
    for (const p of d?.query?.pages ?? []) {
      const c = p.coordinates?.[0];
      if (!c) continue;
      out.set(norm.get(p.title) ?? p.title, [c.lat, c.lon]);
    }
    await sleep(300);
  }
  return out;
}

// Water test against the same data the map draws: Mapbox Streets' `water` layer (oceans, bays, lakes, rivers) via the
// Tilequery API, using the app's public token from .env.local.
const TOKEN = (() => {
  // The environment (a cloud run) first; else the local .env.local.
  if (process.env.EXPO_PUBLIC_MAPBOX_TOKEN) return process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  try { return readFileSync('.env.local', 'utf8').match(/EXPO_PUBLIC_MAPBOX_TOKEN=(\S+)/)?.[1] ?? ''; } catch { return ''; }
})();
async function inWater(lat: number, lon: number): Promise<string | null> {
  if (!TOKEN) return null;
  const d = await getJson(`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${lon},${lat}.json?layers=water&radius=0&limit=1&access_token=${TOKEN}`);
  return d?.features?.length ? 'Mapbox water' : null;
}

async function main() {
  const spots = SPOTS.filter(s => (!country || spotCountryCode(s) === country) && (!destFilter || s.destinationId === destFilter));
  const wiki = await wikiCoords([...new Set(spots.map(spotPhotoTitle))]);
  const rows: any[] = [];
  let flagged = 0;
  for (const s of spots) {
    const cur: [number, number] = [s.coordinates.latitude, s.coordinates.longitude];
    const dest = DESTINATIONS.find(d => d.id === s.destinationId);
    const c = dest?.coordinates ?? s.coordinates;
    const vb = `&viewbox=${c.longitude - 0.6},${c.latitude + 0.6},${c.longitude + 0.6},${c.latitude - 0.6}&bounded=1`;
    const hits = await getJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&q=${encodeURIComponent(s.name)}${vb}`) ?? [];
    await sleep(1100);
    const water = await inWater(cur[0], cur[1]);
    const w = wiki.get(spotPhotoTitle(s));
    const o = hits[0];
    const osm: [number, number] | undefined = o ? [Number(o.lat), Number(o.lon)] : undefined;
    const row = {
      id: s.id, name: s.name, cur, water,
      wiki: w, wikiM: w ? Math.round(metres(cur, w)) : null,
      osm, osmM: osm ? Math.round(metres(cur, osm)) : null, osmType: o ? `${o.category ?? o.class}/${o.type}` : null, osmName: o?.name ?? null,
    };
    rows.push(row);
    const problems: string[] = [];
    if (water) problems.push(`point is inside water (${water})`);
    if (row.wikiM !== null && row.wikiM > maxM) problems.push(`Wikipedia: ${row.wikiM} m away at ${w![0].toFixed(5)}, ${w![1].toFixed(5)}`);
    if (row.osmM !== null && row.osmM > maxM) problems.push(`OSM ${row.osmType} "${row.osmName}": ${row.osmM} m away at ${osm![0].toFixed(5)}, ${osm![1].toFixed(5)}`);
    if (problems.length) { flagged++; console.log(`${s.id}  ${s.name}\n  ${problems.join('\n  ')}`); }
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
  console.log(`${flagged} of ${spots.length} spot(s) flagged`);
}
main();
