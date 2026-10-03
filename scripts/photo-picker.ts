// Photo picker: helps hand-pick the Wikimedia Commons photos the app shows for new places, by eye, as
// AGENTS.md requires ("open it and check it visually").
//
//   npx tsx scripts/photo-picker.ts [--country NZ] [--no-spots]
//     Searches Commons for candidates for every photo slot still missing — a destination's header
//     (WIKI_IMAGE_OVERRIDES), its three "Why visit" photos (whyVisitPhotos) and, optionally, its spots'
//     photos — keeps only files that meet the size/shape rules, and writes photo-picker.html: a contact
//     sheet to choose from. Open it in a browser, pick, and press "Download picks.json".
//
//   npx tsx scripts/photo-picker.ts --apply ~/Downloads/picks.json
//     Writes the picks into src/data/imageOverrides.ts and src/data/destinations.ts. Then run
//     scripts/check-destination-headers.ts and scripts/build-image-manifest.ts as usual.
//
// Needs network access to commons.wikimedia.org. Requests are paced and retried, like the manifest build.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { DESTINATIONS } from '../src/data/destinations';
import { SPOTS } from '../src/data/spots';
import { WIKI_IMAGE_OVERRIDES } from '../src/data/imageOverrides';
import { HEADER_MIN_WIDTH, HEADER_ASPECT_MIN, HEADER_ASPECT_MAX } from './destination-header-policy';
import type { Destination } from '../src/types';

const ROOT = resolvePath(__dirname, '..');
const UA = 'IntrepidApp-PhotoPicker/1.0 (personal hobby project)';
const MIN_GAP_MS = Number(process.env.PICKER_GAP_MS ?? 1000);
const PER_SLOT = 12;

type SlotKind = 'header' | 'why' | 'spot';
interface Candidate { file: string; thumb: string; w: number; h: number; page: string }
// `ref` is what a pick is saved under: the destination's name (header), its id (why — with `index`), or
// the spot's name (spot).
interface Slot { key: string; kind: SlotKind; ref: string; index?: number; label: string; hint: string; candidates: Candidate[] }

// ── Network ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let nextSlot = 0;
async function getJson(url: string): Promise<any> {
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 6; attempt++) {
    const at = Math.max(Date.now(), nextSlot);
    nextSlot = at + MIN_GAP_MS;
    if (at > Date.now()) await sleep(at - Date.now());
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) {
        const hint = Number(res.headers.get('retry-after'));
        const wait = Math.max(Number.isFinite(hint) ? hint * 1000 + 500 : 0, 2000 * (attempt + 1));
        lastErr = `HTTP ${res.status}`;
        nextSlot = Math.max(nextSlot, Date.now() + wait);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr = String(e);
      nextSlot = Math.max(nextSlot, Date.now() + 1000 * (attempt + 1));
    }
  }
  throw new Error(`${lastErr} for ${url.slice(0, 140)}`);
}

// Commons file search (namespace 6), returning size and a 480px thumbnail for each hit, in relevance order.
async function searchCommons(query: string): Promise<Candidate[]> {
  const data = await getJson(
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6' +
    `&gsrlimit=40&gsrsearch=${encodeURIComponent(query + ' filetype:bitmap')}` +
    '&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=480');
  const pages = Object.values(data?.query?.pages ?? {}) as any[];
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(p => ({ p, info: p.imageinfo?.[0] }))
    .filter(({ info }) => info && /^image\/(jpeg|png|webp)$/.test(info.mime))
    .map(({ p, info }) => ({
      file: String(p.title).replace(/^File:/, ''),
      thumb: info.thumburl as string,
      w: info.width as number,
      h: info.height as number,
      page: info.descriptionurl as string,
    }));
}

// The size/shape rules per slot: headers follow the header policy; the rest just need to be sharp.
function fits(kind: SlotKind, c: Candidate): boolean {
  const aspect = c.w / c.h;
  if (kind === 'header') return c.w >= HEADER_MIN_WIDTH && aspect >= HEADER_ASPECT_MIN && aspect <= HEADER_ASPECT_MAX;
  return c.w >= 1280 && aspect >= 0.6 && aspect <= 2.2;
}

async function candidates(kind: SlotKind, queries: string[]): Promise<Candidate[]> {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const q of queries) {
    for (const c of await searchCommons(q)) {
      if (seen.has(c.file) || !fits(kind, c)) continue;
      seen.add(c.file);
      out.push(c);
    }
    if (out.length >= PER_SLOT) break;
  }
  return out.slice(0, PER_SLOT);
}

// ── Build the contact sheet ──────────────────────────────────────────────────

const isTown = (d: Destination) => d.category === 'city';

async function build(country: string | undefined, withSpots: boolean) {
  const overrides = WIKI_IMAGE_OVERRIDES as Record<string, string>;
  const dests = DESTINATIONS.filter(d => (!country || d.countryCode === country)
    && (!overrides[d.name] || !d.whyVisitPhotos));
  if (!dests.length) { console.log('Nothing to pick: every destination in scope has its photos.'); return; }

  const groups: { dest: Destination; slots: Slot[] }[] = [];
  let n = 0;
  const total = dests.length;
  for (const d of dests) {
    n++;
    console.log(`[${n}/${total}] ${d.name}`);
    const slots: Slot[] = [];
    if (!overrides[d.name]) {
      const qs = isTown(d)
        ? [`${d.name} ${d.country} panorama`, `${d.name} skyline`, `${d.name} ${d.country}`]
        : [`${d.name} ${d.country} landscape`, `${d.name} panorama`, `${d.name} ${d.country}`];
      slots.push({
        key: `header:${d.name}`, kind: 'header', ref: d.name, label: 'Header',
        hint: isTown(d)
          ? 'A spectacular cityscape or panorama of the town itself — not one building, not a high aerial view. Subject near the centre.'
          : 'The landscape the place is known for, seen wide. Subject near the centre.',
        candidates: await candidates('header', qs),
      });
    }
    if (!d.whyVisitPhotos && d.whyVisit) {
      for (let i = 0; i < 3; i++) {
        const topic = d.highlights?.[i] ?? d.whyVisit[i];
        slots.push({
          key: `why:${d.id}:${i}`, kind: 'why', ref: d.id, index: i, label: `Why visit ${i + 1}`, hint: d.whyVisit[i],
          candidates: await candidates('why', [`${topic} ${d.name}`, `${topic} ${d.country}`, d.whyVisit[i]]),
        });
      }
    }
    if (withSpots) {
      for (const s of SPOTS.filter(s => s.destinationId === d.id && !overrides[s.name])) {
        slots.push({
          key: `spot:${s.name}`, kind: 'spot', ref: s.name, label: s.name, hint: `${s.bio} (optional — "Automatic" keeps the Wikipedia lead photo)`,
          candidates: await candidates('spot', [`${s.name} ${d.name}`, s.name]),
        });
      }
    }
    groups.push({ dest: d, slots });
  }

  const out = resolvePath(ROOT, 'photo-picker.html');
  writeFileSync(out, renderHtml(groups));
  console.log(`\nWrote ${out}\nOpen it in a browser, pick the photos, then press "Download picks.json" and run:\n` +
    '  npx tsx scripts/photo-picker.ts --apply ~/Downloads/picks.json');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderHtml(groups: { dest: Destination; slots: Slot[] }[]): string {
  const sections = groups.map(({ dest, slots }) => `
  <section>
    <h2>${esc(dest.name)} <small>${esc(dest.category)} · rank ${dest.rank}</small></h2>
    ${slots.map(slot => `
    <div class="slot" data-kind="${slot.kind}" data-ref="${esc(slot.ref)}" data-index="${slot.index ?? ''}">
      <h3>${esc(slot.label)} <span>${esc(slot.hint)}</span></h3>
      <div class="row">
        ${slot.kind === 'spot' ? `<label class="card none"><input type="radio" name="${esc(slot.key)}" value="" checked><div class="ph">Automatic</div></label>` : ''}
        ${slot.candidates.length ? '' : '<p class="empty">No candidates met the size rules — find one on Commons by hand.</p>'}
        ${slot.candidates.map(c => `
        <label class="card">
          <input type="radio" name="${esc(slot.key)}" value="${esc(c.file)}">
          <img loading="lazy" src="${esc(c.thumb)}" alt="">
          <div class="meta">${c.w}×${c.h} · <a href="${esc(c.page)}" target="_blank" rel="noopener">open</a></div>
          <div class="name">${esc(c.file)}</div>
        </label>`).join('')}
      </div>
    </div>`).join('')}
  </section>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Photo picker</title>
<style>
  :root { color-scheme: light; --ink:#111827; --muted:#6B7280; --line:#E5E7EB; --pick:#059669; }
  body { margin:0; font:14px/1.4 -apple-system, system-ui, sans-serif; color:var(--ink); background:#F9FAFB; }
  header { position:sticky; top:0; z-index:2; display:flex; gap:12px; align-items:center; padding:12px 16px; background:white; border-bottom:1px solid var(--line); }
  header h1 { font-size:16px; margin:0; flex:1; }
  button { flex:none; white-space:nowrap; font:inherit; font-weight:700; padding:8px 14px; border-radius:999px; border:0; background:var(--ink); color:white; cursor:pointer; }
  #count { flex:none; color:var(--muted); }
  main { padding:8px 16px 48px; }
  section { margin-top:24px; }
  h2 { font-size:20px; margin:0 0 8px; } h2 small { font-size:12px; color:var(--muted); font-weight:500; }
  .slot { background:white; border:1px solid var(--line); border-radius:12px; padding:12px; margin:10px 0; }
  h3 { font-size:14px; margin:0 0 8px; } h3 span { font-weight:400; color:var(--muted); }
  .row { display:flex; gap:10px; overflow-x:auto; padding-bottom:6px; }
  .card { flex:0 0 220px; border:2px solid transparent; border-radius:10px; cursor:pointer; background:#F3F4F6; overflow:hidden; }
  .card input { display:none; }
  .card:has(input:checked) { border-color:var(--pick); box-shadow:0 0 0 3px #A7F3D0; }
  .card img { display:block; width:220px; height:220px; object-fit:cover; }
  .ph { width:220px; height:220px; display:flex; align-items:center; justify-content:center; color:var(--muted); font-weight:700; }
  .meta, .name { padding:4px 8px; font-size:11px; color:var(--muted); word-break:break-all; }
  .name { color:var(--ink); padding-top:0; }
  .empty { color:var(--muted); margin:8px; }
</style></head>
<body>
<header><h1>Photo picker — pick one per row (square previews match the app's header crop)</h1>
<span id="count"></span><button id="dl">Download picks.json</button></header>
<main>${sections}</main>
<script>
  function picks() {
    const out = { headers: {}, why: {}, spots: {} };
    for (const slot of document.querySelectorAll('.slot')) {
      const { kind, ref, index } = slot.dataset;
      const chosen = slot.querySelector('input:checked');
      if (!chosen || !chosen.value) continue;
      if (kind === 'header') out.headers[ref] = chosen.value;
      else if (kind === 'spot') out.spots[ref] = chosen.value;
      else (out.why[ref] = out.why[ref] || {})[index] = chosen.value;
    }
    return out;
  }
  function update() {
    const p = picks();
    document.getElementById('count').textContent =
      Object.keys(p.headers).length + ' headers · ' + Object.values(p.why).reduce((n, w) => n + Object.keys(w).length, 0) + ' why · ' + Object.keys(p.spots).length + ' spots';
  }
  document.addEventListener('change', update); update();
  document.getElementById('dl').onclick = () => {
    const blob = new Blob([JSON.stringify(picks(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'picks.json'; a.click();
  };
</script>
</body></html>`;
}

// ── Apply picks ──────────────────────────────────────────────────────────────

interface Picks { headers: Record<string, string>; why: Record<string, Record<string, string>>; spots: Record<string, string> }

function apply(path: string) {
  const picks = JSON.parse(readFileSync(resolvePath(path.replace(/^~/, process.env.HOME ?? '~')), 'utf8')) as Picks;

  // Headers and spot photos → WIKI_IMAGE_OVERRIDES (added, or an existing entry replaced).
  const overridesPath = resolvePath(ROOT, 'src/data/imageOverrides.ts');
  let ov = readFileSync(overridesPath, 'utf8');
  const start = ov.indexOf('export const WIKI_IMAGE_OVERRIDES');
  const end = ov.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error('Could not find WIKI_IMAGE_OVERRIDES in imageOverrides.ts');
  let body = ov.slice(start, end);
  const entries = { ...picks.headers, ...picks.spots };
  for (const [name, file] of Object.entries(entries)) {
    const line = `  ${JSON.stringify(name)}: ${JSON.stringify(file)},`;
    const existing = new RegExp(`^  ${escapeRe(JSON.stringify(name))}: .*$`, 'm');
    body = existing.test(body) ? body.replace(existing, line) : body + '\n' + line;
  }
  ov = ov.slice(0, start) + body + ov.slice(end);
  writeFileSync(overridesPath, ov);

  // Why-visit photos → whyVisitPhotos on the destination, only once all three are picked.
  const destPath = resolvePath(ROOT, 'src/data/destinations.ts');
  let ds = readFileSync(destPath, 'utf8');
  const skipped: string[] = [];
  for (const [id, byIndex] of Object.entries(picks.why)) {
    const files = [0, 1, 2].map(i => byIndex[i]);
    if (files.some(f => !f)) { skipped.push(id); continue; }
    const at = ds.indexOf(`id: '${id}'`);
    if (at < 0) { skipped.push(id); continue; }
    const next = ds.indexOf("id: '", at + 5);
    const blockEnd = next < 0 ? ds.length : next;
    const block = ds.slice(at, blockEnd);
    const line = `    whyVisitPhotos: ${JSON.stringify(files).replace(/","/g, '", "')},`;
    let newBlock: string;
    if (/^\s*whyVisitPhotos: .*$/m.test(block)) newBlock = block.replace(/^\s*whyVisitPhotos: .*$/m, line);
    else newBlock = block.replace(/^(\s*whyVisit: .*)$/m, `$1\n${line}`);
    ds = ds.slice(0, at) + newBlock + ds.slice(blockEnd);
  }
  writeFileSync(destPath, ds);

  console.log(`Applied ${Object.keys(picks.headers).length} headers, ${Object.keys(picks.spots).length} spot photos, ` +
    `${Object.keys(picks.why).length - skipped.length} why-visit sets.`);
  if (skipped.length) console.log(`Skipped why-visit photos (need all three picked): ${skipped.join(', ')}`);
  console.log('Next: npx tsx scripts/check-destination-headers.ts && npx tsx scripts/build-image-manifest.ts');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] ?? '') : undefined; };
const applyPath = flag('--apply');
if (applyPath) apply(applyPath);
else build(flag('--country'), !args.includes('--no-spots')).catch(e => { console.error('ABORTED:', e); process.exit(1); });
