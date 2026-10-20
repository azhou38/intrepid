// Quill's tiering (PIPELINES.md → "Cost and speed"): scale effort to the spot. A beach, lookout, roadside icon or monument is
// almost always "free, open any time"; those need no researcher, only a one-line bio. Anything that may charge, keep hours or
// have an official page (a museum, tour, zoo, cave, garden, winery, national park, a place inside a fee-charging park) goes to the
// full researcher → writer → fact-checker chain, where hours, price and link errors actually appeared.
//
//   npx tsx scripts/curation/tier-spots.ts --file spots.json --out tiers.json
//   npx tsx scripts/curation/tier-spots.ts --ids sydney-12,hay --out tiers.json     (existing spots, to calibrate)
//
// Input: [{ id, name, category, note? }] (note: the source text the enumerator kept; a mention of a fee or a park routes it
// to the full chain). Output: { simple: [{ id, facts }], timed: [{ id, reason }] }, plus the sample for the audit: every 8th
// simple spot (at least 5) is also sent through the full chain, and if any of those comes back different from its default
// facts, the whole simple tier is rerun through the full chain (the defaults do not fit this region).
import { readFileSync, writeFileSync } from 'node:fs';
import { SPOTS } from '../../src/data/spots';

const args = process.argv.slice(2);
const one = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
type In = { id: string; name: string; category: string; note?: string };
let input: In[];
if (one('--file')) input = JSON.parse(readFileSync(one('--file')!, 'utf8'));
else if (one('--ids')) input = one('--ids')!.split(',').map(id => { const s = SPOTS.find(x => x.id === id)!; return { id, name: s.name, category: s.category, note: s.bio }; });
else { console.error('usage: tier-spots.ts (--file spots.json | --ids a,b) --out tiers.json'); process.exit(1); }

const SIMPLE_CATEGORIES = new Set(['beach', 'viewpoint', 'landmark', 'monument']);
// Name cues that mean it may charge, keep hours, or have its own site: full chain.
const NEEDS_RESEARCH = /national park|conservation|state forest|garden|park\b|reserve|falls|gorge|walk|track|trail|zoo|aquarium|museum|gallery|cave|tour|cruise|winery|vineyard|distillery|brewery|observatory|railway|gaol|jail|resort|farm|centre|center|house|castle|fort |lighthouse|cellar|experience|tower|island|mine|market|baths|pool|pier|wharf|jetty|cemetery|station|hall|school|dam|lake|river|reef|circuit|sculpture|guitar|memorial|anzac/i;
// Text cues that it is inside, or run by, something that charges.
const FEE_TEXT = /\b(national park|state conservation|fee|fees|entry|admission|permit|ticket|tolls?|\$\d|booking|book ahead|guided)\b/i;
const VISIT: Record<string, [number, number]> = { beach: [1, 3], viewpoint: [0, 0.5], landmark: [0, 0.25], monument: [0, 0.5] };

const simple: any[] = [], timed: any[] = [];
for (const e of input) {
  const why = !SIMPLE_CATEGORIES.has(e.category) ? `category ${e.category} may charge or keep hours`
    : NEEDS_RESEARCH.test(e.name) ? 'name suggests an operator, park or ticketed site'
    : FEE_TEXT.test(`${e.note ?? ''}`) ? 'its source text mentions a fee, a park or a booking' : null;
  if (why) { timed.push({ id: e.id, reason: why }); continue; }
  const [min, max] = VISIT[e.category];
  simple.push({ id: e.id, facts: { hours: e.category === 'landmark' ? 'Visible from the road at any time' : 'Open 24 hours', visitHoursMin: min, visitHoursMax: max, free: true, basis: 'default for a free, open-access place; no ticketUrl (no single steward)' } });
}
const step = Math.max(1, Math.min(8, Math.floor(simple.length / 5)));
const audit = simple.filter((_, i) => i % step === 0).map(s => s.id);
if (one('--out')) writeFileSync(one('--out')!, JSON.stringify({ simple, timed, audit }, null, 1) + '\n');
console.log(`${input.length} spots: ${simple.length} simple (bio only), ${timed.length} full chain; ${audit.length} simple spots also go through the full chain as the audit`);
