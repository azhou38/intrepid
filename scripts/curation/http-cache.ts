// A shared on-disk cache for the curation pipelines' web fetches (PIPELINES.md → "Cost and speed"). Atlas, Lens and
// Quill fetch many of the same pages (Wikivoyage, DOC, operator sites, Wikipedia and Commons APIs), and every agent
// paces itself to about one request a second, so a page fetched once is read from here by every later step and every
// later run instead of being fetched (and waited for) again.
//
// Pages live in .cache/curation/http/ (not committed), one JSON file per URL. A cached answer is used while it is
// younger than `maxAgeDays` (default 14; failures are kept for a day only). Requests to the same host are spaced
// GAP_MS apart and a 429 backs off 30/60/120/240 s.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

export const UA = 'IntrepidApp-Curation/1.0 (alexzhou38@gmail.com)';
const DIR = resolvePath(process.cwd(), '.cache/curation/http');
const GAP_MS = 1000;
const FAIL_MAX_AGE_DAYS = 1;

export type Fetched = { url: string; finalUrl: string; status: number; contentType: string; body: string; fetchedAt: number; fromCache: boolean };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const lastByHost = new Map<string, number>();
async function pace(host: string) {
  const wait = (lastByHost.get(host) ?? 0) + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastByHost.set(host, Date.now());
}
const fileFor = (url: string) => resolvePath(DIR, createHash('sha1').update(url).digest('hex') + '.json');

export function readCached(url: string, maxAgeDays = 14): Fetched | null {
  const f = fileFor(url);
  if (!existsSync(f)) return null;
  try {
    const hit = JSON.parse(readFileSync(f, 'utf8')) as Fetched;
    const ok = hit.status >= 200 && hit.status < 400;
    const age = (Date.now() - hit.fetchedAt) / 86_400_000;
    if (age > (ok ? maxAgeDays : Math.min(maxAgeDays, FAIL_MAX_AGE_DAYS))) return null;
    return { ...hit, fromCache: true };
  } catch { return null; }
}

export async function cachedGet(url: string, opts: { maxAgeDays?: number; accept?: string } = {}): Promise<Fetched> {
  const hit = readCached(url, opts.maxAgeDays ?? 14);
  if (hit) return hit;
  const host = new URL(url).host;
  let res: Response | null = null, body = '', status = 0, finalUrl = url, contentType = '';
  for (let i = 0; i < 5; i++) {
    await pace(host);
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: opts.accept ?? '*/*' }, redirect: 'follow' });
    } catch (e) { status = 0; body = String(e); res = null; break; }
    if (res.status === 429 && i < 4) { await sleep(30_000 * 2 ** i); continue; }
    break;
  }
  if (res) {
    status = res.status; finalUrl = res.url || url; contentType = res.headers.get('content-type') ?? '';
    body = await res.text().catch(() => '');
  }
  const out: Fetched = { url, finalUrl, status, contentType, body, fetchedAt: Date.now(), fromCache: false };
  mkdirSync(DIR, { recursive: true });
  writeFileSync(fileFor(url), JSON.stringify(out));
  return out;
}

export async function cachedJson<T = any>(url: string, maxAgeDays = 14): Promise<T | null> {
  const r = await cachedGet(url, { maxAgeDays, accept: 'application/json' });
  if (r.status < 200 || r.status >= 300) return null;
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

// Readable text of an HTML page: the <title>, then the body with scripts, styles and tags removed.
export function htmlTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}
export function htmlToText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(body).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
function decodeEntities(s: string): string {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// A page that answered but isn't really the page: a captcha or bot wall (many tourism and council sites).
export function looksBlocked(r: Fetched): boolean {
  if (r.status === 401 || r.status === 403 || r.status === 429 || r.status === 503) return true;
  // Judged on the page title, not the body: ordinary pages (MediaWiki among them) mention "captcha" in their scripts.
  return /just a moment|attention required|access denied|are you a robot|captcha|security check|radware|bot protection/i.test(htmlTitle(r.body));
}
