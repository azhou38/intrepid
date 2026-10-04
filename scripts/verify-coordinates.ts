/**
 * Sanity-checks spot coordinates against OpenStreetMap (Nominatim). Needs network access.
 *
 *   npx tsx scripts/verify-coordinates.ts [--country NZ] [--dest queenstown] [--max-km 1] [--fix]
 *
 * For each spot it (1) reverse-geocodes the coordinate at building zoom and reports points OSM places in the sea
 * (no result) and (2) searches OSM for the spot's name near its destination and reports a hit more than --max-km
 * (default 1) away. With --fix, a name hit is written back to src/data/spots.ts. A flag is a prompt to look at a map,
 * not proof: OSM may name a place differently, so review each --fix diff before committing.
 */
import { readFileSync, writeFileSync } from 'fs';
import { DESTINATIONS } from '../src/data/destinations';
import { SPOTS, spotCountryCode } from '../src/data/spots';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
const country = arg('--country'), destFilter = arg('--dest');
const maxKm = Number(arg('--max-km') ?? 1), fix = process.argv.includes('--fix');
const UA = { 'User-Agent': 'intrepid-coordinate-check (azhou38/intrepid)' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const km = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const get = async (url: string) => (await fetch(url, { headers: UA })).json() as Promise<any>;

async function main() {
  let src = readFileSync('src/data/spots.ts', 'utf8');
  let flagged = 0;
  for (const s of SPOTS) {
    if (country && spotCountryCode(s) !== country) continue;
    if (destFilter && s.destinationId !== destFilter) continue;
    const { latitude: lat, longitude: lon } = s.coordinates;
    const rev = await get(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lon}`);
    await sleep(1100);
    const dest = DESTINATIONS.find(d => d.id === s.destinationId);
    const near = dest ? `&viewbox=${dest.coordinates.longitude - 1},${dest.coordinates.latitude + 1},${dest.coordinates.longitude + 1},${dest.coordinates.latitude - 1}&bounded=0` : '';
    const hits = await get(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(s.name)}${near}`);
    await sleep(1100);
    const problems: string[] = [];
    if (rev.error) problems.push('no OSM feature at this point (in the sea?)');
    const hit = hits[0] && [Number(hits[0].lat), Number(hits[0].lon)] as [number, number];
    const off = hit ? km([lat, lon], hit) : 0;
    if (hit && off > maxKm) problems.push(`OSM places "${hits[0].display_name.split(',')[0]}" ${off.toFixed(1)} km away at ${hit[0].toFixed(4)}, ${hit[1].toFixed(4)}`);
    if (!problems.length) continue;
    flagged++;
    console.log(`${s.id}  ${s.name}\n  ${problems.join('\n  ')}`);
    if (fix && hit && off > maxKm) {
      const from = `latitude: ${lat.toFixed(4)}, longitude: ${lon.toFixed(4)}`;
      const to = `latitude: ${hit[0].toFixed(4)}, longitude: ${hit[1].toFixed(4)}`;
      if (src.includes(from)) { src = src.replace(from, to); console.log('  fixed'); }
    }
  }
  if (fix) writeFileSync('src/data/spots.ts', src);
  console.log(`${flagged} spot(s) flagged`);
}
main();
