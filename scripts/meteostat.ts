// Meteostat bulk data helpers — pure Node, script-only (uses zlib/fetch directly, no RN
// dependency and no API key: https://bulk.meteostat.net publishes static per-station files).
//
// Meteostat's own precomputed "normals" files (v2/normals/{id}.csv.gz) turned out to exist for
// only a small fraction of stations — most candidates 404 even when the station list's own
// `inventory.normals` entry claims otherwise. The monthly observations (v2/monthly/{id}.csv.gz)
// have far better coverage, so normals are built here by averaging recent months ourselves,
// the same shape as the old ERA5 aggregation but from real station readings instead of a
// reanalysis model.

import { gunzipSync } from 'node:zlib';

export interface StationMeta {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface MonthlyRow {
  year: number;
  month: number;   // 1-12
  tavg: number | null;
  tmin: number | null;
  tmax: number | null;
  prcp: number | null;
}

const UA = 'IntrepidApp-ClimateNormals/1.0 (personal hobby project)';

async function fetchGunzipped(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    return gunzipSync(buf).toString('utf8');
  } catch {
    return null;
  }
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** The full (~16k) station list, each with just what's needed to find the nearest one. */
export async function fetchStationsLite(): Promise<StationMeta[]> {
  const text = await fetchGunzipped('https://bulk.meteostat.net/v2/stations/lite.json.gz');
  if (!text) throw new Error('Could not fetch Meteostat station list');
  const raw = JSON.parse(text) as any[];
  return raw
    .filter(s => s?.location?.latitude != null && s?.location?.longitude != null)
    .map(s => ({ id: s.id, name: s.name?.en ?? s.id, lat: s.location.latitude, lon: s.location.longitude }));
}

const num = (s: string) => (s === '' ? null : Number(s));

/** A station's full monthly history, or null if this station has no monthly file at all. */
export async function fetchStationMonthly(stationId: string): Promise<MonthlyRow[] | null> {
  const text = await fetchGunzipped(`https://bulk.meteostat.net/v2/monthly/${stationId}.csv.gz`);
  if (!text) return null;
  return text.trim().split('\n').filter(Boolean).map(line => {
    const [year, month, tavg, tmin, tmax, prcp] = line.split(',');
    return { year: Number(year), month: Number(month), tavg: num(tavg), tmin: num(tmin), tmax: num(tmax), prcp: num(prcp) };
  });
}
