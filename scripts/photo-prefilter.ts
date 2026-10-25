// Automatic pre-filter for every photo in the app (IMAGES.md → "Automatic pre-filter"). Cheap, objective, run before
// anyone (or any model) looks at a photo: it rejects by metadata and pixels what the four checks would reject anyway.
//
//   npx tsx scripts/photo-prefilter.ts [--json out.json] [--strict] [--refresh]
//
// For each Commons photo in src/data/imageManifest.json it fetches the file's metadata (date taken, categories,
// size, type) and a small thumbnail, and flags a photo that is:
//   • dated before about 2000, or from an archive (national library, Burton Brothers, "Historical images of …");
//   • in a Commons category for maps, drawings, paintings, lithographs, satellite imagery, logos, flags, diagrams;
//   • black-and-white or sepia (mean colour saturation, and the share of the colour that is one hue);
//   • below the minimum width for its role (header 1500 px, why-visit 1280 px, spot 960 px) or, for a header, outside
//     the aspect range;
//   • the same file used for two different DESTINATIONS' places. One destination's own header, why-visit photos and spots may share
//     a file on purpose (the best photo of the Waitomo glowworm caves is the Waitomo header, a why-visit photo and the spot's).
// What survives still has to pass the four checks by eye. Results are cached per file in scripts/prefilter-cache.json
// (a Commons file never changes), so only new photos cost a download; --refresh recomputes everything.
// --strict exits non-zero when anything fails, for use as a CI check. Needs network access.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import jpeg from 'jpeg-js';
import { BAD_CATEGORY, BAD_TITLE, colourStats } from './photo-checks';
import { DESTINATIONS } from '../src/data/destinations';
import { SPOTS, spotPhotoTitle } from '../src/data/spots';
import { ALL_COUNTRIES } from '../src/data/countries';
import { buildThumbUrl, type ManifestEntry } from '../src/utils/imageUrl';
import { HEADER_MIN_WIDTH, HEADER_ASPECT_MIN, HEADER_ASPECT_MAX } from './destination-header-policy';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
const jsonOut = arg('--json'), strict = process.argv.includes('--strict'), refresh = process.argv.includes('--refresh');
const UA = 'IntrepidApp-Prefilter/1.0 (personal hobby project)';
const ROOT = process.cwd();
const MANIFEST = resolvePath(ROOT, 'src/data/imageManifest.json');
const CACHE = resolvePath(ROOT, 'scripts/prefilter-cache.json');
const WHY_MIN_W = 1280, SPOT_MIN_W = 960;
const ARCHIVE_YEAR = 2000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let last = 0;
async function pace(gap: number) { const w = last + gap - Date.now(); if (w > 0) await sleep(w); last = Date.now(); }
async function get(url: string, gap: number, tries = 5): Promise<Response | null> {
  for (let i = 0; i < tries; i++) {
    await pace(gap);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) { await sleep(4000 * 2 ** i); continue; }   // backoff: 4 s, 8 s, 16 s…
      return res;
    } catch { await sleep(2000 * (i + 1)); }
  }
  return null;
}

interface FileInfo { w: number; h: number; mime: string; year?: number; categories: string[]; sat?: number; hueShare?: number; hue?: number; vivid?: number; checked: number }

const fileOf = (e: ManifestEntry) => {
  const m = e.credit?.page?.match(/\/wiki\/File:([^?#]+)/);
  return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : undefined;
};

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { entries: Record<string, ManifestEntry> };
  const cache: Record<string, FileInfo> = !refresh && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  const destNames = new Set(DESTINATIONS.map(d => d.name));
  const countryNames = new Set(ALL_COUNTRIES.map(c => c.name));
  const role = (key: string): 'header' | 'why' | 'spot' | 'country' => key.startsWith('File:') ? 'why' : countryNames.has(key.split('|')[0]) ? 'country' : destNames.has(key.split('|')[0]) ? 'header' : 'spot';

  const keys = Object.keys(manifest.entries);
  const external = keys.filter(k => !fileOf(manifest.entries[k]));
  const byFile = new Map<string, string[]>();
  for (const k of keys) { const f = fileOf(manifest.entries[k]); if (f) byFile.set(f, [...(byFile.get(f) ?? []), k]); }
  const todo = [...byFile.keys()].filter(f => !cache[f]);
  console.log(`${keys.length} photos: ${byFile.size} Commons files (${byFile.size - todo.length} cached, ${todo.length} to check), ${external.length} not from Commons.`);

  // A. Metadata, 40 files per request.
  for (let i = 0; i < todo.length; i += 40) {
    const batch = todo.slice(i, i + 40);
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo|categories', iiprop: 'size|mime|extmetadata',
      cllimit: 'max', titles: batch.map(f => 'File:' + f).join('|'),
    });
    const res = await get(`https://commons.wikimedia.org/w/api.php?${params}`, 1200);
    const d: any = res ? await res.json().catch(() => null) : null;
    const norm = new Map<string, string>();
    for (const n of d?.query?.normalized ?? []) norm.set(n.to, n.from);
    for (const p of d?.query?.pages ?? []) {
      const title = (norm.get(p.title) ?? p.title).replace(/^File:/, '');
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const md = ii.extmetadata ?? {};
      const when = String(md.DateTimeOriginal?.value ?? md.DateTime?.value ?? '').replace(/<[^>]+>/g, '');
      const ym = when.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
      cache[title] = {
        w: ii.width, h: ii.height, mime: ii.mime, year: ym ? Number(ym[1]) : undefined,
        categories: (p.categories ?? []).map((c: any) => String(c.title).replace(/^Category:/, '')), checked: Date.now(),
      };
    }
    if ((i / 40) % 5 === 0) console.log(`  metadata ${Math.min(i + 40, todo.length)}/${todo.length}`);
  }

  // B. Colour stats from a small thumbnail of each new JPEG.
  let c = 0;
  for (const f of todo) {
    const info = cache[f];
    if (!info || info.sat !== undefined || info.mime !== 'image/jpeg') continue;
    const key = byFile.get(f)![0];
    const url = buildThumbUrl({ ...manifest.entries[key], ow: Math.min(manifest.entries[key].ow, 400) }, 250);
    const res = await get(url, 250);
    if (res?.ok) {
      try {
        const img = jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true, maxMemoryUsageInMB: 256 });
        Object.assign(info, colourStats(img.data));
      } catch { /* leave unset: reported as "could not measure colour" below */ }
    }
    if (++c % 100 === 0) { console.log(`  colour ${c}/${todo.length}`); writeFileSync(CACHE, JSON.stringify(cache)); }
  }
  writeFileSync(CACHE, JSON.stringify(Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b))), null, 0) + '\n');

  // C. Judge every photo. `fails` are objective (a flag, a map, an archive date, too small, reused); `review` are colour
  // heuristics that a sunset or a misty blue scene can trip, so a person or the judges look at them.
  type Row = { key: string; file: string; role: string; reasons: string[]; review: string[] };
  // A photo key's destination family: a destination's name, or a spot's photo key, both map to the destination (a standalone
  // spot is its own family), so a destination's header, why-visit photos and spots may share a file.
  const familyOf = new Map<string, string>();
  for (const d of DESTINATIONS) familyOf.set(d.name, d.id);
  for (const sp of SPOTS) familyOf.set(spotPhotoTitle(sp), sp.destinationId ?? sp.id);
  const family = (k: string) => familyOf.get(k) ?? k;
  const rows: Row[] = [];
  const unmeasured: string[] = [];
  const base = (k: string) => k.split('|')[0];
  let skipped = 0;
  for (const [file, usedBy] of byFile) {
    const info = cache[file];
    const places = [...new Set(usedBy.filter(k => role(k) !== 'why' && role(k) !== 'country').map(k => family(base(k))))];
    for (const key of usedBy) {
      const r = role(key);
      if (r === 'country') { skipped++; continue; }          // country sheets use the flag on purpose
      const reasons: string[] = [], review: string[] = [];
      if (!info) { reasons.push('no metadata from Commons (file renamed or deleted?)'); rows.push({ key, file, role: r, reasons, review }); continue; }
      if (info.year && info.year < ARCHIVE_YEAR) reasons.push(`dated ${info.year}`);
      const bad = info.categories.filter(cat => BAD_CATEGORY.test(cat));
      if (bad.length) reasons.push(`category: ${bad.slice(0, 2).join('; ')}`);
      if (BAD_TITLE.test(file)) reasons.push('file name suggests a map, drawing, logo or similar');
      if (!/^image\/(jpeg|png|webp)$/.test(info.mime)) reasons.push(`not a photograph file (${info.mime})`);
      if (info.sat !== undefined) {
        if (info.sat < 0.05) review.push(`black-and-white? (saturation ${info.sat.toFixed(2)})`);
        // Sepia: one warm hue (orange-brown), no strongly saturated pixels. A sunset has vivid ones; a blue sea is not warm.
        else if (info.hueShare! >= 0.92 && info.sat < 0.4 && info.hue! >= 10 && info.hue! <= 70 && (info.vivid ?? 1) < 0.03) review.push(`sepia? (${Math.round(info.hueShare! * 100)}% one warm hue, no vivid colour)`);
      } else if (info.mime === 'image/jpeg') unmeasured.push(file);
      const minW = r === 'header' ? HEADER_MIN_WIDTH : r === 'why' ? WHY_MIN_W : SPOT_MIN_W;
      if (info.w < minW) reasons.push(`${info.w}px wide, minimum ${minW} for a ${r}`);
      const aspect = info.w / info.h;
      if (r === 'header' && (aspect < HEADER_ASPECT_MIN || aspect > HEADER_ASPECT_MAX)) reasons.push(`aspect ${aspect.toFixed(2)} outside ${HEADER_ASPECT_MIN}–${HEADER_ASPECT_MAX}`);
      if (r !== 'why' && places.length > 1 && places.includes(family(base(key)))) reasons.push(`also used for ${places.filter(p => p !== family(base(key))).join(', ')}`);
      if (reasons.length || review.length) rows.push({ key, file, role: r, reasons, review });
    }
  }
  rows.sort((a, b) => a.role.localeCompare(b.role) || a.key.localeCompare(b.key));
  const seen = new Set<string>();                           // "Paris" and "Paris|France" are one photo: report once
  const out = rows.filter(r => { const id = `${r.role}:${base(r.key)}:${r.file}`; if (seen.has(id)) return false; seen.add(id); return true; });
  for (const f of out) console.log(`${f.role.padEnd(6)} ${f.key}  [${f.file}]\n` + [...f.reasons.map(x => `   FAIL   ${x}`), ...f.review.map(x => `   review ${x}`)].join('\n'));
  if (unmeasured.length) console.log(`\n${unmeasured.length} JPEG(s) could not be measured for colour (thumbnail unavailable): ${unmeasured.slice(0, 5).join('; ')}…`);
  const hard = out.filter(f => f.reasons.length), soft = out.filter(f => !f.reasons.length);
  console.log(`\n${hard.length} photo(s) fail the pre-filter and ${soft.length} more need a look for colour (${external.length} non-Commons and ${skipped} country photos not checked).`);
  const fails = out.map(f => ({ key: f.key, file: f.file, role: f.role, reasons: f.reasons, review: f.review }));
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ fails, external, unmeasured }, null, 1));
  if (strict && hard.length) process.exit(1);
}
main();
