// Joins the scripted verdicts (score-filter.ts) and the coverage-judge's (marginal band + audit sample) into the files the proposer
// and apply scripts read, and enforces the quality guard.
//
//   npx tsx scripts/curation/merge-verdicts.ts --region-dir curation/<branch>/region-<id>
//
// Reads  verdicts.auto.json (every candidate: script verdict), judged.json (the judge's verdicts for the marginal band:
//        [{ name, verdict, reason, objection? }]) and audited.json (the judge's blind re-decisions of the audit sample:
//        [{ name, verdict, reason }]).
// Writes verdicts.json  every candidate's final verdict (the judge's replaces the script's for the marginal band)
//        skeptic.json   the keeps and reviews in the format the proposer reads (photo_verdict "none": photos are Lens's job)
//        audit-report.json  agreement on the audit sample
// Guard: if the judge disagrees with more than 1 in 10 of the audited script decisions, exit 2 and say so: the script's rules do not
// fit this region, so rerun it through the full recall + skeptic path (coverage-judge on EVERY candidate) before accepting.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const i = process.argv.indexOf('--region-dir');
const dir = i >= 0 ? process.argv[i + 1] : '';
if (!dir) { console.error('usage: merge-verdicts.ts --region-dir <dir>'); process.exit(1); }
const read = (f: string, dflt: any) => existsSync(resolve(dir, f)) ? JSON.parse(readFileSync(resolve(dir, f), 'utf8')) : dflt;
const auto: any[] = read('verdicts.auto.json', []), judged: any[] = read('judged.json', []), audited: any[] = read('audited.json', []);
const judgedBy = new Map(judged.map(j => [j.name, j]));

const marginal = auto.filter(a => a.verdict === 'marginal');
const unjudged = marginal.filter(a => !judgedBy.has(a.name));
if (unjudged.length) { console.error(`${unjudged.length} marginal candidates have no judge verdict (silence is not allowed): ${unjudged.slice(0, 8).map(u => u.name).join('; ')}…`); process.exit(1); }

const finalRows = auto.map(a => {
  const j = judgedBy.get(a.name);
  const v = j ? j.verdict : a.verdict;
  return { name: a.name, existing: !!a.existing_spot, spot_id: a.existing_spot ?? null, verdict: v, reason: j ? j.reason : a.reason, decided_by: j ? 'judge' : 'script', views: a.views, counted_sources: a.counted_sources };
});
writeFileSync(resolve(dir, 'verdicts.json'), JSON.stringify(finalRows, null, 1) + '\n');
writeFileSync(resolve(dir, 'skeptic.json'), JSON.stringify(finalRows.filter(r => r.verdict !== 'reject').map(r => ({ name: r.name, verdict: r.verdict, objection: judgedBy.get(r.name)?.objection ?? null, photo_verdict: 'none', photo: null, photo_reason: 'photos are judged by Lens' })), null, 1) + '\n');

const scriptByName = new Map(auto.map(a => [a.name, a]));
const rows = audited.map(a => ({ name: a.name, script: scriptByName.get(a.name)?.verdict, judge: a.verdict, agree: scriptByName.get(a.name)?.verdict === a.verdict, reason: a.reason }));
const differ = rows.filter(r => !r.agree);
writeFileSync(resolve(dir, 'audit-report.json'), JSON.stringify({ audited: rows.length, differ: differ.length, differences: differ }, null, 1) + '\n');
const t = (v: string) => finalRows.filter(r => r.verdict === v).length;
console.log(`${finalRows.length} candidates: ${t('keep')} keep, ${t('reject')} reject, ${t('review')} review (${finalRows.filter(r => r.decided_by === 'script').length} decided by the script, ${judged.length} by the judge)`);
console.log(`audit: ${rows.length} script decisions re-judged blind, ${differ.length} differ`);
for (const d of differ) console.log(`  ${d.name}: script ${d.script}, judge ${d.judge} (${d.reason})`);
// Full path (the judge decided every candidate, e.g. after the audit failed): nothing is left for the script, so no audit is needed.
if (!rows.length && finalRows.some(r => r.decided_by === 'script')) { console.error('no audited.json: the audit sample (audit.json) must be re-judged before the run is accepted'); process.exit(2); }
if (rows.length && differ.length / rows.length > 0.1) { console.error('MORE THAN 1 IN 10 differ: the script rules do not fit this region; rerun the full recall + skeptic path before accepting'); process.exit(2); }
