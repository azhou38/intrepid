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

import { writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { DESTINATIONS } from '../src/data/destinations';
import { SPOTS } from '../src/data/spots';
import { WIKI_IMAGE_OVERRIDES } from '../src/data/imageOverrides';
import { manifestKey, buildThumbUrl, THUMB_STEPS, type ManifestEntry } from '../src/utils/imageUrl';

const UA = 'IntrepidApp-ImageManifest/1.0 (personal hobby project)';   // Wikimedia asks for a descriptive UA
const TEMPLATE_WIDTH = 960;
const CONCURRENCY = 4;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) { await sleep(1000 * (attempt + 1)); continue; }
      return await res.json();
    } catch {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

const firstPage = (data: any): any => (data?.query?.pages ? Object.values(data.query.pages)[0] : null);

// ── The three lookups, mirroring photoCache.ts ─────────────────────────────────────────────────

interface Hit { source: string; file: string }

async function viaOverride(file: string): Promise<Hit | null> {
  const data = await getJson(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent('File:' + file)}` +
    `&prop=imageinfo&iiprop=url&iiurlwidth=${TEMPLATE_WIDTH}&format=json&origin=*`);
  const url = (firstPage(data) as any)?.imageinfo?.[0]?.thumburl;
  return url ? { source: url, file } : null;
}

async function viaExactTitle(title: string): Promise<Hit | null> {
  const data = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}` +
    `&prop=pageimages&piprop=thumbnail|name&format=json&pithumbsize=${TEMPLATE_WIDTH}&origin=*`);
  const page = firstPage(data);
  return page?.thumbnail?.source && page?.pageimage ? { source: page.thumbnail.source, file: page.pageimage } : null;
}

async function viaSearch(query: string): Promise<Hit | null> {
  const data = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}` +
    `&gsrlimit=5&prop=pageimages&piprop=thumbnail|name&format=json&pithumbsize=${TEMPLATE_WIDTH}&origin=*`);
  const pages = data?.query?.pages;
  if (!pages) return null;
  const ordered = (Object.values(pages) as any[]).sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
  for (const p of ordered) if (p?.thumbnail?.source && p?.pageimage) return { source: p.thumbnail.source, file: p.pageimage };
  return null;
}

async function resolve(title: string, context?: string): Promise<Hit | null> {
  const override = (WIKI_IMAGE_OVERRIDES as Record<string, string>)[title];
  if (override) {
    const hit = await viaOverride(override);
    if (hit) return hit;
  }
  return (await viaExactTitle(title)) ?? (await viaSearch(context ? `${title} ${context}` : title));
}

// ── File metadata: original URL/size (a thumbnail can't be wider than the source) + credit ─────

const stripHtml = (s?: string) => (s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || undefined;

async function fileInfo(file: string) {
  for (const host of ['commons.wikimedia.org', 'en.wikipedia.org']) {
    const data = await getJson(
      `https://${host}/w/api.php?action=query&titles=${encodeURIComponent('File:' + file)}` +
      `&prop=imageinfo&iiprop=url|size|extmetadata&format=json&origin=*`);
    const info = (firstPage(data) as any)?.imageinfo?.[0];
    if (info?.url) {
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
  }
  return null;
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

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function main() {
  const entries: Record<string, ManifestEntry> = {};
  const missing: string[] = [];
  const keys = [...lookups.keys()].sort();
  console.log(`Resolving ${keys.length} lookups…`);

  let done = 0;
  await pool(keys, CONCURRENCY, async key => {
    const { title, context } = lookups.get(key)!;
    const hit = await resolve(title, context);
    const info = hit ? await fileInfo(hit.file) : null;
    if (!hit || !info) missing.push(key);
    else entries[key] = { t: toTemplate(hit.source), o: info.o, ow: info.ow, credit: info.credit };
    if (++done % 25 === 0) console.log(`  ${done}/${keys.length}`);
  });

  // Verify the URLs the app will actually build — one per width step it uses.
  console.log('Verifying URLs…');
  const bad: string[] = [];
  const checks: { key: string; url: string }[] = [];
  for (const [key, e] of Object.entries(entries)) {
    for (const w of [120, 250, 500, 960]) checks.push({ key, url: buildThumbUrl(e, w) });
  }
  const unique = [...new Map(checks.map(c => [c.url, c])).values()];
  await pool(unique, CONCURRENCY, async ({ key, url }) => {
    for (let a = 0; a < 3; a++) {
      const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } }).catch(() => null);
      if (res?.ok) return;
      if (res && res.status !== 429 && res.status < 500) break;
      await sleep(800 * (a + 1));
    }
    bad.push(`${key} -> ${url}`);
  });

  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    // MANIFEST_OUT lets a run write somewhere else (e.g. while another branch is checked out).
    process.env.MANIFEST_OUT ?? resolvePath(process.cwd(), 'src/data/imageManifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), steps: THUMB_STEPS, entries: sorted, missing: missing.sort() }, null, 1) + '\n',
  );
  console.log(`\nWrote ${Object.keys(entries).length} entries.`);
  console.log(`No photo found for ${missing.length}:`, missing);
  console.log(`URLs that failed verification: ${bad.length}`, bad.slice(0, 20));
}

main();
