// Lens's triage (PIPELINES.md → "Cost and speed"): decides, per photo slot, how much work it needs before any agent
// runs, so the searcher and the judges only spend on slots that need them.
//
//   npx tsx scripts/curation/lens-triage.ts (--region <id> | --dest <id> …) --out curation/<branch>/lens
//        [--prefilter prefilter.json] [--flag <slot> …]
//
// Slots: a destination's header (`dest:<id>:header`), its why-visit photos (`dest:<id>:why1`…`why4`) and each of its
// spots (`spot:<id>`); a region's standalone spots go in a `standalone` group. Each slot gets a status:
//   search   no photo, the pre-filter fails or flags it, or it's named with --flag → the searcher finds candidates
//   confirm  a photo nobody has judged yet → one judge looks at the current photo only, and only a rejection leads
//            to a search
//   (after photo-prove.py: `proven` = the script proved the place, size, date and colour; no judge; `search` may also come from it)
//   skip     scripts/curation/photo-verdicts.json already accepts this exact file for this slot (a judge, both judges
//            or the owner did) → nobody looks at it again
// Writes <out>/<group>/task.json and prints the counts. Pass the pre-filter's --json output with --prefilter (run
// `npx tsx scripts/photo-prefilter.ts --json prefilter.json` first) so its findings mark slots for search.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { DESTINATIONS } from '../../src/data/destinations';
import { SPOTS, spotPhotoTitle } from '../../src/data/spots';
import { WIKI_IMAGE_OVERRIDES } from '../../src/data/imageOverrides';

const args = process.argv.slice(2);
const all = (f: string) => args.flatMap((a, i) => (a === f ? [args[i + 1]] : []));
const one = (f: string) => all(f)[0];
const out = one('--out');
if (!out) { console.error('usage: lens-triage.ts (--region <id> | --dest <id> …) --out <dir> [--prefilter file] [--flag <slot> …]'); process.exit(1); }

const regions = JSON.parse(readFileSync('scripts/coverage-regions.json', 'utf8'));
// Keyed by country code ({ NZ: [ { id, name, destinations, standalone }, … ] }); regions are searched across all of them.
const regionList: any[] = Object.entries(regions).filter(([k]) => !k.startsWith('_')).flatMap(([, v]) => v as any[]);
let destIds = all('--dest'), standaloneIds: string[] = [];
const regionId = one('--region');
if (regionId) {
  const r = regionList.find(x => x.id === regionId);
  if (!r) { console.error(`no region ${regionId}`); process.exit(1); }
  destIds = r.destinations; standaloneIds = r.standalone ?? [];
}
const flagged = new Set(all('--flag'));

const manifest = JSON.parse(readFileSync('src/data/imageManifest.json', 'utf8')).entries as Record<string, { o: string; ow: number }>;
const external = JSON.parse(readFileSync('src/data/externalPhotos.json', 'utf8')) as Record<string, { o: string }>;
const VERDICTS = resolvePath('scripts/curation/photo-verdicts.json');
const verdicts: Record<string, { file: string; verdict: string; by: string; at: string }> = existsSync(VERDICTS) ? JSON.parse(readFileSync(VERDICTS, 'utf8')) : {};
const prefilterRows: { key: string; file: string; role: string; reasons: string[]; review: string[] }[] =
  one('--prefilter') ? JSON.parse(readFileSync(one('--prefilter')!, 'utf8')).fails ?? [] : [];

const fileOf = (url: string) => decodeURIComponent(url.split('?')[0].split('/').pop() ?? '').replace(/_/g, ' ');
// The file a slot shows right now, and where it comes from.
function current(key: string, override?: string): { file: string; source: string } | null {
  if (external[key]) return { file: `external:${fileOf(external[key].o)}`, source: 'externalPhotos.json' };
  if (override) return { file: override.replace(/_/g, ' '), source: 'imageOverrides.ts' };
  const m = manifest[key];
  return m ? { file: fileOf(m.o), source: 'Wikipedia lead image' } : null;
}
type Slot = { slot: string; key: string; current: { file: string; source: string } | null; status: 'search' | 'confirm' | 'skip'; flags: string[] };
function slotFor(slot: string, key: string, cur: { file: string; source: string } | null): Slot {
  const flags: string[] = [];
  if (!cur) flags.push('no photo');
  for (const r of prefilterRows) {
    if (cur && (r.key === key || fileOf(r.file) === cur.file.replace(/^external:/, '') || r.file.replace(/_/g, ' ') === cur.file)) {
      flags.push(...r.reasons.map(x => `pre-filter: ${x}`), ...r.review.map(x => `pre-filter review: ${x}`));
    }
  }
  if (flagged.has(slot)) flags.push('flagged by the owner');
  const v = verdicts[slot];
  const status: Slot['status'] = flags.length ? 'search' : v && cur && v.file === cur.file && v.verdict === 'accept' ? 'skip' : 'confirm';
  return { slot, key, current: cur, status, flags };
}

const groups: Record<string, Slot[]> = {};
for (const id of destIds) {
  const d = DESTINATIONS.find(x => x.id === id);
  if (!d) { console.error(`no destination ${id}`); continue; }
  const slots: Slot[] = [slotFor(`dest:${d.id}:header`, d.name, current(d.name, WIKI_IMAGE_OVERRIDES[d.name]))];
  (d.whyVisitPhotos ?? []).forEach((f, i) => {
    const key = `File:${f}`;
    const cur = external[key] ? { file: `external:${fileOf(external[key].o)}`, source: 'externalPhotos.json' } : f ? { file: f.replace(/_/g, ' '), source: 'destinations.ts whyVisitPhotos' } : null;
    slots.push(slotFor(`dest:${d.id}:why${i + 1}`, key, cur));
  });
  for (const s of SPOTS.filter(x => x.destinationId === d.id)) {
    const key = spotPhotoTitle(s);
    slots.push(slotFor(`spot:${s.id}`, key, current(key, WIKI_IMAGE_OVERRIDES[key])));
  }
  groups[d.id] = slots;
}
if (standaloneIds.length) {
  groups.standalone = standaloneIds.map(id => SPOTS.find(s => s.id === id)).filter(Boolean).map(s => {
    const key = spotPhotoTitle(s!);
    return slotFor(`spot:${s!.id}`, key, current(key, WIKI_IMAGE_OVERRIDES[key]));
  });
}

const tally = { search: 0, confirm: 0, skip: 0 };
for (const [g, slots] of Object.entries(groups)) {
  mkdirSync(resolvePath(out, g), { recursive: true });
  writeFileSync(resolvePath(out, g, 'task.json'), JSON.stringify({ group: g, generated: new Date().toISOString(), slots }, null, 1) + '\n');
  for (const s of slots) tally[s.status]++;
  console.log(`${g}: ${slots.filter(s => s.status === 'search').length} search, ${slots.filter(s => s.status === 'confirm').length} confirm, ${slots.filter(s => s.status === 'skip').length} skip`);
}
console.log(`total: ${tally.search} search, ${tally.confirm} confirm, ${tally.skip} skip`);
