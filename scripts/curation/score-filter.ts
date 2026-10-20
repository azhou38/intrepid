// Atlas's scored filter (PIPELINES.md → "Cost and speed"): replaces the enumerate → recall → skeptic chain's re-reading of
// every candidate with a script that decides the clear cases, so ONE agent judges only the marginal band.
//
//   npx tsx scripts/curation/score-filter.ts --region-dir curation/<branch>/region-<id>
//
// Reads candidates.json (after score-candidates.ts: `views`, `counted_sources`, `note`, `existing_spot`), writes
//   auto-decided.json   every script keep/reject with its rule (goes in the owner report); audit.json  a sample of them to re-decide blind
//   verdicts.auto.json  every candidate with { verdict: keep | reject | marginal, rule, reason } and its score
//   marginal.json       the marginal band only: what the coverage-judge agent reads (its verdicts replace the auto ones)
// Rules are COVERAGE.md → "What qualifies" in script form. Auto-reject only on an unambiguous ephemeral / civic / vehicle /
// minor-memorial name; auto-keep only on a strong score with no part-of or reject signal. Everything else is marginal, so
// the script never decides a doubtful case. Existing spots that would not clear the bar are listed as marginal too.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = (() => { const i = process.argv.indexOf('--region-dir'); return i >= 0 ? process.argv[i + 1] : ''; })();
if (!dir) { console.error('usage: score-filter.ts --region-dir <dir>'); process.exit(1); }

type Cand = { name: string; wiki?: string; counted_sources?: string[] | number; note?: string; views?: number; existing_spot?: string | null };
const cands: Cand[] = JSON.parse(readFileSync(resolve(dir, 'candidates.json'), 'utf8'));
const nSources = (c: Cand) => Array.isArray(c.counted_sources) ? c.counted_sources.length : (c.counted_sources ?? 0);

// Ephemeral, civic, vehicle/operator and minor-memorial names (COVERAGE.md "What qualifies" 2-4): reject without an agent.
const REJECT: [RegExp, string][] = [
  [/\b(festival|carnival|parade|regatta|rodeo|fair|eisteddfod)\b(?!.*\b(centre|center|ground|grounds|park|museum|stadium)\b)/i, 'an event, not a permanent place'],
  [/\b(farmers'?|growers'?|twilight|night|sunday|saturday|weekend)\s+markets?\b/i, 'a market that runs only some days'],
  [/^(?!.*\b(museum|gallery|garden|cave)\b).*\b(hospital|library|town hall|council chambers?|court ?house|post office|police station|primary school|high school|public school)\b/i, 'a civic building seen from the pavement'],
  [/\b(cenotaph|war memorial|memorial (hall|gates|park)|bridge of remembrance|honour roll|plaque)\b/i, 'a minor memorial'],
  [/\b(cruises?|ferry (service|terminal|timetable)|charters?|bus tours?|day tours?|tours? company|flights?|scenic flights?|helicopters?)\b/i, 'a vehicle or operator, not a place'],
  [/\b(church|chapel|uniting|anglican|presbyterian|catholic parish|community hall|rsl club|bowling club|golf club)\b/i, 'a local church or club'],
  [/\b(caravan park|holiday park|motel|hotel|backpackers|resort|hostel)\b/i, 'accommodation'],
];
// A candidate that is part of another place (an outlook on a track, a site inside a park) needs a judgement, never an auto-keep.
// Names that look like a feature or an area rather than a place to go (a river, a catchment, a parkland, a raceway): never an
// auto-keep, however good the score, because the judge must decide whether anything there is a visitor draw.
const NOT_AUTOKEEP = /motorsport|raceway|speedway|racecourse|\b(river|creek|estuary|catchment|parklands?|reserve|region|district|shire|valley|plains?|council|regional park|industrial|suburb)$/i;
// A lookout, point, hill or cave whose own source note puts it on a walk or track is usually a stop on that walk (Kim's Lookout, Pooles Lookout on Lord Howe).
const ON_A_WALK = /\b(lookout|viewpoint|view point|point|hill|cave|pool|beach)$/i;
const WALK_NOTE = /\b(walk|track|trail|climb|hike|route|loop)\b/i;
const PART_OF = /\b(part of|within|inside|sub-?site|section of|lookout on|arm of|beach within|a stop on)\b/i;

const out: any[] = [];
for (const c of cands) {
  const n = nSources(c), views = c.views ?? 0, text = `${c.name} ${c.note ?? ''}`, onAWalk = ON_A_WALK.test(c.name) && WALK_NOTE.test(c.note ?? '');
  const base = { name: c.name, wiki: c.wiki, views, counted_sources: n, existing_spot: c.existing_spot ?? null };
  const rej = REJECT.find(([re]) => re.test(c.name));
  if (c.existing_spot) {
    // Re-judge existing spots on the same bar: a strong one is simply kept, a weak one is flagged for the agent.
    out.push({ ...base, verdict: n >= 1 && views >= 300 ? 'keep' : 'marginal', rule: 'existing', reason: n >= 1 && views >= 300 ? 'existing spot with a counted source' : 'existing spot with no counted source or little interest: re-judge' });
    continue;
  }
  if (rej && n < 2) { out.push({ ...base, verdict: 'reject', rule: 'auto-reject', reason: rej[1] }); continue; }
  if (rej) { out.push({ ...base, verdict: 'marginal', rule: 'reject-signal-with-sources', reason: `${rej[1]}, but ${n} counted sources name it` }); continue; }
  // No counted source: never a script reject. The judge re-looks for a source first: a second-tier stop a real source names must not
  // be lost for want of a counted link in the candidate list (Bass Point, Rouse Hill House were reviews, not rejects, for this reason).
    if (n === 0) { out.push({ ...base, verdict: 'marginal', rule: 'no-counted-source', reason: `no counted source in the list (${views} page views): the judge re-looks for one before rejecting` }); continue; }
  const strong = (n >= 2 && views >= 1000) || n >= 3 || (n >= 1 && views >= 20000);
  if (strong && !PART_OF.test(text) && !NOT_AUTOKEEP.test(c.name) && !onAWalk) { out.push({ ...base, verdict: 'keep', rule: 'auto-keep', reason: `${n} counted sources, ${views} page views` }); continue; }
  out.push({ ...base, verdict: 'marginal', rule: PART_OF.test(text) || onAWalk ? 'part-of-signal' : NOT_AUTOKEEP.test(c.name) ? 'feature-or-area' : 'weak-score', reason: PART_OF.test(text) || onAWalk ? 'may be a stop on a walk or part of a larger place' : NOT_AUTOKEEP.test(c.name) ? 'a feature or area, not obviously a place to go' : `${n} counted source(s), ${views} page views` });
}
writeFileSync(resolve(dir, 'verdicts.auto.json'), JSON.stringify(out, null, 1) + '\n');
const marginal = out.filter(o => o.verdict === 'marginal').map(o => ({ ...o, candidate: cands.find(c => c.name === o.name) }));
writeFileSync(resolve(dir, 'marginal.json'), JSON.stringify(marginal, null, 1) + '\n');
// Quality guard: every automatic decision is listed (auto-decided.json, for the report to the owner) and a deterministic ~12% sample
// (at least 5, evenly spaced by name order) goes to audit.json for the judge to re-decide blind. The judge reports its disagreements; more
// than 1 in 10 means the script's rules do not fit this region, so the region is rerun through the full recall + skeptic path.
const auto = out.filter(o => o.verdict !== 'marginal').sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(resolve(dir, 'auto-decided.json'), JSON.stringify(auto, null, 1) + '\n');
const size = Math.min(auto.length, Math.max(5, Math.ceil(auto.length * 0.12)));   // ~12% of the script's decisions, at least 5
const step = Math.max(1, Math.floor(auto.length / size));
writeFileSync(resolve(dir, 'audit.json'), JSON.stringify(auto.filter((_, i) => i % step === 0).slice(0, size).map(o => ({ name: o.name, wiki: o.wiki, views: o.views, counted_sources: o.counted_sources, script_verdict: o.verdict, rule: o.rule, candidate: cands.find(c => c.name === o.name) })), null, 1) + '\n');
const tally = (v: string) => out.filter(o => o.verdict === v).length;
console.log(`${out.length} candidates: ${tally('keep')} auto-keep, ${tally('reject')} auto-reject, ${tally('marginal')} marginal (the only ones an agent reads)`);
if (existsSync(resolve(dir, 'verdicts.json'))) {
  // Calibration against an earlier agent run, when one exists: how often the script's clear cases agree with it.
  const prior: any[] = JSON.parse(readFileSync(resolve(dir, 'verdicts.json'), 'utf8'));
  const by = new Map(prior.map(p => [p.name, p.verdict]));
  let agree = 0, clash = 0; const clashes: string[] = [];
  for (const o of out) {
    const p = by.get(o.name); if (!p || o.verdict === 'marginal') continue;
    if (p === o.verdict) agree++; else { clash++; clashes.push(`${o.name}: script ${o.verdict} (${o.rule}), agent ${p}`); }
  }
  console.log(`vs verdicts.json: ${agree} agree, ${clash} differ`);
  for (const c of clashes.slice(0, 25)) console.log('  ' + c);
}
