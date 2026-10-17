// Finds an official website for spots that have none (`ticketUrl` unset), from Wikidata's "official website" (P856) on the
// spot's Wikipedia article. A spot whose title redirects to a different article (so the site would be a broader place's) is
// skipped, and every URL must answer before it is proposed. Writes proposals to scripts/official-site-proposals.json; it
// never edits spots.ts. Needs network access.
//   npx tsx scripts/find-official-sites.ts [--country NZ] [--limit 50]
import { writeFileSync } from 'node:fs';
import { SPOTS, spotPhotoTitle } from '../src/data/spots';
import { DESTINATIONS } from '../src/data/destinations';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
const country = arg('--country'), limit = Number(arg('--limit') ?? Infinity);
const UA = 'IntrepidApp-Sites/1.0 (personal hobby project; alexzhou38@gmail.com)';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cc = (s: typeof SPOTS[number]) => s.countryCode ?? DESTINATIONS.find(d => d.id === s.destinationId)?.countryCode;

async function api(url: string) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.status === 429 || r.status >= 500) { await sleep(3000 * 2 ** i); continue; }
    return r.json();
  }
  return null;
}
async function alive(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IntrepidApp)' }, signal: AbortSignal.timeout(12000) });
    return r.status < 400 ? r.url : null;
  } catch { return null; }
}

async function main() {
  const todo = SPOTS.filter(s => !s.ticketUrl && (!country || cc(s) === country)).slice(0, limit);
  console.log(`${todo.length} spots without an official site`);
  const out: Record<string, { name: string; url: string; via: string }> = {}; const unresolved: string[] = [];
  for (const s of todo) {
    const title = spotPhotoTitle(s);
    const q = await api(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(title)}`);
    const page: any = q && Object.values(q.query?.pages ?? {})[0];
    const redirected = (q?.query?.redirects ?? []).length > 0;
    const qid = page?.pageprops?.wikibase_item;
    if (!qid || redirected) { unresolved.push(s.id); await sleep(150); continue; }
    const w = await api(`https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=${qid}&property=P856`);
    const url: string | undefined = w?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
    if (!url) { unresolved.push(s.id); await sleep(150); continue; }
    const live = await alive(url);
    if (!live) { unresolved.push(s.id); console.log(`  dead: ${s.name} ${url}`); continue; }
    out[s.id] = { name: s.name, url, via: `wikidata ${qid}` };
    console.log(`  ✓ ${s.name}: ${url}`);
    await sleep(150);
  }
  writeFileSync('scripts/official-site-proposals.json', JSON.stringify({ found: out, unresolved }, null, 1) + '\n');
  console.log(`\n${Object.keys(out).length} found, ${unresolved.length} still without a site.`);
}
main();
