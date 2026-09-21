// Builds src/data/imageManifest.json: for every destination, spot and country the app shows a photo
// for, which Wikimedia image to use, so the app can build image URLs locally instead of asking
// Wikipedia's API on every launch.
//
// Run from the project root (needs network; tsx is fetched on demand, it isn't a project dependency):
//   npx tsx scripts/build-image-manifest.ts
//
// Resolution deliberately mirrors utils/photoCache.ts's fetchWikiThumbnail — hand-picked override
// first, then exact article title, then full-text search — so the manifest picks the same photo the
// app has been showing. Re-run it after adding a destination/spot or an image override.
//
// Kind to the API: the MediaWiki API takes up to 50 titles per query, so the override and exact-title
// lookups are sent in batches (a handful of requests instead of hundreds; sending one per title got the
// script rate-limited), only the titles that miss both fall back to a per-title search, everything is
// sequential with a minimum gap and Retry-After honoured, and a batch that still fails after retries
// aborts the run — a failed request is never recorded as "this place has no photo".

import { writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { DESTINATIONS } from '../src/data/destinations';
import { SPOTS } from '../src/data/spots';
import { WIKI_IMAGE_OVERRIDES } from '../src/data/imageOverrides';
import { manifestKey, buildThumbUrl, THUMB_STEPS, type ManifestEntry } from '../src/utils/imageUrl';

const UA = 'IntrepidApp-ImageManifest/1.0 (personal hobby project)';   // Wikimedia asks for a descriptive UA
const TEMPLATE_WIDTH = 960;
const MIN_GAP_MS = 1500;         // between any two API calls
const VERIFY_GAP_MS = 300;       // between image-URL checks
const BATCH = 50;                // titles per pageimages query (the API's limit)
const META_BATCH = 25;           // titles per imageinfo+extmetadata query (larger responses)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// One global pacing gate: every request waits its turn and leaves at least `gap` ms after the previous one.
let nextSlot = 0;
async function pace(gap: number) {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + gap;
  if (at > now) await sleep(at - now);
}

class RequestFailed extends Error {}

// Returns parsed JSON, or throws RequestFailed after exhausting retries.
async function getJson(url: string): Promise<any> {
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 8; attempt++) {
    await pace(MIN_GAP_MS);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) {
        const hint = Number(res.headers.get('retry-after'));
        const wait = Math.max(Number.isFinite(hint) ? hint * 1000 + 500 : 0, 2000 * (attempt + 1));
        lastErr = `HTTP ${res.status}`;
        console.log(`  … ${lastErr}, waiting ${Math.round(wait / 1000)}s`);
        nextSlot = Math.max(nextSlot, Date.now() + wait);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr = String(e);
      nextSlot = Math.max(nextSlot, Date.now() + 1000 * (attempt + 1));
    }
  }
  throw new RequestFailed(`${lastErr} for ${url.slice(0, 140)}`);
}

const enc = (titles: string[]) => titles.map(encodeURIComponent).join('%7C');

// Queries `titles` in batches and returns page-by-requested-title. The API normalises titles (underscores to
// spaces, first letter upper-cased) and reports that in `query.normalized`; that mapping is undone here so
// callers can look pages up by exactly what they asked for. Redirects are deliberately NOT followed, to match
// the app's own single-title request.
async function queryPages(host: string, props: string, titles: string[], size: number): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  for (let i = 0; i < titles.length; i += size) {
    const chunk = titles.slice(i, i + size);
    const data = await getJson(`https://${host}/w/api.php?action=query&titles=${enc(chunk)}&${props}&format=json&origin=*`);
    const norm = new Map<string, string>((data?.query?.normalized ?? []).map((n: any) => [n.from, n.to]));
    const byTitle = new Map<string, any>(Object.values(data?.query?.pages ?? {}).map((p: any) => [p.title, p]));
    for (const t of chunk) out.set(t, byTitle.get(norm.get(t) ?? t));
  }
  return out;
}

interface Hit { source: string; file: string }

async function viaSearch(query: string): Promise<Hit | null> {
  const data = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}` +
    `&gsrlimit=5&prop=pageimages&piprop=thumbnail|name&format=json&pithumbsize=${TEMPLATE_WIDTH}&origin=*`);
  const pages = data?.query?.pages;
  if (!pages) return null;
  // Results come back keyed by page id, not in relevance order — re-sort by the API's own `index`.
  const ordered = (Object.values(pages) as any[]).sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
  for (const p of ordered) if (p?.thumbnail?.source && p?.pageimage) return { source: p.thumbnail.source, file: p.pageimage };
  return null;
}

// ── File metadata: original URL/size (a thumbnail can't be wider than the source) + credit ─────

const stripHtml = (s?: string) => (s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || undefined;
type FileInfo = { o: string; ow: number; credit: ManifestEntry['credit'] };

function toFileInfo(page: any): FileInfo | null {
  const info = page?.imageinfo?.[0];
  if (!info?.url) return null;
  const m = info.extmetadata ?? {};
  return {
    o: info.url as string,
    ow: (info.width as number) ?? 0,
    credit: {
      by: stripHtml(m.Artist?.value),
      license: stripHtml(m.LicenseShortName?.value),
      licenseUrl: m.LicenseUrl?.value as string | undefined,
      page: info.descriptionurl as string | undefined,
    },
  };
}

async function fileInfos(files: string[]): Promise<Map<string, FileInfo | null>> {
  const props = 'prop=imageinfo&iiprop=url|size|extmetadata';
  const titles = files.map(f => 'File:' + f);
  const out = new Map<string, FileInfo | null>();
  const onCommons = await queryPages('commons.wikimedia.org', props, titles, META_BATCH);
  const missing: string[] = [];
  for (const f of files) {
    const info = toFileInfo(onCommons.get('File:' + f));
    if (info) out.set(f, info); else missing.push(f);
  }
  if (missing.length) {                                   // locally-hosted (non-Commons) files live on the wiki itself
    const onWiki = await queryPages('en.wikipedia.org', props, missing.map(f => 'File:' + f), META_BATCH);
    for (const f of missing) out.set(f, toFileInfo(onWiki.get('File:' + f)));
  }
  return out;
}

// Turns "…/960px-File.jpg?utm=…" into a template with {w}, or null when the API handed back the
// original (which happens when the source is narrower than the width asked for).
function toTemplate(source: string): string | null {
  const clean = source.split('?')[0];
  const m = clean.match(/^(.*\/)(\d+)px-(.*)$/);
  return m ? `${m[1]}{w}px-${m[3]}` : null;
}

// ── What the app looks up ──────────────────────────────────────────────────────────────────────

const lookups = new Map<string, { title: string; context?: string }>();
const want = (title: string, context?: string) => lookups.set(manifestKey(title, context), { title, context });

for (const d of DESTINATIONS) want(d.name);
for (const s of SPOTS) want(s.name);
const countries = [...new Set(DESTINATIONS.map(d => d.country))];
for (const c of countries) {
  want(c);                                            // country name on its own (pills, fallback header)
  // Country sheet header: the country's top destination's photo, looked up with the country as context.
  const top = DESTINATIONS
    .filter(d => d.country === c)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))[0];
  if (top) want(top.name, c);
}

async function main() {
  const started = Date.now();
  const overrides = WIKI_IMAGE_OVERRIDES as Record<string, string>;
  const keys = [...lookups.keys()].sort();
  const titles = [...new Set([...lookups.values()].map(l => l.title))];
  console.log(`${keys.length} lookups over ${titles.length} distinct titles.`);

  // A. Hand-picked overrides, one batched Commons query for all of them.
  const overrideTitles = titles.filter(t => overrides[t]);
  const overridePages = await queryPages(
    'commons.wikimedia.org', `prop=imageinfo&iiprop=url&iiurlwidth=${TEMPLATE_WIDTH}`,
    overrideTitles.map(t => 'File:' + overrides[t]), BATCH);
  const byTitle = new Map<string, Hit>();
  for (const t of overrideTitles) {
    const url = overridePages.get('File:' + overrides[t])?.imageinfo?.[0]?.thumburl;
    if (url) byTitle.set(t, { source: url, file: overrides[t] });
  }
  console.log(`A. overrides: ${byTitle.size}/${overrideTitles.length} resolved`);

  // B. Exact article title, batched, for everything the overrides didn't settle.
  const exactTitles = titles.filter(t => !byTitle.has(t));
  const exactPages = await queryPages(
    'en.wikipedia.org', `prop=pageimages&piprop=thumbnail|name&pithumbsize=${TEMPLATE_WIDTH}`, exactTitles, BATCH);
  for (const t of exactTitles) {
    const p = exactPages.get(t);
    if (p?.thumbnail?.source && p?.pageimage) byTitle.set(t, { source: p.thumbnail.source, file: p.pageimage });
  }
  console.log(`B. exact title: ${exactTitles.filter(t => byTitle.has(t)).length}/${exactTitles.length} resolved`);

  // C. Full-text search for what's still unresolved, one query per (title, context) the app actually makes.
  const hitFor = new Map<string, Hit>();                  // manifest key -> hit
  const needSearch: string[] = [];
  for (const key of keys) {
    const { title } = lookups.get(key)!;
    const settled = byTitle.get(title);
    if (settled) hitFor.set(key, settled); else needSearch.push(key);
  }
  let searched = 0;
  for (const key of needSearch) {
    const { title, context } = lookups.get(key)!;
    const hit = await viaSearch(context ? `${title} ${context}` : title);
    if (hit) hitFor.set(key, hit);
    if (++searched % 10 === 0) console.log(`  search ${searched}/${needSearch.length}`);
  }
  console.log(`C. search: ${needSearch.filter(k => hitFor.has(k)).length}/${needSearch.length} resolved`);

  // D. File metadata (size + credit) for every distinct photo picked, batched.
  const files = [...new Set([...hitFor.values()].map(h => h.file))];
  const infos = await fileInfos(files);
  console.log(`D. file info: ${[...infos.values()].filter(Boolean).length}/${files.length} resolved`);

  const entries: Record<string, ManifestEntry> = {};
  const missing: string[] = [];                           // the API answered, and there is no usable photo
  for (const key of keys) {
    const hit = hitFor.get(key);
    const info = hit ? infos.get(hit.file) : null;
    if (!hit || !info) { missing.push(key); continue; }
    entries[key] = { t: toTemplate(hit.source), o: info.o, ow: info.ow, credit: info.credit };
  }

  // Verify the URLs the app will actually build — the first and last width step (they share one path
  // pattern, so this catches a wrong template or a size the source can't supply).
  console.log('Verifying URLs…');
  const bad: string[] = [];
  const checks = new Map<string, string>();
  for (const [key, e] of Object.entries(entries)) {
    for (const w of [THUMB_STEPS[0], THUMB_STEPS[THUMB_STEPS.length - 1]]) checks.set(buildThumbUrl(e, w), key);
  }
  let v = 0;
  for (const [url, key] of checks) {
    let ok = false;
    for (let a = 0; a < 4 && !ok; a++) {
      await pace(VERIFY_GAP_MS);
      const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } }).catch(() => null);
      if (res?.ok) ok = true;
      else if (res && res.status !== 429 && res.status < 500) break;
      else await sleep(1500 * (a + 1));
    }
    if (!ok) bad.push(`${key} -> ${url}`);
    if (++v % 50 === 0) console.log(`  verified ${v}/${checks.size}`);
  }

  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    // MANIFEST_OUT lets a run write somewhere else (e.g. while another branch is checked out).
    process.env.MANIFEST_OUT ?? resolvePath(process.cwd(), 'src/data/imageManifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), steps: THUMB_STEPS, entries: sorted, missing: missing.sort() }, null, 1) + '\n',
  );
  console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)}s. Wrote ${Object.keys(entries).length} of ${keys.length} entries.`);
  console.log(`No photo found for ${missing.length}:`, missing);
  console.log(`URLs that failed verification: ${bad.length}`, bad.slice(0, 20));
}

main().catch(e => { console.error('ABORTED — no manifest written:', e); process.exit(1); });
