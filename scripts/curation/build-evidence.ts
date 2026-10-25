// Evidence bundles (PIPELINES.md → "Lean runs"): each spot's sources fetched and cut down ONCE, to the lines that matter,
// and written to <out>/<id>.json. The researcher, the writer and the fact-checker read the same bundle instead of each
// fetching and reading whole pages again; the fact-checker still re-reads the official page itself for the details that
// change (prices, ticket links), so the check stays independent of the researcher's reading.
//
//   npx tsx scripts/curation/build-evidence.ts --placement <placement.json> --out <dir> [--ids a,b] [--max-age-days N]
//
// Sources per spot: the Atlas sources already recorded on its placement entry (`source_urls`), its Wikipedia article
// (`wiki`, else its name), its official site when one is known (`ticketUrl` / `official`), and the park-pass lists in
// PASS_LISTS for parks. Each source records its URL, kind, status, retrieval date and an excerpt. A source that could not
// be read (blocked, rate-limited, unreachable) is listed under `unresolved`: an open error for a browser or a retry,
// never evidence that the place has nothing. Fetches go through the shared cache (http-cache.ts), so a rerun, or a later
// stage asking for the same page, costs nothing.
//
// Prints one summary line and the ids with unresolved sources; the bundles stay on disk.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { cachedGet, htmlTitle, htmlToText, looksBlocked, type Fetched } from './http-cache';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
const placementPath = arg('--placement'), outDir = arg('--out');
if (!placementPath || !outDir) { console.error('usage: build-evidence.ts --placement <placement.json> --out <dir> [--ids a,b] [--max-age-days N]'); process.exit(1); }
const maxAgeDays = Number(arg('--max-age-days') ?? 14);
const only = arg('--ids') ? new Set(arg('--ids')!.split(',')) : null;

// Agencies' park-pass lists: a park named on one is reached through that pass (WRITING.md → "What the cost is for").
// `timezone` scopes a state or territory's list to the places in it.
const PASS_LISTS: { pass: string; countryCode: string; timezone?: string; url: string }[] = [
  { pass: 'nt-parks', countryCode: 'AU', timezone: 'Australia/Darwin', url: 'https://nt.gov.au/parks/visitor-pass' },
];

type Source = { kind: string; url: string; status: 'ok' | 'blocked' | 'missing' | 'error'; http: number; retrieved: string; title?: string; excerpt?: string; note?: string };
type Bundle = { id: string; name: string; built: string; sources: Source[]; passLists: { pass: string; listed: boolean | null; url: string }[]; unresolved: string[] };

const placement = JSON.parse(readFileSync(placementPath, 'utf8'));
const entries: any[] = [...(placement.spots ?? []), ...(placement.standalone ?? [])].filter(e => e && e.id && (!only || only.has(e.id)));
mkdirSync(outDir, { recursive: true });

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const STOP = new Set(['the', 'of', 'and', 'national', 'park', 'reserve', 'nature', 'lookout', 'museum', 'gallery', 'centre', 'center', 'walk', 'track', 'trail', 'mount', 'lake', 'beach', 'house', 'australia', 'australian']);
const keyWords = (name: string) => {
  const w = name.toLowerCase().replace(/\([^)]*\)/g, '').match(/[a-z'’]+/g) ?? [];
  const k = w.filter(x => x.length > 3 && !STOP.has(x));
  return k.length ? k : w.filter(x => x.length > 3);
};
const statusOf = (r: Fetched): Source['status'] => looksBlocked(r) ? 'blocked' : r.status === 404 || r.status === 410 ? 'missing' : r.status >= 200 && r.status < 400 ? 'ok' : 'error';

// The lines of a page's text that mention the place, with a line of context either side, capped.
function excerptAround(text: string, words: string[], cap: number, extra?: RegExp): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    const low = l.toLowerCase();
    if (words.some(w => low.includes(w)) || (extra && extra.test(l))) { keep.add(i - 1); keep.add(i); keep.add(i + 1); }
  });
  let out = '';
  for (const i of [...keep].filter(i => i >= 0 && i < lines.length).sort((a, b) => a - b)) {
    const l = lines[i].length > 400 ? lines[i].slice(0, 400) + '…' : lines[i];
    if (out.length + l.length > cap) break;
    out += l + '\n';
  }
  return out.trim();
}

// A Wikivoyage listing: the {{see|…}}/{{do|…}} template whose name= names the place, else the lines that name it, from
// the page's wikitext.
const LISTING = /\{\{\s*(?:see|do|buy|eat|drink|sleep|listing|go)\s*\|(?:[^{}]|\{\{[^{}]*\}\})*\}\}/gi;
function wikivoyageListing(wikitext: string, words: string[], fullName: string): string {
  const norm = (x: string) => x.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const nameOf = (t: string) => norm(t.match(/\|\s*name\s*=\s*([^|}]*)/i)?.[1] ?? '');
  const all = wikitext.match(LISTING) ?? [], want = norm(fullName);
  // The listing named exactly for the place first ("Parliament House", not "Old Parliament House"), then one whose name
  // holds every key word.
  const exact = all.filter(t => nameOf(t) === want);
  const named = exact.length ? exact : all.filter(t => { const n = nameOf(t); return n.includes(want) || words.every(w => n.includes(w)); })
    .sort((x, y) => nameOf(x).length - nameOf(y).length);
  if (named.length) return named.slice(0, 2).map(t => t.replace(/\s+/g, ' ').slice(0, 1000)).join('\n');
  const lines = wikitext.split('\n').filter(l => { const low = l.toLowerCase(); return words.every(w => low.includes(w)); });
  return lines.slice(0, 2).map(l => l.replace(/\s+/g, ' ').slice(0, 600)).join('\n');
}

const COST = /\$|€|£|NZD|AUD|admission|entry|entrance|fee|free|adult|ticket|book|pass|price|concession|donation/i;

async function source(kind: string, url: string, words: string[], cap: number, extra?: RegExp): Promise<Source> {
  let r: Fetched;
  try { r = await cachedGet(url, { maxAgeDays }); }
  catch (e) { return { kind, url, status: 'error', http: 0, retrieved: day(Date.now()), note: String(e).slice(0, 120) }; }
  const s: Source = { kind, url: r.finalUrl || url, status: statusOf(r), http: r.status, retrieved: day(r.fetchedAt) };
  if (s.status !== 'ok') return s;
  const isJson = /json/.test(r.contentType) || /^\s*[[{]/.test(r.body.slice(0, 50));
  if (isJson) {
    try { const j = JSON.parse(r.body); s.title = j.title; s.excerpt = String(j.extract ?? '').slice(0, cap); } catch { s.status = 'error'; }
    return s;
  }
  s.title = htmlTitle(r.body);
  s.excerpt = excerptAround(htmlToText(r.body), words, cap, extra);
  return s;
}

(async () => {
  const passPages = new Map<string, string>();
  const counts = { spots: 0, ok: 0, blocked: 0, missing: 0, error: 0 };
  const unresolvedIds: string[] = [];
  const index: Record<string, { sources: number; ok: number; unresolved: number }> = {};
  for (const e of entries) {
    const words = keyWords(e.name);
    const sources: Source[] = [];
    const wiki = e.wiki || e.name;
    sources.push(await source('wikipedia', `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wiki.replace(/ /g, '_'))}`, words, 1500));
    for (const u of (e.source_urls ?? []) as string[]) {
      const m = u.match(/^https?:\/\/en\.wikivoyage\.org\/wiki\/(.+)$/);
      if (m) {
        let r: Fetched | null = null;
        try { r = await cachedGet(`https://en.wikivoyage.org/w/index.php?title=${m[1]}&action=raw`, { maxAgeDays }); } catch { r = null; }
        const st = r ? statusOf(r) : 'error';
        sources.push({ kind: 'wikivoyage', url: u, status: st, http: r?.status ?? 0, retrieved: day(r?.fetchedAt ?? Date.now()),
          excerpt: st === 'ok' && r ? wikivoyageListing(r.body, words, e.name) || '(no listing names this place on the page)' : undefined });
      } else {
        sources.push(await source('visitor-source', u, words, 1200));
      }
    }
    const official = e.ticketUrl || e.official;
    if (official) sources.push(await source('official', official, words, 1800, COST));
    // Park-pass lists for anything that may be a park.
    const passLists: Bundle['passLists'] = [];
    if (/park|reserve|conservation|nature|gorge|falls|national/i.test(`${e.name} ${e.category}`)) {
      for (const pl of PASS_LISTS.filter(p => (!e.countryCode || p.countryCode === e.countryCode) && (!p.timezone || !e.timezone || p.timezone === e.timezone))) {
        if (!passPages.has(pl.url)) {
          try { const r = await cachedGet(pl.url, { maxAgeDays }); passPages.set(pl.url, statusOf(r) === 'ok' ? htmlToText(r.body).toLowerCase() : ''); }
          catch { passPages.set(pl.url, ''); }
        }
        const text = passPages.get(pl.url)!;
        passLists.push({ pass: pl.pass, url: pl.url, listed: text ? words.every(w => text.includes(w)) : null });
      }
    }
    const unresolved = sources.filter(s => s.status === 'blocked' || s.status === 'error').map(s => `${s.kind} ${s.status} (${s.http}): ${s.url}`)
      .concat(passLists.filter(p => p.listed === null).map(p => `pass list unreadable: ${p.url}`));
    const bundle: Bundle = { id: e.id, name: e.name, built: day(Date.now()), sources, passLists, unresolved };
    writeFileSync(resolvePath(outDir, `${e.id}.json`), JSON.stringify(bundle, null, 1) + '\n');
    counts.spots++;
    for (const s of sources) counts[s.status]++;
    if (unresolved.length) unresolvedIds.push(e.id);
    index[e.id] = { sources: sources.length, ok: sources.filter(s => s.status === 'ok').length, unresolved: unresolved.length };
  }
  writeFileSync(resolvePath(outDir, 'index.json'), JSON.stringify({ built: day(Date.now()), placement: placementPath, spots: index }, null, 1) + '\n');
  console.log(`evidence: ${counts.spots} spots → ${outDir}; sources ok ${counts.ok}, blocked ${counts.blocked}, missing ${counts.missing}, error ${counts.error}`);
  if (unresolvedIds.length) console.log(`unresolved (browser or retry): ${unresolvedIds.join(' ')}`);
})();
