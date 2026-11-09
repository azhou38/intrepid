// Atlas step 1, the scripted half (COVERAGE.md → "Finding what is missing", step 1; PIPELINES.md → Pipeline A). Lists every place the
// STRUCTURED sources name for a region, so the coverage-enumerator agent only adds what a script cannot read (tourism boards,
// guidebooks, local-language pages) instead of rebuilding the list from pages. Sources, in the order they count:
//   1. Wikivoyage's {{see}} / {{do}} / {{listing}} entries for the region's pages and the city and district pages they link to
//      (name, coordinates, Wikipedia and Wikidata ids): a COUNTED source (COVERAGE.md → "What qualifies").
//   2. English Wikipedia's categories (members and sub-categories, depth 2): other_sources only; Wikipedia alone never counts.
//   3. OpenStreetMap attractions, museums, viewpoints, zoos, theme parks, historic sites, peaks, beaches, waterfalls and caves
//      that carry a wikipedia or wikidata tag, inside the region's bbox: other_sources only.
//
//   npx tsx scripts/curation/enumerate-structured.ts --region <region-id> --out curation/<branch>/region-<id>
//        [--wikivoyage "Wuxi,Yixing"] [--wikipedia-category "Tourist attractions in Wuxi"] [--bbox south,west,north,east]
//        [--no-follow] [--refresh]
//   npx tsx scripts/curation/enumerate-structured.ts --merge --out <dir>      (candidates.structured.json + candidates.additions.json
//                                                                             → candidates.json, ready for score-candidates.ts)
//
// The region's inputs default to its `sources` entry in scripts/coverage-regions.json ({ wikivoyage: [], wikipedia_categories: [],
// bbox: [s, w, n, e] }); flags override it. Writes candidates.structured.json (the coverage-enumerator's candidate shape, without
// views: score-candidates.ts adds those) and structured-report.json (counts per source, every page fetched, and every source that
// could not be read: UNRESOLVED, to be retried, never read as "nothing there"). Fetches go through the shared cache (http-cache.ts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cachedGet, cachedJson, UA } from './http-cache';

const argv = process.argv.slice(2);
const flag = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const has = (f: string) => argv.includes(f);
const outDir = flag('--out');
if (!outDir) { console.error('usage: enumerate-structured.ts --region <id> --out <dir> [...] | --merge --out <dir>'); process.exit(1); }
mkdirSync(outDir, { recursive: true });

type Cand = {
  name: string; wiki?: string | null; wikidata?: string; coordinates?: { lat: number; lng: number } | null; coordinates_source?: string;
  counted_sources: string[]; other_sources: string[]; note: string; name_needs_english?: boolean; aliases?: string[];
};

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
const keyOf = (c: Cand) => (c.wikidata ? `q:${c.wikidata}` : c.wiki ? `w:${norm(c.wiki)}` : `n:${norm(c.name)}`);
function mergeInto(map: Map<string, Cand>, c: Cand) {
  const keys = [keyOf(c), `n:${norm(c.name)}`, c.wiki ? `w:${norm(c.wiki)}` : '', ...(c.aliases ?? []).map(a => `n:${norm(a)}`)].filter(k => k && k !== 'n:');
  const hit = keys.map(k => map.get(k)).find(Boolean);
  if (!hit) { for (const k of keys) map.set(k, c); return; }
  hit.counted_sources = [...new Set([...hit.counted_sources, ...c.counted_sources])];
  hit.other_sources = [...new Set([...hit.other_sources, ...c.other_sources])];
  if (!hit.coordinates && c.coordinates) { hit.coordinates = c.coordinates; hit.coordinates_source = c.coordinates_source; }
  if (!hit.wiki && c.wiki) hit.wiki = c.wiki;
  if (!hit.wikidata && c.wikidata) hit.wikidata = c.wikidata;
  if (c.aliases?.length) hit.aliases = [...new Set([...(hit.aliases ?? []), ...c.aliases])];
  if (hit.note.length < c.note.length && c.counted_sources.length) hit.note = c.note;
  for (const k of keys) map.set(k, hit);
}
const uniq = (m: Map<string, Cand>) => [...new Set(m.values())];

// ── --merge: the scripted list plus what the agent added ───────────────────────────────────────────────────────────────────
if (has('--merge')) {
  const m = new Map<string, Cand>();
  const read = (f: string) => { const p = join(outDir, f); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : []; };
  const structured: Cand[] = read('candidates.structured.json'), additions: Cand[] = read('candidates.additions.json');
  for (const c of structured) mergeInto(m, c);
  for (const c of additions) mergeInto(m, c);
  const all = uniq(m);
  writeFileSync(join(outDir, 'candidates.json'), JSON.stringify(all, null, 1));
  console.log(`candidates.json: ${all.length} (${structured.length} scripted + ${additions.length} added by the agent, merged by Wikidata id, Wikipedia title and name)`);
  process.exit(0);
}

// ── region inputs ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const regionId = flag('--region');
let src: { wikivoyage?: string[]; wikipedia_categories?: string[]; bbox?: number[] } = {};
if (regionId) {
  const all = JSON.parse(readFileSync('scripts/coverage-regions.json', 'utf8'));
  for (const cc of Object.keys(all)) for (const r of (all[cc] ?? []) as any[]) if (r && r.id === regionId) src = r.sources ?? {};
}
const split = (s?: string) => (s ? s.split(',').map(x => x.trim()).filter(Boolean) : undefined);
const pages = split(flag('--wikivoyage')) ?? src.wikivoyage ?? [];
const categories = split(flag('--wikipedia-category')) ?? src.wikipedia_categories ?? [];
const bboxArg = flag('--bbox')?.split(',').map(Number);
const bbox = bboxArg && bboxArg.length === 4 ? bboxArg : src.bbox && src.bbox.length === 4 ? src.bbox : undefined;
const follow = !has('--no-follow');
if (!pages.length && !categories.length && !bbox) { console.error('no sources: give --wikivoyage, --wikipedia-category or --bbox, or add `sources` to the region in scripts/coverage-regions.json'); process.exit(1); }
const inBox = (c?: { lat: number; lng: number } | null) => !bbox || !c || (c.lat >= bbox[0] && c.lat <= bbox[2] && c.lng >= bbox[1] && c.lng <= bbox[3]);

const unresolved: string[] = [];
const report: Record<string, any> = { region: regionId, wikivoyage_pages: [], wikipedia_categories: [], overpass: null, counts: {}, unresolved };
const found = new Map<string, Cand>();

// ── 1. Wikivoyage ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function braceBlocks(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      let depth = 0, j = i;
      for (; j < text.length - 1; j++) {
        if (text[j] === '{' && text[j + 1] === '{') { depth++; j++; }
        else if (text[j] === '}' && text[j + 1] === '}') { depth--; j++; if (depth === 0) break; }
      }
      if (depth === 0) { out.push(text.slice(i + 2, j - 1)); i = j; }
    }
  }
  return out;
}
function splitTop(s: string): string[] {
  const parts: string[] = []; let cur = '', d1 = 0, d2 = 0;
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '{{') { d1++; cur += two; i++; } else if (two === '}}') { d1--; cur += two; i++; }
    else if (two === '[[') { d2++; cur += two; i++; } else if (two === ']]') { d2--; cur += two; i++; }
    else if (s[i] === '|' && d1 === 0 && d2 === 0) { parts.push(cur); cur = ''; } else cur += s[i];
  }
  parts.push(cur); return parts;
}
const clean = (s = '') => s.replace(/\{\{[^{}]*\}\}/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[https?:\S+\s+([^\]]*)\]/g, '$1').replace(/'{2,}/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
type WvParse = { wikitext: { '*': string }; links: { '*': string; ns: number }[]; title: string };
async function wikivoyage(title: string): Promise<WvParse | null> {
  const url = `https://en.wikivoyage.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext|links&redirects=1&format=json`;
  const j = await cachedJson<{ parse?: WvParse }>(url);
  return j?.parse ?? null;
}
const seenPages = new Set<string>();
async function crawl(title: string, depth: number, parent?: string) {
  if (seenPages.has(title.toLowerCase())) return; seenPages.add(title.toLowerCase());
  const p = await wikivoyage(title);
  if (!p) { unresolved.push(`wikivoyage:${title} (page missing or API unreachable: retry)`); return; }
  const text = p.wikitext['*']; const pageUrl = `https://en.wikivoyage.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`;
  let n = 0;
  for (const block of braceBlocks(text)) {
    const parts = splitTop(block); const tname = parts[0].trim().toLowerCase();
    const params: Record<string, string> = {};
    for (const q of parts.slice(1)) { const e = q.indexOf('='); if (e > 0) params[q.slice(0, e).trim().toLowerCase()] = q.slice(e + 1).trim(); }
    const kind = tname === 'see' || tname === 'do' ? tname : tname === 'listing' && /^(see|do)$/i.test(params.type ?? '') ? params.type.toLowerCase() : null;
    if (!kind || !params.name) continue;
    const lat = parseFloat(params.lat), lng = parseFloat(params.long ?? params.lon);
    const coords = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    if (!inBox(coords)) continue;
    const wiki = clean(params.wikipedia ?? '').replace(/^en:/i, '') || null;
    const wd = (params.wikidata ?? '').match(/Q\d+/)?.[0];
    const desc = clean(params.content ?? '').slice(0, 220);
    mergeInto(found, {
      name: clean(params.name), wiki, wikidata: wd, coordinates: coords, coordinates_source: coords ? `Wikivoyage ${p.title} listing geo tag` : undefined,
      counted_sources: [pageUrl], other_sources: [], note: `${kind === 'see' ? 'See' : 'Do'} listing${desc ? ': ' + desc : ''}`,
    });
    n++;
  }
  // Older Wikivoyage pages list See and Do items as plain bullets ("* '''Xihui Park''' (锡惠公园) — ..." or "* [[Lake Tai]] (太湖) — ..."),
  // not as {{see}} templates: read those too, from the See and Do sections only.
  let section = '';
  for (const line of text.split('\n')) {
    const h = line.match(/^(={2,})\s*(.+?)\s*\1\s*$/);
    if (h && h[1].length === 2) { section = h[2].toLowerCase(); continue; }
    if (section !== 'see' && section !== 'do') continue;
    const m = line.match(/^\*(?!\*)\s*(.*)$/); if (!m || !m[1] || m[1].startsWith('{{')) continue;
    const body = m[1].replace(/^[Tt]he\s+/, '');
    const nm = body.match(/^'''([^']+)'''/) ?? body.match(/^\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/);
    if (!nm) continue;
    const name = clean(nm[2] ?? nm[1]); if (!name || name.length > 80) continue;
    const rest = body.slice(nm[0].length);
    const paren = rest.match(/^\s*\(([^)]*)\)/)?.[1] ?? '';
    const aliases = paren.split(/[,;]/).map(x => x.trim()).filter(x => /[A-Za-z]/.test(x) && !/[^\u0000-ɏ]/.test(x));
    const desc = clean(rest.replace(/^\s*\([^)]*\)/, '').replace(/^\s*[—–:-]+\s*/, '')).slice(0, 220);
    mergeInto(found, { name, wiki: null, aliases, coordinates: null, counted_sources: [pageUrl], other_sources: [], note: `${section === 'see' ? 'See' : 'Do'} listing${desc ? ': ' + desc : ''}` });
    n++;
  }
  report.wikivoyage_pages.push({ page: p.title, listings: n, via: parent ?? 'region' });
  if (follow && depth < 1) {
    // districts ("Page/District") and the city pages listed under Cities, Districts or Regions; never "Other destinations" or "Go next"
    const sections = text.split(/^==+\s*/m).slice(1).map(s => ({ head: s.split(/\s*==/)[0].trim().toLowerCase(), body: s }));
    const kids = new Set<string>();
    for (const l of p.links) if (l.ns === 0 && l['*'].startsWith(p.title + '/')) kids.add(l['*']);
    for (const s of sections.filter(x => /^(cities|districts|regions|towns)$/.test(x.head)))
      for (const m of s.body.matchAll(/\[\[([^\]|#]+)/g)) kids.add(m[1].trim());
    for (const k of [...kids].slice(0, 40)) await crawl(k, depth + 1, p.title);
  }
}

// ── 2. Wikipedia categories ───────────────────────────────────────────────────────────────────────────────────────────────
async function category(cat: string, depth: number, seen: Set<string>) {
  const title = cat.startsWith('Category:') ? cat : `Category:${cat}`;
  if (seen.has(title)) return; seen.add(title);
  const base = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent(title)}&gcmlimit=500&gcmtype=page|subcat&prop=coordinates|pageprops&colimit=500&ppprop=wikibase_item`;
  const j = await cachedJson<any>(base);
  if (!j) { unresolved.push(`wikipedia:${title} (API unreachable: retry)`); return; }
  let n = 0; const subs: string[] = [];
  for (const p of Object.values<any>(j.query?.pages ?? {})) {
    if (p.ns === 14) { subs.push(p.title); continue; }
    if (p.ns !== 0) continue;
    const co = p.coordinates?.[0]; const coords = co ? { lat: co.lat, lng: co.lon } : null;
    if (!inBox(coords)) continue;
    mergeInto(found, {
      name: p.title.replace(/\s*\([^)]*\)$/, ''), wiki: p.title, wikidata: p.pageprops?.wikibase_item, coordinates: coords,
      coordinates_source: coords ? `wikipedia:${p.title}` : undefined, counted_sources: [], other_sources: [`https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`],
      note: `Listed in ${title.replace('Category:', '')} on Wikipedia`,
    });
    n++;
  }
  report.wikipedia_categories.push({ category: title, pages: n, subcategories: subs.length });
  if (depth < 2) for (const s of subs.slice(0, 40)) await category(s, depth + 1, seen);
}

// ── 3. OpenStreetMap (Overpass) ───────────────────────────────────────────────────────────────────────────────────────────
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(b: number[]) {
  const cacheFile = join(outDir!, 'structured-osm.json');
  let elements: any[] | null = null;
  if (existsSync(cacheFile) && !has('--refresh')) elements = JSON.parse(readFileSync(cacheFile, 'utf8'));
  else {
    const box = b.join(',');
    const q = `[out:json][timeout:120];(nwr["tourism"~"^(attraction|museum|viewpoint|zoo|theme_park|gallery|aquarium)$"]["wikipedia"](${box});nwr["tourism"~"^(attraction|museum|viewpoint|zoo|theme_park|gallery|aquarium)$"]["wikidata"](${box});`
      + `nwr["historic"]["wikipedia"](${box});nwr["historic"]["wikidata"](${box});nwr["natural"~"^(peak|beach|waterfall|cave_entrance)$"]["wikipedia"](${box});nwr["natural"~"^(peak|beach|waterfall|cave_entrance)$"]["wikidata"](${box}););out center tags 4000;`;
    for (const m of MIRRORS) {
      for (let i = 0; i < 2 && !elements; i++) {
        try {
          const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' } });
          if (r.ok) elements = (await r.json()).elements; else await new Promise(res => setTimeout(res, 8000));
        } catch { await new Promise(res => setTimeout(res, 8000)); }
      }
      if (elements) break;
    }
    if (elements) writeFileSync(cacheFile, JSON.stringify(elements));
  }
  if (!elements) { unresolved.push('overpass (every mirror failed: retry with --refresh)'); report.overpass = 'UNRESOLVED'; return; }
  let n = 0;
  for (const e of elements) {
    const t = e.tags ?? {}; const c = e.center ?? (e.lat != null ? { lat: e.lat, lon: e.lon } : null);
    const name = t['name:en'] ?? t.name; if (!name || !c) continue;
    const wp = (t.wikipedia ?? '').match(/^en:(.+)$/)?.[1];
    mergeInto(found, {
      name, wiki: wp ?? null, wikidata: t.wikidata?.match(/Q\d+/)?.[0], coordinates: { lat: c.lat, lng: c.lon },
      coordinates_source: `OpenStreetMap ${e.type}/${e.id}`, counted_sources: [], other_sources: [`https://www.openstreetmap.org/${e.type}/${e.id}`],
      note: `OpenStreetMap ${['tourism', 'historic', 'natural'].filter(k => t[k]).map(k => `${k}=${t[k]}`).join(' ')}`, name_needs_english: !t['name:en'] && /[^\u0000-ɏ]/.test(name) ? true : undefined,
    });
    n++;
  }
  report.overpass = { elements: elements.length, used: n };
}

// ── Wikidata: English name, English Wikipedia title and coordinates for everything that carries a Wikidata id ──────────────
async function resolveWikidata(list: Cand[]) {
  const ids = [...new Set(list.map(c => c.wikidata).filter((x): x is string => !!x))];
  const info = new Map<string, { label?: string; enwiki?: string; coords?: { lat: number; lng: number } }>();
  for (let i = 0; i < ids.length; i += 40) {
    const b = ids.slice(i, i + 40);
    const j = await cachedJson<any>(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|sitelinks|claims&languages=en&sitefilter=enwiki&ids=${b.join('|')}`);
    if (!j?.entities) { unresolved.push(`wikidata:${b[0]}…(+${b.length - 1}) (batch failed: retry)`); continue; }
    for (const [q, e] of Object.entries<any>(j.entities)) {
      const v = e.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
      info.set(q, { label: e.labels?.en?.value, enwiki: e.sitelinks?.enwiki?.title, coords: v ? { lat: v.latitude, lng: v.longitude } : undefined });
    }
  }
  for (const c of list) {
    const w = c.wikidata ? info.get(c.wikidata) : undefined; if (!w) continue;
    if (w.enwiki && !c.wiki) c.wiki = w.enwiki;
    if (c.name_needs_english && w.label) { c.name = w.label; delete c.name_needs_english; }
    if (!c.coordinates && w.coords) { c.coordinates = w.coords; c.coordinates_source = `wikidata:${c.wikidata}`; }
  }
}

(async () => {
  for (const p of pages) await crawl(p, 0);
  for (const c of categories) await category(c, 0, new Set());
  if (bbox) await overpass(bbox);
  const list = uniq(found);
  await resolveWikidata(list);
  // a Wikidata id can reveal two entries are one place: merge again on the resolved English titles
  const second = new Map<string, Cand>(); for (const c of list) mergeInto(second, c);
  const out = uniq(second).sort((a, b) => b.counted_sources.length - a.counted_sources.length || a.name.localeCompare(b.name));
  report.counts = { candidates: out.length, counted_by_wikivoyage: out.filter(c => c.counted_sources.length).length, wikipedia_or_osm_only: out.filter(c => !c.counted_sources.length).length, without_coordinates: out.filter(c => !c.coordinates).length, needs_english_name: out.filter(c => c.name_needs_english).length };
  writeFileSync(join(outDir, 'candidates.structured.json'), JSON.stringify(out, null, 1));
  writeFileSync(join(outDir, 'structured-report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.counts), unresolved.length ? `\nUNRESOLVED (retry before trusting the list): ${unresolved.join('; ')}` : '');
})();
