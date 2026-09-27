// Eurostat's free REST API (SDMX-JSON), no API key, no rate-limit registration. Pure Node,
// script-only.
//
// The dataset used is tour_occ_nim ("Nights spent at tourist accommodation establishments —
// monthly data"). A NUTS2 regional geo code (e.g. FR10 for Île-de-France/Paris) was tried first,
// hoping for city-level precision, but returned an empty series for every region tested — this
// specific monthly dataset only has real coverage at the COUNTRY level. Rather than fabricate
// regional precision the source doesn't actually have, this uses "the whole country's real
// monthly tourism shape" as the Tier 1 signal, applied to every destination in that country.

const BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tour_occ_nim';

// Eurostat's own geo codes differ from ISO 3166-1 alpha-2 for exactly these two.
const EUROSTAT_GEO_OVERRIDE: Record<string, string> = { GR: 'EL', GB: 'UK' };

// 2022 onward only: 2020–2021 tourism was collapsed by the pandemic and would badly distort a
// "typical" seasonal shape rather than represent one.
const SINCE = '2022-01';

export interface EurostatMonthly {
  raw12: number[];   // Jan..Dec, averaged across every complete year available since SINCE
  yearsUsed: number;
}

/** Real country-level monthly tourist-nights seasonality, or null if Eurostat has no usable
 *  series for this country (non-EU/EEA, or one that doesn't report to this dataset). */
export async function fetchEurostatMonthlyNights(countryCode: string): Promise<EurostatMonthly | null> {
  const geo = EUROSTAT_GEO_OVERRIDE[countryCode] ?? countryCode;
  const url = `${BASE}?format=JSON&unit=NR&c_resid=TOTAL&nace_r2=I551-I553&lang=EN&geo=${geo}&sinceTimePeriod=${SINCE}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();

  const geoIndex = data?.dimension?.geo?.category?.index ?? {};
  if (!(geo in geoIndex)) return null;   // Eurostat has no series at all for this geo code

  const timeIndex: Record<string, number> = data?.dimension?.time?.category?.index ?? {};
  const values: Record<string, number> = data?.value ?? {};
  if (Object.keys(values).length === 0) return null;

  // Every dimension except time (freq, c_resid, unit, nace_r2, geo) is pinned to exactly one
  // value by the query params above, so JSON-stat's flat row-major `value` map is effectively
  // keyed by the time dimension alone — its index IS the flat index.
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (const [timeLabel, timeIdx] of Object.entries(timeIndex)) {
    const v = values[String(timeIdx)];
    if (v == null) continue;
    const month = Number(timeLabel.slice(5, 7)) - 1;
    if (month < 0 || month > 11) continue;
    byMonth[month].push(v);
  }
  // Every month needs at least 2 distinct years, or a single year's quirk could pass as normal.
  if (byMonth.some(m => m.length < 2)) return null;

  const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
  return { raw12: byMonth.map(mean), yearsUsed: Math.min(...byMonth.map(m => m.length)) };
}
