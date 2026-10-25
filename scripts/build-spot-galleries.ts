// Builds src/data/spotGalleries.json: for each spot, a short list of extra Commons photos for the spot sheet's sliding
// gallery. How many (0–10) depends on how many good photos exist and on how popular the spot is.
//
//   npx tsx scripts/build-spot-galleries.ts --dest nelson [--spot nelson-6] --candidates out.json   (list what passes the filters)
//   npx tsx scripts/build-spot-galleries.ts --dest nelson [--spot nelson-6]                        (build from the picks)
//
// A person looks at the candidates (contact sheets) and writes the chosen files, best first, to scripts/spot-gallery-picks.json
// ({ "<spot id>": ["File name.jpg", …] }); the build then keeps as many of them as the spot's popularity allows. Nothing is added
// automatically: a category search happily returns a politician's visit or a crab, so a gallery is only ever what was picked.
//
// Per spot:
//   1. Candidates: the files of the spot's Commons category (and its direct sub-categories), found from the Wikipedia
//      article's Wikidata Commons category, else by searching categories for the spot's name. A category can be pinned in
//      scripts/spot-gallery-categories.json ({ "<spot id>": "Category:Name" }) and a file excluded for good in
//      scripts/spot-gallery-exclude.json ({ "<spot id>": ["File name.jpg"] }) after a person has looked at it.
//   2. Filter (IMAGES.md pre-filter, objective part): JPEG, ≥1280 px wide, not dated before 2000, no map / drawing / archive /
//      flag category or file name, in colour. Wrong-subject photos (a person, another place) still need an eye — use --sheets
//      to write contact sheets and then the exclude file.
//   3. Rank: Quality / Featured / Valued images first, then resolution and recency.
//   4. Count by popularity (or by hand in scripts/spot-gallery-counts.json for a spot with no article): the spot's English Wikipedia page views over the last 12 months (≥100 k → 10, ≥30 k → 8, ≥10 k → 6,
//      ≥3 k → 5, ≥1 k → 4, anything less → 3, no article → 2), capped by how many photos passed. The spot's own photo is never
//      repeated. Fewer than 2 photos → no gallery (0).
// Needs network access; paced, with backoff on 429.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import jpeg from 'jpeg-js';
import { SPOTS, spotPhotoTitle, spotCountryCode } from '../src/data/spots';
import { BAD_CATEGORY, BAD_TITLE, colourStats } from './photo-checks';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
const dest = arg('--dest'), only = arg('--spot'), candOut = arg('--candidates'), country = arg('--country');
const UA = 'IntrepidApp-Galleries/1.0 (personal hobby project)';
const ROOT = process.cwd();
const OUT = resolvePath(ROOT, 'src/data/spotGalleries.json');
const CATS = resolvePath(ROOT, 'scripts/spot-gallery-categories.json');
const EXCL = resolvePath(ROOT, 'scripts/spot-gallery-exclude.json');
const PICKS = resolvePath(ROOT, 'scripts/spot-gallery-picks.json');
const COUNTS = resolvePath(ROOT, 'scripts/spot-gallery-counts.json');
const MIN_W = 1280, MAX_PHOTOS = 10, CANDIDATE_CAP = 60;

const read = (p: string): any => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let last = 0;
async function get(url: string, gap = 900, tries = 5): Promise<Response | null> {
  for (let i = 0; i < tries; i++) {
    const w = last + gap - Date.now(); if (w > 0) await sleep(w); last = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) { await sleep(4000 * 2 ** i); continue; }
      return res;
    } catch { await sleep(2000 * (i + 1)); }
  }
  return null;
}
const api = async (host: string, params: Record<string, string>) => {
  const res = await get(`https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params }));
  return res ? (await res.json().catch(() => null)) as any : null;
};

// Page views over the last 12 full months → how many photos the spot deserves.
async function pageViews(title: string): Promise<number | null> {
  const end = new Date(); end.setDate(1); end.setMonth(end.getMonth() - 1);
  const start = new Date(end); start.setFullYear(start.getFullYear() - 1);
  const f = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
  const res = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${f(start)}/${f(end)}`);
  if (!res || !res.ok) return null;
  const d: any = await res.json().catch(() => null);
  return d?.items ? d.items.reduce((n: number, i: any) => n + i.views, 0) : null;
}
const countFor = (views: number | null) =>
  views === null ? 2 : views >= 100_000 ? 10 : views >= 30_000 ? 8 : views >= 10_000 ? 6 : views >= 3_000 ? 5 : views >= 1_000 ? 4 : 3;

async function resolvedTitle(title: string): Promise<{ title: string; qid?: string } | null> {
  const pp = await api('en.wikipedia.org', { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', titles: title });
  const p = pp?.query?.pages?.[0];
  return p && !p.missing ? { title: p.title, qid: p.pageprops?.wikibase_item } : null;
}

async function commonsCategory(spotId: string, title: string, name: string): Promise<string | null> {
  const pinned = read(CATS)?.[spotId]; if (pinned) return pinned;
  // Wikipedia → Wikidata → P373 (the Commons category).
  const qid = (await resolvedTitle(title))?.qid;
  if (qid) {
    const wd = await get(`https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=${qid}&property=P373`);
    const j: any = wd ? await wd.json().catch(() => null) : null;
    const v = j?.claims?.P373?.[0]?.mainsnak?.datavalue?.value;
    if (v) return `Category:${v}`;
  }
  const s = await api('commons.wikimedia.org', { action: 'query', list: 'search', srnamespace: '14', srsearch: name, srlimit: '5' });
  return s?.query?.search?.[0]?.title ?? null;
}

interface Photo { file: string; w: number; h: number; year?: number; score: number; t: string | null; o: string; credit: any; thumb960: string }

async function candidates(category: string): Promise<string[]> {
  const files: string[] = [];
  const listCat = async (cat: string, type: 'file' | 'subcat') => {
    const d = await api('commons.wikimedia.org', { action: 'query', list: 'categorymembers', cmtitle: cat, cmtype: type, cmlimit: '100' });
    return (d?.query?.categorymembers ?? []).map((m: any) => m.title as string);
  };
  files.push(...await listCat(category, 'file'));
  if (files.length < CANDIDATE_CAP) for (const sub of (await listCat(category, 'subcat')).slice(0, 8)) files.push(...await listCat(sub, 'file'));
  return [...new Set(files)].filter(t => /\.(jpe?g)$/i.test(t)).slice(0, 150).map(t => t.replace(/^File:/, ''));
}

const stripHtml = (s?: string) => (s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || undefined;

async function photosFor(files: string[], exclude: Set<string>, skipFile?: string): Promise<Photo[]> {
  const out: Photo[] = [];
  for (let i = 0; i < files.length; i += 40) {
    const batch = files.slice(i, i + 40);
    const d = await api('commons.wikimedia.org', {
      action: 'query', prop: 'imageinfo|categories', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '960', cllimit: 'max',
      titles: batch.map(f => 'File:' + f).join('|'),
    });
    for (const p of d?.query?.pages ?? []) {
      const ii = p.imageinfo?.[0]; if (!ii) continue;
      const file = String(p.title).replace(/^File:/, '');
      if (exclude.has(file) || file === skipFile) continue;
      if (ii.mime !== 'image/jpeg' || ii.width < MIN_W) continue;
      const md = ii.extmetadata ?? {};
      const when = stripHtml(md.DateTimeOriginal?.value ?? md.DateTime?.value) ?? '';
      const ym = when.match(/\b(1[0-9]{3}|20[0-9]{2})\b/); const year = ym ? Number(ym[1]) : undefined;
      if (year && year < 2000) continue;
      const cats: string[] = (p.categories ?? []).map((c: any) => String(c.title).replace(/^Category:/, ''));
      if (cats.some(c => BAD_CATEGORY.test(c)) || BAD_TITLE.test(file)) continue;
      const quality = cats.some(c => /^(Quality images|Featured pictures|Valued images)/i.test(c)) ? 3 : 0;
      const score = quality + Math.log2(ii.width / 1280) + (year ? Math.max(0, (year - 2005) / 20) : 0);
      const thumb960 = ii.thumburl as string;
      const m = thumb960.split('?')[0].match(/^(.*\/)(\d+)px-(.*)$/);
      out.push({
        file, w: ii.width, h: ii.height, year, score, t: m ? `${m[1]}{w}px-${m[3]}` : null, o: ii.url, thumb960,
        credit: { by: stripHtml(md.Artist?.value), license: stripHtml(md.LicenseShortName?.value), licenseUrl: md.LicenseUrl?.value, page: ii.descriptionurl },
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// Drop black-and-white / sepia scans using a small thumbnail of each of the best photos.
async function colourOk(p: Photo): Promise<boolean> {
  const res = await get(p.thumb960.replace(/\/\d+px-/, '/250px-'), 300);
  if (!res?.ok) return true;                                   // can't measure: keep, a person will look at the sheet
  try {
    const img = jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true, maxMemoryUsageInMB: 256 });
    const c = colourStats(img.data);
    return c.sat >= 0.05;
  } catch { return true; }
}

// A non-Commons photo in the repo, linked from raw.githubusercontent.com pinned to the commit that added it.
function localPhoto(l: { local: string; w: number; credit: any }): Photo {
  // Full 40-character SHA: raw.githubusercontent.com can serve a short one a 404 and keep serving it.
  const sha = execSync(`git log -1 --format=%H -- ${JSON.stringify(l.local)}`, { cwd: ROOT }).toString().trim();
  if (!sha) throw new Error(`${l.local} is not committed yet — commit it, then rebuild`);
  const url = `https://raw.githubusercontent.com/azhou38/intrepid/${sha}/${l.local}`;
  return { file: l.local, w: l.w, h: 0, year: undefined, score: 0, t: null, o: url, thumb960: url, credit: l.credit };
}

async function main() {
  const spots = SPOTS.filter(s => (!dest || s.destinationId === dest) && (!only || s.id === only) && (!country || spotCountryCode(s) === country));
  if (!spots.length) { console.log('no spots matched'); return; }
  const manifest = read(resolvePath(ROOT, 'src/data/imageManifest.json'))?.entries ?? {};
  const exclude = read(EXCL) ?? {};
  const galleries: Record<string, any[]> = read(OUT) ?? {};
  const cands: any[] = [];
  for (const s of spots) {
    const title = spotPhotoTitle(s);
    const heroFile = manifest[title]?.credit?.page?.match(/File:([^?#]+)/)?.[1];
    const hero = heroFile ? decodeURIComponent(heroFile).replace(/_/g, ' ') : undefined;
    const art = await resolvedTitle(title);
    const views = art ? await pageViews(art.title) : null;      // page views of the resolved article (a redirect has almost none)
    // A spot that is only a redirect to a broader article ("Centre of New Zealand" → Nelson) borrows that article's views, which
    // overstate it: cap it at 4. A spot with no article can have its count set by hand in scripts/spot-gallery-counts.json.
    const viaRedirect = !!art && art.title.replace(/_/g, ' ').toLowerCase() !== title.replace(/_/g, ' ').toLowerCase();
    const want = read(COUNTS)?.[s.id] ?? Math.min(countFor(views), viaRedirect ? 4 : MAX_PHOTOS);
    // A pick is a Commons file name (a string), or a non-Commons photo: { "local": "assets/photos/x.jpg", "w": 1920, "credit": {...} }
    // — a file in the repo, which is linked by the commit that added it (so the link survives later changes), and must carry its
    // credit and licence. Non-Commons photos are used only when Commons has too few good ones (IMAGES.md).
    const picks: (string | { local: string; w: number; credit: any })[] | undefined = read(PICKS)?.[s.id];
    if (candOut) {
      const cat = await commonsCategory(s.id, title, s.name);
      let photos: Photo[] = [];
      if (cat) {
        photos = await photosFor(await candidates(cat), new Set<string>(exclude[s.id] ?? []), hero);
        const kept: Photo[] = [];
        for (const p of photos) { if (kept.length >= 24) break; if (await colourOk(p)) kept.push(p); }
        photos = kept;
      }
      console.log(`${s.id.padEnd(14)} ${s.name.slice(0, 38).padEnd(38)} views=${views ?? 'n/a'} want=${want} category=${cat ?? 'none'} candidates=${photos.length}`);
      cands.push(...photos.map(p => ({ spot: s.id, file: p.file, w: p.w, year: p.year, thumb: p.thumb960 })));
      continue;
    }
    // Build from the picks, in the order given, limited by popularity and by what is still valid.
    const commonsPicks = (picks ?? []).filter((p): p is string => typeof p === 'string');
    const local = (picks ?? []).filter((p): p is { local: string; w: number; credit: any } => typeof p !== 'string');
    const valid = commonsPicks.length ? (await photosFor(commonsPicks, new Set(), hero)) : [];
    const localPhotos = local.map(l => localPhoto(l));
    const order = new Map((picks ?? []).map((p, i) => [typeof p === 'string' ? p : p.local, i]));
    const photos = [...valid, ...localPhotos].sort((a, b) => (order.get(a.file) ?? 0) - (order.get(b.file) ?? 0));
    const chosen = photos.length >= 2 ? photos.slice(0, Math.min(want, MAX_PHOTOS, photos.length)) : [];
    console.log(`${s.id.padEnd(14)} ${s.name.slice(0, 38).padEnd(38)} views=${views ?? 'n/a'} want=${want} picks=${picks?.length ?? 0} valid=${photos.length} -> ${chosen.length} photo(s)`);
    if (chosen.length) galleries[s.id] = chosen.map(p => ({ f: p.file, t: p.t, o: p.o, ow: p.w, credit: p.credit }));
    else delete galleries[s.id];
  }
  if (candOut) { writeFileSync(candOut, JSON.stringify(cands, null, 1)); return; }
  writeFileSync(OUT, JSON.stringify(Object.fromEntries(Object.entries(galleries).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n');
}
main();
