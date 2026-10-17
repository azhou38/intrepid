// Fetch a page through the shared curation cache (see http-cache.ts). Agents use this instead of WebFetch for source
// pages, so a page any step or earlier run already fetched costs nothing and waits for nothing.
//
//   npx tsx scripts/curation/fetch.ts <url> [--raw] [--max-age-days N] [--max-chars N]
//
// Prints the status line, the final URL and the page title, then the page as text (or the raw body with --raw; JSON is
// always printed raw). Exits 2 when the page is missing, blocked (captcha / 403) or unreachable.
import { cachedGet, htmlTitle, htmlToText, looksBlocked } from './http-cache';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
const url = process.argv[2];
if (!url || url.startsWith('--')) { console.error('usage: fetch.ts <url> [--raw] [--max-age-days N] [--max-chars N]'); process.exit(1); }

(async () => {
  const r = await cachedGet(url, { maxAgeDays: Number(arg('--max-age-days') ?? 14) });
  const blocked = looksBlocked(r);
  const isJson = /json/.test(r.contentType) || /^\s*[[{]/.test(r.body.slice(0, 50));
  const title = isJson ? '' : htmlTitle(r.body);
  const max = Number(arg('--max-chars') ?? 60000);
  console.log(`status ${r.status}${blocked ? ' (BLOCKED: captcha/bot wall — check in a real browser)' : ''}${r.fromCache ? ' [cached]' : ''}`);
  console.log(`final ${r.finalUrl}`);
  if (title) console.log(`title ${title}`);
  console.log('---');
  const out = isJson || process.argv.includes('--raw') ? r.body : htmlToText(r.body);
  console.log(out.length > max ? out.slice(0, max) + `\n… [truncated at ${max} chars]` : out);
  if (r.status < 200 || r.status >= 400 || blocked) process.exit(2);
})();
