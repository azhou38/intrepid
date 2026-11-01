// Atlas's destination skeptic, step 1: the scripted pre-screen (COVERAGE.md → "Checking destinations"; PIPELINES.md →
// "Destination skeptic"). It reads the app's data and the Atlas files already in curation/, so the skeptic agent judges
// only the doubtful destinations, from a short evidence bundle, instead of researching every destination from scratch.
//
//   npx tsx scripts/curation/destination-prescreen.ts --out <dir> [--country NZ] [--ids a,b] [--offline] [--all]
//   npx tsx scripts/curation/destination-prescreen.ts --check-new <placement.json>     overlap check for proposed new destinations
//   npx tsx scripts/curation/destination-prescreen.ts --list-overlaps                  every existing overlapping pair
//
// --out writes:
//   prescreen.json         every destination: group (exempt | pass | flag | decided), the reasons, the signals
//   bundles/batch-NN.json  the flagged destinations' evidence, about 25 per batch: what the skeptic agent reads
//   audit.json             a deterministic ~10% sample of the "pass" group, without its group or reasons, re-decided blind
// Groups: exempt = rank 1–2 (COVERAGE.md's headline exemption); decided = a verdict in destination-verdicts.json whose
// destination has not changed since (--all re-checks them); flag = any reason below; pass = none.
// Signals: spots, rank, Wikivoyage page under its own name (cached fetch; --offline skips it), the strongest spot by counted
// sources and page views from the region files in curation/, and overlap with a neighbour (see overlapsWith).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DESTINATIONS } from '../../src/data/destinations';
import { SPOTS } from '../../src/data/spots';
import { cachedJson } from './http-cache';

const args = process.argv.slice(2);
const opt = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const has = (f: string) => args.includes(f);

type Dest = typeof DESTINATIONS[number];
type LatLon = { latitude: number; longitude: number };
const km = (a: LatLon, b: LatLon) => {
  const r = (x: number) => x * Math.PI / 180;
  const h = Math.sin(r(b.latitude - a.latitude) / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const spotsOf = (id: string) => SPOTS.filter(s => s.destinationId === id);

// Overlap (COVERAGE.md → "No overlapping destinations"): two destinations overlap when their centres are closer than
// three-quarters of the larger one's map radius (half its defaultZoomSpanKm). The one that gives way and merges is the lower
// ranked (the higher rank number); on a tie, the one with fewer spots; then the one with the smaller span. Existing pairs are
// listed in destination-overlaps-grandfathered.json and never flagged: the rule applies to new destinations only.
type Placed = { id: string; name: string; coordinates: LatLon; defaultZoomSpanKm: number; rank: number; spots: number };
export const overlapping = (a: Placed, b: Placed) =>
  km(a.coordinates, b.coordinates) < 0.75 * (Math.max(a.defaultZoomSpanKm, b.defaultZoomSpanKm) / 2);
const outranks = (b: Placed, a: Placed) =>
  b.rank !== a.rank ? b.rank < a.rank : b.spots !== a.spots ? b.spots > a.spots : b.defaultZoomSpanKm > a.defaultZoomSpanKm;
// The destination `a` would merge into, if any: the highest-ranked overlapping neighbour that outranks it.
export function overlapsWith(a: Placed, others: Placed[]): Placed | null {
  let best: Placed | null = null;
  for (const b of others) {
    if (b.id === a.id || !outranks(b, a) || !overlapping(a, b)) continue;
    if (!best || outranks(b, best)) best = b;
  }
  return best;
}
const placed = (d: Dest): Placed => ({ id: d.id, name: d.name, coordinates: d.coordinates, defaultZoomSpanKm: d.defaultZoomSpanKm, rank: d.rank, spots: spotsOf(d.id).length });
const GRANDFATHERED = resolve('scripts/curation/destination-overlaps-grandfathered.json');
const grandfathered = new Set<string>(existsSync(GRANDFATHERED) ? (JSON.parse(readFileSync(GRANDFATHERED, 'utf8')).pairs as string[][]).map(p => p.join('>')) : []);

if (has('--list-overlaps')) {
  const all = DESTINATIONS.map(placed);
  for (const a of all) { const b = overlapsWith(a, all); if (b) console.log(`${a.id} > ${b.id}  (${km(a.coordinates, b.coordinates).toFixed(1)} km; ${b.name} span ${b.defaultZoomSpanKm} km)`); }
  process.exit(0);
}

if (opt('--check-new')) {
  // A run's proposed new destinations (placement.json → new_destinations) against every existing destination and each other.
  const p = JSON.parse(readFileSync(opt('--check-new')!, 'utf8'));
  const toLL = (c: any): LatLon => ({ latitude: c.latitude ?? c.lat, longitude: c.longitude ?? c.lng ?? c.lon });
  const fresh: Placed[] = (p.new_destinations ?? []).map((n: any) => ({
    id: n.id, name: n.name, coordinates: toLL(n.coordinates), defaultZoomSpanKm: n.defaultZoomSpanKm, rank: n.rank,
    spots: (n.spots ?? []).length || (p.spots ?? []).filter((s: any) => s.destination === n.id).length,
  }));
  const pool = [...DESTINATIONS.map(placed), ...fresh];
  let bad = 0;
  for (const n of fresh) {
    // Any overlap involving a new destination fails, whatever the ranks: the run proposes one destination, not both. Which one
    // stays follows the rule (the lower-ranked merges); an existing destination is never removed by a run, only by the owner.
    for (const b of pool) {
      if (b.id === n.id || !overlapping(n, b)) continue;
      if (fresh.includes(b) && b.id < n.id) continue;     // report each new–new pair once
      bad++;
      const d = km(n.coordinates, b.coordinates).toFixed(1);
      const into = outranks(b, n) ? `merge ${n.name} into ${b.name}` : fresh.includes(b) ? `merge ${b.name} into ${n.name}` : `${b.name} already exists: propose ${n.name}'s places as its spots or standalone, or ask the owner`;
      console.log(`OVERLAP  ${n.id} and ${b.id} (${d} km apart): ${into}`);
    }
  }
  console.log(bad ? `${bad} overlap(s) among ${fresh.length} new destination(s).` : `No overlaps among ${fresh.length} new destination(s).`);
  process.exit(bad ? 1 : 0);
}

const out = opt('--out');
if (!out) { console.error('usage: destination-prescreen.ts --out <dir> [--country CC] [--ids a,b] [--offline] [--all] | --check-new <placement.json> | --list-overlaps'); process.exit(1); }

// Per-spot strength from every Atlas region file: counted sources and page views, by normalised name (the best seen).
const strength = new Map<string, { counted: number; views: number }>();
function walk(dir: string) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (f !== 'candidates.json' && f !== 'verdicts.json') continue;
    let rows: any = JSON.parse(readFileSync(p, 'utf8'));
    rows = Array.isArray(rows) ? rows : rows.candidates ?? rows.verdicts ?? [];
    for (const r of rows) {
      if (!r?.name) continue;
      const counted = Array.isArray(r.counted_sources) ? r.counted_sources.length : Number(r.counted_sources ?? 0);
      const k = norm(r.name), prev = strength.get(k);
      strength.set(k, { counted: Math.max(prev?.counted ?? 0, counted), views: Math.max(prev?.views ?? 0, Number(r.views ?? 0)) });
    }
  }
}
if (existsSync('curation')) walk('curation');

// Wikivoyage page under the destination's own name: the "name travellers actually use" signal. 'redirect' means the title
// leads to a different page (often a broader region).
// Wikivoyage often spells a place without its macrons (Whakatane, Kapiti Coast), so the folded name is tried as well.
async function wikivoyage(d: Dest): Promise<'own' | 'redirect' | 'none' | 'unknown'> {
  if (has('--offline')) return 'unknown';
  const folded = d.name.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  let result: 'own' | 'redirect' | 'none' | 'unknown' = 'unknown';
  for (const title of folded === d.name ? [d.name] : [d.name, folded]) {
    const url = `https://en.wikivoyage.org/w/api.php?action=query&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
    const j = await cachedJson<any>(url, 60);
    if (!j?.query) continue;
    const page: any = Object.values(j.query.pages ?? {})[0];
    if (!page || 'missing' in page) { if (result === 'unknown') result = 'none'; continue; }
    if (!(j.query.redirects ?? []).length || norm(page.title) === norm(d.name)) return 'own';
    result = 'redirect';
  }
  return result;
}

const VERDICTS = resolve('scripts/curation/destination-verdicts.json');
const verdicts: Record<string, { fingerprint: string; verdict: string }> = existsSync(VERDICTS) ? JSON.parse(readFileSync(VERDICTS, 'utf8')) : {};
export const fingerprintOf = (d: Dest) => createHash('sha1').update(JSON.stringify([d.name, d.rank, d.defaultZoomSpanKm, d.coordinates, spotsOf(d.id).map(s => s.id).sort()])).digest('hex').slice(0, 12);

async function main() {
  const ids = opt('--ids')?.split(',');
  const country = opt('--country');
  const scope = DESTINATIONS.filter(d => (!country || d.countryCode === country) && (!ids || ids.includes(d.id)));
  const everyone = DESTINATIONS.map(placed);
  const rows: any[] = [];
  for (const d of scope) {
    const spots = spotsOf(d.id);
    const scored = spots.map(s => ({ name: s.name, category: s.category, ...(strength.get(norm(s.name)) ?? { counted: null, views: null }) }));
    const known = scored.filter(s => s.counted !== null);
    const headline = known.sort((a, b) => (b.counted! - a.counted!) || (b.views! - a.views!))[0] ?? null;
    const over = overlapsWith(placed(d), everyone);
    const overlap = over ? { with: over.id, grandfathered: grandfathered.has(`${d.id}>${over.id}`) } : null;
    const wv = await wikivoyage(d);
    const reasons: string[] = [];
    if (spots.length < 4) reasons.push(`${spots.length} spots (fewer than four)`);
    if (d.rank === 5) reasons.push('rank 5 (local base or gateway)');
    if (d.rank === 4 && spots.length <= 5) reasons.push(`rank 4 with ${spots.length} spots`);
    if (wv === 'none') reasons.push('no Wikivoyage page under its name');
    if (wv === 'redirect') reasons.push('its Wikivoyage title redirects to another page');
    if (headline && headline.counted! <= 1 && (headline.views ?? 0) < 20000) reasons.push(`no strong headline spot (best: ${headline.name}, ${headline.counted} counted source, ${headline.views} views)`);
    if (overlap && !overlap.grandfathered) reasons.push(`centre inside ${overlap.with}`);
    const fp = fingerprintOf(d);
    const group = d.rank <= 2 && !(overlap && !overlap.grandfathered) ? 'exempt'
      : !has('--all') && verdicts[d.id]?.fingerprint === fp ? 'decided'
      : reasons.length ? 'flag' : 'pass';
    const neighbours = everyone.filter(o => o.id !== d.id).map(o => ({ id: o.id, name: o.name, rank: o.rank, spots: o.spots, km: Math.round(km(d.coordinates, o.coordinates)) }))
      .filter(o => o.km <= 120).sort((a, b) => a.km - b.km).slice(0, 4);
    const standaloneNear = SPOTS.filter(s => !s.destinationId && km(d.coordinates, s.coordinates) <= d.defaultZoomSpanKm / 2).map(s => s.name);
    rows.push({ id: d.id, name: d.name, country: d.countryCode, group, reasons, fingerprint: fp,
      bundle: { id: d.id, name: d.name, country: d.countryCode, rank: d.rank, category: d.category, defaultZoomSpanKm: d.defaultZoomSpanKm,
        wikivoyage: wv, headline, spots: scored, neighbours, overlap, standalone_within_span: standaloneNear } });
  }

  mkdirSync(join(out!, 'bundles'), { recursive: true });
  writeFileSync(join(out!, 'prescreen.json'), JSON.stringify(rows.map(({ bundle, ...r }) => ({ ...r, rank: bundle.rank, spots: bundle.spots.length, wikivoyage: bundle.wikivoyage })), null, 1) + '\n');
  const flagged = rows.filter(r => r.group === 'flag');
  for (let i = 0; i < flagged.length; i += 25)
    writeFileSync(join(out!, 'bundles', `batch-${String(i / 25 + 1).padStart(2, '0')}.json`), JSON.stringify(flagged.slice(i, i + 25).map(r => ({ ...r.bundle, flags: r.reasons })), null, 1) + '\n');
  // Audit: ~10% of the pass group (at least 3 when there are any), picked by hash so a rerun picks the same ones; no group or reasons.
  const pass = rows.filter(r => r.group === 'pass').sort((a, b) => createHash('sha1').update(a.id).digest('hex').localeCompare(createHash('sha1').update(b.id).digest('hex')));
  writeFileSync(join(out!, 'audit.json'), JSON.stringify(pass.slice(0, Math.min(pass.length, Math.max(3, Math.ceil(pass.length / 10)))).map(r => r.bundle), null, 1) + '\n');
  const count = (g: string) => rows.filter(r => r.group === g).length;
  console.log(`${rows.length} destinations: ${count('flag')} flagged (${Math.ceil(flagged.length / 25)} batch(es)), ${count('pass')} pass, ${count('exempt')} exempt, ${count('decided')} already decided; audit ${Math.min(pass.length, Math.max(3, Math.ceil(pass.length / 10)))}. Wrote ${out}.`);
}
main();
