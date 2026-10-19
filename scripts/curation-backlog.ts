// Ranks destinations for the curation pipelines, weakest first (PIPELINES.md → "Backlog order"), and prints the next
// batch of 5 for a pipeline run to take.
//
//   npx tsx scripts/curation-backlog.ts [--country NZ] [--batch 5] [--skip id,id] [--prefilter out.json] [--json out.json]
//
// Regions first (COVERAGE.md → "Finding what is missing"): for a country listed in scripts/coverage-regions.json it prints
// each region's spots inside destinations vs standalone, whether the region has had a region pass (a committed
// curation/<branch>/region-<id>/fairness.json), and any destination or standalone spot not assigned to a region. A region
// with no pass is ahead of every destination in the backlog, since its in-between land has never been searched.
//
// Data-only signals (no network): spots per destination, a header still in HEADER_REVIEW_BACKLOG, why-visit photos
// missing, paid spots with no official site (`ticketUrl`), spots that look standalone-by-mistake. With --prefilter (the
// --json output of scripts/photo-prefilter.ts) a photo that fails the pre-filter adds to its destination's score.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DESTINATIONS } from '../src/data/destinations';
import { SPOTS } from '../src/data/spots';
import { HEADER_REVIEW_BACKLOG } from './destination-header-policy';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
const country = arg('--country'), batch = Number(arg('--batch') ?? 5), skip = new Set((arg('--skip') ?? '').split(',').filter(Boolean));
const prefilterPath = arg('--prefilter'), jsonOut = arg('--json');

interface Fail { key: string; file: string; role: string; reasons: string[]; review?: string[] }
const fails: Fail[] = prefilterPath ? JSON.parse(readFileSync(prefilterPath, 'utf8')).fails : [];
const spotKeys = new Map<string, string[]>();                 // photo key → destination ids that use it
for (const s of SPOTS) {
  const id = s.destinationId; if (!id) continue;
  for (const k of [s.wiki ?? s.name]) spotKeys.set(k, [...(spotKeys.get(k) ?? []), id]);
}

// Regions: coverage status and the in-destination / standalone split.
type Region = { id: string; name: string; destinations: string[]; standalone: string[] };
const regionsByCountry: Record<string, Region[]> = existsSync('scripts/coverage-regions.json')
  ? JSON.parse(readFileSync('scripts/coverage-regions.json', 'utf8')) : {};
const passed = new Set<string>();
if (existsSync('curation')) for (const branch of readdirSync('curation')) {
  if (!existsSync(`curation/${branch}`) || branch.startsWith('.')) continue;
  for (const dir of readdirSync(`curation/${branch}`)) if (dir.startsWith('region-') && existsSync(`curation/${branch}/${dir}/fairness.json`)) passed.add(dir.slice(7));
}
for (const [cc, regions] of Object.entries(regionsByCountry)) {
  if (cc.startsWith('_') || (country && cc !== country)) continue;
  const destIds = new Set(DESTINATIONS.filter(d => d.countryCode === cc).map(d => d.id));
  const standaloneIds = new Set(SPOTS.filter(s => !s.destinationId && s.countryCode === cc).map(s => s.id));
  const assigned = new Set(regions.flatMap(r => [...r.destinations, ...r.standalone]));
  console.log(`Coverage regions, ${cc} (${regions.filter(r => passed.has(r.id)).length} of ${regions.length} have had a region pass):`);
  for (const r of [...regions].sort((a, b) => Number(passed.has(a.id)) - Number(passed.has(b.id)))) {
    const inDest = SPOTS.filter(s => s.destinationId && r.destinations.includes(s.destinationId)).length;
    console.log(`  ${passed.has(r.id) ? 'done   ' : 'NO PASS'}  ${r.name}: ${inDest} spots in ${r.destinations.length} destinations, ${r.standalone.length} standalone`);
  }
  const loose = [...destIds, ...standaloneIds].filter(id => !assigned.has(id));
  if (loose.length) console.log(`  Not assigned to a region (add to scripts/coverage-regions.json): ${loose.join(', ')}`);
  console.log('');
}

const rows = DESTINATIONS.filter(d => !country || d.countryCode === country).map(d => {
  const spots = SPOTS.filter(s => s.destinationId === d.id);
  const why = d.whyVisitPhotos ?? [];
  const reasons: string[] = [];
  let score = 0;
  const add = (pts: number, why: string) => { score += pts; reasons.push(why); };
  if (HEADER_REVIEW_BACKLOG.has(d.id)) add(5, 'header never curated');
  if (why.length < 2 || why.length !== (d.whyVisit?.length ?? 0)) add(4, 'missing why-visit photos');
  if (spots.length < 3) add(3, `only ${spots.length} spot(s)`);
  const paidNoLink = spots.filter(s => s.costMin !== undefined && !s.ticketUrl);
  if (paidNoLink.length) add(Math.min(3, paidNoLink.length), `${paidNoLink.length} paid spot(s) with no official site`);
  for (const f of fails) {
    const mine = f.key === d.name || (f.key.startsWith('File:') && why.includes(f.key.slice(5))) || (spotKeys.get(f.key) ?? []).includes(d.id);
    if (!mine) continue;
    if (f.reasons.length) add(f.role === 'spot' ? 1 : 3, `${f.role} photo fails pre-filter: ${f.reasons[0]}`);
    else if (f.review?.length) add(f.role === 'spot' ? 0.5 : 1, `${f.role} photo to review: ${f.review[0]}`);
  }
  return { id: d.id, name: d.name, country: d.countryCode, rank: d.rank, spots: spots.length, score, reasons };
}).sort((a, b) => b.score - a.score || (a.rank ?? 9) - (b.rank ?? 9) || a.name.localeCompare(b.name));

const next = rows.filter(r => r.score > 0 && !skip.has(r.id)).slice(0, batch);
console.log(`Next batch (${next.length}):`);
for (const r of next) console.log(`  ${r.name} (${r.id}) score ${r.score} — ${r.reasons.join('; ')}`);
console.log(`\n${rows.filter(r => r.score > 0).length} of ${rows.length} destinations need work. Top 25:`);
for (const r of rows.slice(0, 25)) console.log(`  ${String(r.score).padStart(2)}  ${r.name} (${r.country}) — ${r.reasons.join('; ') || 'ok'}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ next, rows }, null, 1));
