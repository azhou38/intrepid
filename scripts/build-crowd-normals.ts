// Builds src/data/crowdNormals.json: for every destination, a 12-month relative crowding
// score (0-100) + level (1-5, the same scale utils/travelData.ts's MonthCrowd already uses) +
// confidence/tier/source metadata — see that file's block comment for the full tier model.
//
// Tier 1 — real country-level tourist-night seasonality from Eurostat (free, keyless, EU/EEA
// countries only — see scripts/eurostat.ts). Applied at country granularity: Eurostat's monthly
// dataset only has real coverage at the country level for every region code tried, not per-city,
// so this uses "this country's real monthly tourism shape" rather than a false per-destination
// precision the source doesn't support.
//
// Tier 2 — destination-specific seasonal signals (ski, cherry blossom, a specific festival, …),
// layered on top as an additive boost, via the SAME shared logic the app's own live fallback
// uses (seasonalSignalCurve/getCrowdData in utils/travelData.ts) — a destination only tags WHICH
// signals apply (src/data/destinations.ts's `seasonalTags`); the curve for each tag is defined
// once and shared by everything that carries it, so this never becomes a per-destination lookup
// table of hand-tuned curves.
//
// Tier 4 — geographic/hemisphere fallback for a country Eurostat doesn't cover.
//
// Every destination goes through the same pipeline: identify its country -> try Tier 1 -> layer
// Tier 2 on whatever base resulted -> normalize relative to its own 12 months (relativeCrowdScores
// dampens the spread for a destination that's busy/quiet year-round, so it doesn't get a fake
// Low-to-Very-High swing) -> bin into the 4 user-facing levels.
//
// Run from the project root (needs network; tsx is fetched on demand, it isn't a project dependency):
//   npx tsx scripts/build-crowd-normals.ts

import { writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { DESTINATIONS } from '../src/data/destinations';
import { fetchEurostatMonthlyNights, type EurostatMonthly } from './eurostat';
import {
  geographicCrowdCurve, seasonalSignalCurve, relativeCrowdScores, scoreToCrowdLevel,
  normalizeToMean,
} from '../src/utils/travelData';
import type { CrowdMonthMeta } from '../src/utils/travelData';

const OUT_PATH = process.env.MANIFEST_OUT ?? resolvePath(process.cwd(), 'src/data/crowdNormals.json');

async function main() {
  const entries: Record<string, { months: CrowdMonthMeta[] }> = {};

  // One Eurostat fetch per country, shared by every destination in it (Paris/Nice/Lyon all
  // reuse the single FR fetch, for example).
  const countryCache = new Map<string, EurostatMonthly | null>();
  async function tier1For(countryCode: string): Promise<EurostatMonthly | null> {
    if (!countryCache.has(countryCode)) {
      countryCache.set(countryCode, await fetchEurostatMonthlyNights(countryCode).catch(() => null));
    }
    return countryCache.get(countryCode)!;
  }

  let tier1Hits = 0, tier2Hits = 0;
  for (const d of DESTINATIONS) {
    const { latitude } = d.coordinates;
    const tier1 = await tier1For(d.countryCode);
    const tier2Curve = seasonalSignalCurve(d.seasonalTags, latitude);

    let raw: number[];
    let tier: CrowdMonthMeta['tier'];
    let confidence: CrowdMonthMeta['confidence'];
    const sources: string[] = [];

    if (tier1) {
      // Real nights-spent figures (tens of millions) need rescaling to the same small range the
      // Tier 4/2 curves live on, or a Tier 2 boost added below would be numerically invisible.
      raw = normalizeToMean(tier1.raw12);
      tier = 1;
      confidence = 'high';
      sources.push(`Eurostat tour_occ_nim — ${d.countryCode} monthly tourist nights, country-level (${tier1.yearsUsed} years since 2022)`);
      tier1Hits++;
    } else {
      raw = geographicCrowdCurve(d.continent, latitude);
      tier = 4;
      confidence = 'low';
      sources.push('Geographic/hemisphere seasonality heuristic (no country-level tourism data available)');
    }

    if (tier2Curve) {
      // Each tag's own TAG_WEIGHT (in seasonalSignalCurve) already sets how hard it pushes.
      raw = raw.map((v, i) => v + tier2Curve[i]);
      if (tier === 4) tier = 2;
      confidence = tier === 1 ? 'high' : 'medium';
      sources.push(`Destination-specific seasonal signals: ${d.seasonalTags!.map(s => s.tag).join(', ')}`);
      tier2Hits++;
    }

    const scores = relativeCrowdScores(raw);
    const months: CrowdMonthMeta[] = scores.map(score => ({
      score: Math.round(score),
      level: scoreToCrowdLevel(score),
      confidence,
      tier,
      sources,
    }));
    entries[d.id] = { months };
  }

  writeFileSync(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 1) + '\n');

  console.log(`Wrote ${DESTINATIONS.length} destinations.`);
  console.log(`Tier 1 (real Eurostat data): ${tier1Hits}/${DESTINATIONS.length}. Tier 2 signals layered on: ${tier2Hits}.`);
  for (const [cc, data] of countryCache) console.log(`  ${cc}: ${data ? `OK (${data.yearsUsed}y)` : 'no data — Tier 4 fallback'}`);
}

main().catch(e => { console.error('ABORTED — no changes written:', e); process.exit(1); });
