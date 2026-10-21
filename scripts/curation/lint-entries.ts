// Quill's triage (PIPELINES.md → "Cost and speed"): the objective checks on destinations and spots, so the writing
// pipeline researches and rewrites only the entries that fail one, instead of every entry in a region.
//
//   npx tsx scripts/curation/lint-entries.ts (--region <id> | --dest <id> [--dest <id> …]) [--json out.json] [--offline]
//
// Spots
//   ticketUrl   loads, isn't a captcha wall, and its title or heading names the place (WRITING.md → ticketUrl);
//               "blocked" means it needs a real browser, not that it's wrong
//   photo-shared a spot whose photo file is also another spot's (every spot has its own image and subject)
//   source      app text names a source (Wikivoyage, "per the brief"...)
//   thin-destination a destination of rank 3+ with three or fewer spots
//   park-in-park a national park listed as a spot of another national park
//   no-ticket   charges (costMin > 0) but has no ticketUrl, or has no cost at all and isn't free (never researched)
//   district    no entry in src/data/spotDistricts.json (the standalone-spot carousel needs it)
//   pin         round coordinates (three decimals or fewer): a point written from memory, not taken from a map feature
//   pin-shared  within PIN_SHARED_M of another spot's pin: one place's point copied to another (Dharug National Park sat on
//               Wisemans Ferry's point, 5.6 km from the park's visitor area)
//   bio         fewer than 10 words, more than one sentence, marketing words (WRITING.md → "Voice"), or longer than the carousel card's three
//               lines (bio-fit.py, measured in the card's own font)
//   wiki        its photo title (wiki, else name) is missing on Wikipedia, a disambiguation page, or a redirect —
//               only for spots whose photo comes from that lookup (no override, no supplied photo)
// Destinations
//   shape       whyVisit not two to four (or highlights / whyVisitPhotos not matching its count), goodToKnow not exactly three, a whyVisit reason outside 2–8 words, or bestTimeBlurb without exactly one {months}
//   voice       marketing words in tagline or description
// With --offline only the checks that need no network run (shape, voice, bio, no-ticket, pin, pin-shared).
// Fetches go through the shared cache (http-cache.ts). Prints one line per failing entry; --json writes them all.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { cachedGet, cachedJson, htmlTitle, looksBlocked } from './http-cache';
import { DESTINATIONS } from '../../src/data/destinations';
import { SPOTS, spotPhotoTitle } from '../../src/data/spots';
import { WIKI_IMAGE_OVERRIDES, NO_PHOTO } from '../../src/data/imageOverrides';

const spotDistricts = JSON.parse(readFileSync('src/data/spotDistricts.json', 'utf8').toString()) as Record<string, unknown>;
const EXTERNAL = JSON.parse(readFileSync('src/data/externalPhotos.json', 'utf8')) as Record<string, unknown>;


// No two spots share a photo (IMAGES.md "Spot photos"): the resolved image file of every spot, so a spot whose photo is also another
// spot's is flagged on both. Same-SUBJECT pairs (a park whose photo is its waterfall) need an eye: see the judge checklist.
const MANIFEST_ENTRIES = (JSON.parse(readFileSync('src/data/imageManifest.json', 'utf8')) as { entries: Record<string, { o?: string }> }).entries;
const photoFileOf = (sp: { name: string; wiki?: string }) => { const k = spotPhotoTitle(sp as any); return NO_PHOTO.has(k) ? null : decodeURIComponent((MANIFEST_ENTRIES[k]?.o ?? '').split('?')[0]).toLowerCase() || null; };
const spotsByPhoto = new Map<string, string[]>();
for (const sp of SPOTS) { const f = photoFileOf(sp); if (f) (spotsByPhoto.get(f) ?? spotsByPhoto.set(f, []).get(f)!).push(sp.id); }

// Two different places almost never share a point: a pin within this distance of another spot's is one place's coordinates
// reused for another (a park given its gateway village's point, a town given its museum's, a walk given its trailhead
// beach's). Genuinely adjacent places (two attractions in one building) sit 25 m or more apart.
const PIN_SHARED_M = 25;
const metresBetween = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) =>
  Math.hypot((a.latitude - b.latitude) * 111_320, (a.longitude - b.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180));

const args = process.argv.slice(2);
const all = (f: string) => args.flatMap((a, i) => (a === f ? [args[i + 1]] : []));
const one = (f: string) => all(f)[0];
const offline = args.includes('--offline');

const regions = JSON.parse(readFileSync('scripts/coverage-regions.json', 'utf8'));
// Keyed by country code ({ NZ: [ { id, name, destinations, standalone }, … ] }); regions are searched across all of them.
const regionList: any[] = Object.entries(regions).filter(([k]) => !k.startsWith('_')).flatMap(([, v]) => v as any[]);
let destIds = new Set(all('--dest'));
let standaloneIds = new Set<string>();
const regionId = one('--region');
if (regionId) {
  const r = regionList.find(x => x.id === regionId);
  if (!r) { console.error(`no region ${regionId} in scripts/coverage-regions.json`); process.exit(1); }
  destIds = new Set(r.destinations); standaloneIds = new Set(r.standalone ?? []);
}
if (!destIds.size && !standaloneIds.size) { console.error('usage: lint-entries.ts (--region <id> | --dest <id> …) [--json out.json] [--offline]'); process.exit(1); }

// Source names never appear in what the app shows ("Wikivoyage warns...", "per the brief"): the fact is stated plainly.
// Destinations the owner approved below the four-spot bar as flagship parks (Tasmania, 2026-10-20).
const FLAGSHIP_EXEMPT = new Set(['mount-field', 'southwest-national-park']);
const SOURCE_MENTION = /wikivoyage|wikipedia|lonely planet|rough guide|tripadvisor|wikimedia|openstreetmap|according to|per the brief|in the brief|the guidebook/i;
const textOf = (o: any): string[] => typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(textOf) : o && typeof o === 'object' ? Object.entries(o).filter(([k]) => k !== 'wiki' && k !== 'ticketUrl').flatMap(([, v]) => textOf(v)) : [];
const MARKETING = /\b(stunning|breathtaking|must[- ]see|must[- ]visit|world[- ]class|iconic|unforgettable|hidden gem|picturesque|nestled|paradise|best in the world|bucket[- ]list|jaw[- ]dropping|awe[- ]inspiring|spectacular)\b/i;
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set(['the', 'of', 'and', 'at', 'on', 'in', 'a', 'to', 'new', 'zealand', 'park', 'museum', 'beach', 'track', 'walk', 'national', 'reserve', 'regional', 'house', 'garden', 'gardens', 'island', 'bay', 'mount', 'lake']);
const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-Z0-9"'“‘(])/).filter(x => x.trim()).length;

type Issue = { kind: 'spot' | 'destination'; id: string; name: string; checks: { check: string; detail: string }[] };
const issues: Issue[] = [];
const add = (it: Issue, check: string, detail: string) => it.checks.push({ check, detail });

async function checkTicket(name: string, wiki: string | undefined, url: string): Promise<string | null> {
  const r = await cachedGet(url);
  if (r.status === 0) return `unreachable (${r.body.slice(0, 80)})`;
  if (looksBlocked(r)) return `blocked (${r.status}) — check in a real browser`;
  if (r.status >= 400) return `dead (${r.status})`;
  const head = norm(htmlTitle(r.body) + ' ' + (r.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').replace(/<[^>]+>/g, ' '));
  const words = [...new Set(norm(`${name} ${wiki ?? ''}`).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)))];
  if (words.length && !words.some(w => head.includes(w))) return `title doesn't name the place ("${htmlTitle(r.body).slice(0, 70)}")`;
  return null;
}
async function checkWiki(title: string): Promise<string | null> {
  const d = await cachedJson<any>(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=disambiguation&titles=${encodeURIComponent(title)}`, 30);
  if (!d) return null;   // network trouble: no verdict
  const page: any = Object.values(d.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined) return 'no Wikipedia article (photo lookup will fall back to search)';
  if (page.pageprops && 'disambiguation' in page.pageprops) return 'a disambiguation page — set `wiki` to the exact article';
  const to = d.query?.redirects?.[0]?.to;
  if (to && norm(to) !== norm(title)) return `redirects to "${to}" — set \`wiki\` to it, or check it's this place`;
  return null;
}

(async () => {
  for (const d of DESTINATIONS.filter(x => destIds.has(x.id))) {
    const it: Issue = { kind: 'destination', id: d.id, name: d.name, checks: [] };
    // A destination needs at least four spots, or rank 1-2 headline status (COVERAGE.md): two or three spots never make one.
    const nSpots = SPOTS.filter(s => s.destinationId === d.id).length;
    if (nSpots <= 3 && d.rank >= 3 && !FLAGSHIP_EXEMPT.has(d.id)) add(it, 'thin-destination', `only ${nSpots} spots at rank ${d.rank}: its spots should be standalone or go under the nearest real destination`);
    { const m = textOf(d).join(' \n ').match(SOURCE_MENTION); if (m) add(it, 'source', `names a source ("${m[0]}"): state the fact without attribution`); }
    const nWhy = d.whyVisit?.length ?? 0;   // 2–4 by popularity (WRITING.md): the rank sets the target, the lint only enforces the range and that every reason has its highlight and photo
    if (nWhy < 2 || nWhy > 4) add(it, 'shape', `${nWhy} whyVisit (needs 2–4)`);
    if (d.whyVisitPhotos && d.whyVisitPhotos.length !== nWhy) add(it, 'shape', `${d.whyVisitPhotos.length} whyVisitPhotos for ${nWhy} whyVisit`);
    for (const w of d.whyVisit ?? []) {
      const n = w.trim().split(/\s+/).length;
      if (n < 2 || n > 8) add(it, 'shape', `whyVisit "${w}" is ${n} words (needs 2–8)`);
      // A reason is an action and its subject, never a bare name ("Len Lye Centre", "Tongariro Alpine Crossing").
      if (!/^(See|Visit|Walk|Hike|Cross|Climb|Swim|Soak|Taste|Sail|Cruise|Explore|Watch|Spot|Meet|Ride|Paddle|Kayak|Dive|Snorkel|Wander|Stroll|Sip|Eat|Try|Hunt|Ski|Soar|Fly|Drive|Join|Feed|Stay|Discover|Relax|Trek|Camp|Float|Raft|Bungy|Gaze|Admire|Browse|Tour|Cycle|Bike|Surf|Fish|Dine|Shop|Roam|Find|Enjoy|Experience|Take|Hear|Step|Stand|Ascend|Descend|Sample|Look|Spend|Go|Board|Paraglide|Zipline|Scramble|Marvel|Sandboard|Dig|Punt|View|Photograph|Pan|Learn|Feel|Taste|Cheer|Shelter|Pause|Pass|Reach|Follow|Hunt|Scale|Wade|Bathe|Ramble|Savour|Sunbathe|Stargaze|Whale-watch|Heli-hike|Stop)\b/i.test(w.trim())) add(it, 'shape', `whyVisit "${w}" does not start with an action (e.g. "Walk the…", "See the…")`);
    }
    if ((d.highlights?.length ?? 0) !== nWhy) add(it, 'shape', `${d.highlights?.length ?? 0} highlights (needs one per whyVisit: ${nWhy})`);
    if ((d.goodToKnow?.length ?? 0) !== 3) add(it, 'shape', `${d.goodToKnow?.length ?? 0} goodToKnow (needs 3)`);
    if (((d.bestTimeBlurb ?? '').match(/\{months\}/g) ?? []).length !== 1) add(it, 'shape', 'bestTimeBlurb needs exactly one {months}');
    for (const [f, v] of [['tagline', d.tagline], ['description', d.description]] as const) {
      const m = (v ?? '').replace(/\bbirds?[- ]of[- ]paradise\b/gi, 'birds').match(MARKETING); if (m) add(it, 'voice', `${f}: "${m[0]}"`);
    }
    if (it.checks.length) issues.push(it);
  }
  const spots = SPOTS.filter(s => (s.destinationId && destIds.has(s.destinationId)) || (!s.destinationId && standaloneIds.has(s.id)));
  // Bios that would run past the carousel card's three lines, measured in the card's font by bio-fit.py.
  const tooLong = new Map<string, { lines: number; cut: number }>();
  if (spots.length) {
    const tmp = `${process.env.TMPDIR ?? '/tmp'}/bio-fit-${process.pid}.json`;
    const r = spawnSync('python3', ['scripts/curation/bio-fit.py', '--ids', spots.map(s => s.id).join(','), '--json', tmp], { encoding: 'utf8' });
    if (r.status === 0 || r.status === 1) for (const f of JSON.parse(readFileSync(tmp, 'utf8'))) tooLong.set(f.id, f);
    else console.error(`bio-fit.py did not run (${(r.stderr || '').trim().split('\n').pop()}): bio length not checked`);
  }
  let n = 0;
  for (const s of spots) {
    const it: Issue = { kind: 'spot', id: s.id, name: s.name, checks: [] };
    { const m = textOf(s).join(' \n ').match(SOURCE_MENTION); if (m) add(it, 'source', `names a source ("${m[0]}"): state the fact without attribution`); }
    { const f = photoFileOf(s); const others = f ? (spotsByPhoto.get(f) ?? []).filter(x => x !== s.id) : []; if (others.length) add(it, 'photo-shared', `shares its photo with ${others.join(', ')}: every spot needs its own image (and its own subject)`); }
    if (sentences(s.bio) > 1) add(it, 'bio', 'more than one sentence');
    const nWords = s.bio.trim().split(/\s+/).filter(Boolean).length;
    if (nWords < 10) add(it, 'bio', `only ${nWords} words (min 10): say what it is, where, and why it is worth a stop`);
    const m = s.bio.replace(/\bbirds?[- ]of[- ]paradise\b/gi, 'birds').match(MARKETING); if (m) add(it, 'bio', `marketing word "${m[0]}"`);
    const tl = tooLong.get(s.id); if (tl) add(it, 'bio', `${tl.lines} lines on the carousel card (max 3): cut ~${tl.cut} characters`);
    // The standalone-spot carousel lists every spot of the same second-level division (src/data/spotDistricts.json).
    if (!spotDistricts[s.id]) add(it, 'district', 'no entry in src/data/spotDistricts.json: run scripts/curation/build-spot-districts.py --only ' + s.id);
    // A pin written from memory is round (-39.0640, 174.0400: Paritutu Rock and Pouakai Tarns shipped that way, 1.5 and 5 km off).
    // Real points from a map feature have five or more decimal places.
    const dec = (v: number) => (String(v).split('.')[1] ?? '').length;
    if (s.coordinates && dec(s.coordinates.latitude) <= 3 && dec(s.coordinates.longitude) <= 3) add(it, 'pin', `round coordinates (${s.coordinates.latitude}, ${s.coordinates.longitude}): a memory pin; run scripts/curation/resolve-pin.py`);
    // Compared against every spot in the app, not just this region's: a copied point is often a neighbour's across a border.
    { const twins = SPOTS.filter(o => o.id !== s.id && metresBetween(s.coordinates, o.coordinates) < PIN_SHARED_M);
      if (twins.length) add(it, 'pin-shared', `within ${PIN_SHARED_M} m of ${twins.map(o => `${o.id} (${o.name}, ${metresBetween(s.coordinates, o.coordinates).toFixed(0)} m)`).join(', ')}: give each place its own point (COVERAGE.md → "Every place has its own point"), or if both are right, move the lesser one 25 m away`); }
    // A national park is a destination or a standalone spot, never a spot of another national park (Horton Falls NP shipped under Mount Kaputar NP).
    if (/national park/i.test(s.name) && s.destinationId && /national park/i.test(DESTINATIONS.find(d => d.id === s.destinationId)?.name ?? '')) add(it, 'park-in-park', `a national park under ${s.destinationId}: make it standalone or its own destination`);
    if ((s.costMin ?? 0) > 0 && !s.ticketUrl) add(it, 'no-ticket', 'charges but has no ticketUrl');
    // Neither priced nor free: the cost was never researched (Sea Life Sydney shipped this way, with no link either).
    if (!s.free && s.costMin == null) add(it, 'no-ticket', 'no cost and not free: research the price and the official site');
    if (!offline) {
      if (s.ticketUrl) { const t = await checkTicket(s.name, s.wiki, s.ticketUrl); if (t) add(it, 'ticketUrl', t); }
      // Only matters when the photo comes from the Wikipedia lookup: a hand-picked or supplied photo doesn't use the title.
      const key = spotPhotoTitle(s);
      if (!WIKI_IMAGE_OVERRIDES[key] && !EXTERNAL[key]) { const w = await checkWiki(key); if (w) add(it, 'wiki', w); }
    }
    if (it.checks.length) issues.push(it);
    if (++n % 10 === 0) console.error(`… ${n}/${spots.length} spots`);
  }
  for (const it of issues) console.log(`${it.kind} ${it.id} (${it.name}): ${it.checks.map(c => `${c.check}: ${c.detail}`).join('; ')}`);
  console.log(`${issues.length} of ${spots.length + [...destIds].length} entries need attention`);
  const out = one('--json');
  if (out) writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), scope: regionId ? { region: regionId } : { destinations: [...destIds] }, issues }, null, 1) + '\n');
})();
