// Builds src/data/climateNormals.json: real monthly temperature/rainfall normals for every
// destination, precomputed ahead of time so the app never has to fetch them live.
//
// Sourced entirely from Meteostat's ground weather stations (see scripts/meteostat.ts), not
// reanalysis: for each destination this walks outward from its coordinates, station by station,
// until it finds one with enough recent monthly history to average into a trustworthy normal —
// Meteostat's own precomputed "normals" files only cover a small fraction of stations, so this
// aggregates the raw monthly observations itself instead of depending on those.
//
// Run from the project root (needs network; tsx is fetched on demand, it isn't a project dependency):
//   npx tsx scripts/build-climate-normals.ts
//
// Re-run it after adding a destination or changing one's coordinates. Existing bundled entries
// are reused unless FORCE=1 is set, so a partial run (or one that hit a rate limit) can be
// safely repeated without re-fetching everything.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { DESTINATIONS } from '../src/data/destinations';
import { fetchStationsLite, fetchStationMonthly, haversineKm, type MonthlyRow } from './meteostat';
import { CLIMATE_WINDOW_YEARS, type ClimateNormals } from '../src/utils/climateNormalsFetch';

// Only rows from the last CLIMATE_WINDOW_YEARS are averaged — old records from a station's early
// decades (some go back to the 1920s) would otherwise pull the "normal" away from the climate a
// traveler actually encounters today. A month needs at least MIN_*_SAMPLES readings within that
// window to count; below that a single unusual year could pass as the norm.
const MIN_TEMP_SAMPLES = 3;
const MIN_RAIN_SAMPLES = 2;
const REQUEST_GAP_MS = 150;       // between station fetches — a static CDN, but still paced
const MAX_CANDIDATES = 40;        // stations tried per destination before giving up entirely
const OUT_PATH = process.env.MANIFEST_OUT ?? resolvePath(process.cwd(), 'src/data/climateNormals.json');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Source { station: string; stationId: string; distanceKm: number }
interface Bundle {
  generatedAt: string | null;
  source: string;
  entries: Record<string, ClimateNormals>;
  sources: Record<string, Source>;
}

function loadExisting(): Bundle {
  try {
    const parsed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
    if (parsed?.entries) return { sources: {}, ...parsed } as Bundle;
  } catch {}
  return { generatedAt: null, source: 'meteostat', entries: {}, sources: {} };
}

// Averages one station's monthly rows into ClimateNormals, or null if too many months fall
// short of the minimum sample count — this is what "the nearest station has data, but not
// enough of it" looks like, and it should fall through to the next-nearest station rather than
// publish a normal built from one or two lucky years.
function aggregate(rows: MonthlyRow[]): ClimateNormals | null {
  const lastFullYear = new Date().getFullYear() - 1;
  const cutoff = lastFullYear - CLIMATE_WINDOW_YEARS + 1;
  const recent = rows.filter(r => r.year >= cutoff && r.year <= lastFullYear);

  const tempC: number[] = [], tempLowC: number[] = [], rainMm: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const monthRows = recent.filter(r => r.month === m);
    const highs = monthRows.map(r => r.tmax).filter((v): v is number => v != null);
    const lows  = monthRows.map(r => r.tmin).filter((v): v is number => v != null);
    const rains = monthRows.map(r => r.prcp).filter((v): v is number => v != null);
    if (highs.length < MIN_TEMP_SAMPLES || lows.length < MIN_TEMP_SAMPLES || rains.length < MIN_RAIN_SAMPLES) {
      return null;
    }
    const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
    const median = (ns: number[]) => {
      const s = [...ns].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };
    tempC.push(mean(highs));
    tempLowC.push(mean(lows));
    // Median, not mean: rainfall is right-skewed (an occasional extreme storm month, never an
    // equivalent extreme-dry month to balance it), so a plain mean over a short sample lets one
    // freak year (e.g. Kyoto's August 2014/2021, both real, documented extreme rain events)
    // erase a real climatological dip. Median asks what a normal year looks like instead.
    rainMm.push(median(rains));
  }
  return { tempC, tempLowC, rainMm };
}

async function main() {
  const started = Date.now();
  const force = process.env.FORCE === '1';
  const existing = loadExisting();
  const entries: Record<string, ClimateNormals> = force ? {} : { ...existing.entries };
  const sources: Record<string, Source> = force ? {} : { ...existing.sources };

  const todo = DESTINATIONS.filter(d => force || !entries[d.id]);
  console.log(`${DESTINATIONS.length} destinations, ${todo.length} to fetch (${DESTINATIONS.length - todo.length} already cached from a prior run).`);
  if (todo.length === 0) return;

  console.log('Fetching Meteostat station list…');
  const stations = await fetchStationsLite();
  console.log(`${stations.length} stations loaded.`);

  // A station's monthly file is the same regardless of which destination asks for it — cache
  // hits/misses across the whole run instead of re-downloading a shared nearby station.
  const monthlyCache = new Map<string, MonthlyRow[] | null>();
  async function monthlyFor(stationId: string): Promise<MonthlyRow[] | null> {
    if (monthlyCache.has(stationId)) return monthlyCache.get(stationId)!;
    await sleep(REQUEST_GAP_MS);
    let rows: MonthlyRow[] | null = null;
    for (let attempt = 0; attempt < 3 && rows == null; attempt++) {
      if (attempt > 0) await sleep(1000 * attempt);
      try { rows = await fetchStationMonthly(stationId); } catch { rows = null; }
    }
    monthlyCache.set(stationId, rows);
    return rows;
  }

  const failed: string[] = [];
  for (let i = 0; i < todo.length; i++) {
    const d = todo[i];
    const ranked = stations
      .map(s => ({ s, d: haversineKm(d.coordinates.latitude, d.coordinates.longitude, s.lat, s.lon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_CANDIDATES);

    let found: ClimateNormals | null = null;
    let usedStation: { s: (typeof ranked)[number]['s']; d: number } | null = null;
    for (const cand of ranked) {
      const rows = await monthlyFor(cand.s.id);
      if (!rows) continue;
      const normals = aggregate(rows);
      if (normals) { found = normals; usedStation = { s: cand.s, d: cand.d }; break; }
    }

    if (found && usedStation) {
      entries[d.id] = found;
      sources[d.id] = { station: usedStation.s.name, stationId: usedStation.s.id, distanceKm: Math.round(usedStation.d) };
    } else {
      failed.push(d.id);
    }

    if ((i + 1) % 5 === 0 || i === todo.length - 1) {
      const note = usedStation ? `${usedStation.s.name} (${Math.round(usedStation.d)}km)` : 'NO STATION FOUND';
      console.log(`  ${i + 1}/${todo.length} ${d.id} -> ${note}`);
    }
  }

  writeFileSync(
    OUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), source: 'meteostat', entries, sources }, null, 1) + '\n',
  );
  console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)}s. Wrote ${Object.keys(entries).length}/${DESTINATIONS.length} entries.`);
  if (failed.length) console.log(`No usable station within ${MAX_CANDIDATES} nearest candidates: ${failed.length}`, failed);
}

main().catch(e => { console.error('ABORTED — no changes written:', e); process.exit(1); });
