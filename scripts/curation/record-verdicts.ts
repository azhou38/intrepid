// Records Lens's outcome per photo slot in scripts/curation/photo-verdicts.json, so a later run skips every slot whose
// photo is already accepted (lens-triage.ts reads it). Commit the file with the data change.
//
//   npx tsx scripts/curation/record-verdicts.ts --task <group>/task.json --judge1 <group>/judge-1.json [--judge2 <group>/judge-2.json]
//   npx tsx scripts/curation/record-verdicts.ts --proven <group>/task.json   (slots photo-prove.py proved; by "script")
//   npx tsx scripts/curation/record-verdicts.ts --owner <slot> <file>     (a photo the owner supplied or chose)
//
// What counts as accepted (PIPELINES.md → Pipeline B):
//   keep-current from the first judge → the current photo is accepted (no second judge needed: nothing changes);
//   a new file both judges chose → that file is accepted, once it's applied (record after applying);
//   a split or "none" → nothing recorded, so the slot comes back next run.
// External photos are recorded as `external:<file name>`, the form lens-triage reports.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const one = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const PATH = 'scripts/curation/photo-verdicts.json';
const book: Record<string, { file: string; verdict: string; by: string; at: string }> = existsSync(PATH) ? JSON.parse(readFileSync(PATH, 'utf8')) : {};
const at = new Date().toISOString().slice(0, 10);
const save = () => {
  const sorted = Object.fromEntries(Object.entries(book).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(PATH, JSON.stringify(sorted, null, 1) + '\n');
};

const ownerIdx = args.indexOf('--owner');
if (ownerIdx >= 0) {
  const slot = args[ownerIdx + 1], file = args[ownerIdx + 2];
  if (!slot || !file) { console.error('usage: --owner <slot> <file>'); process.exit(1); }
  book[slot] = { file, verdict: 'accept', by: 'owner', at };
  save(); console.log(`recorded ${slot}: ${file} (owner)`);
  process.exit(0);
}

// Photos the script proved (photo-prove.py set their status to `proven`): recorded as accepted by "script", so later runs skip them.
const provenIdx = args.indexOf('--proven');
if (provenIdx >= 0) {
  const task = JSON.parse(readFileSync(args[provenIdx + 1], 'utf8'));
  let n = 0;
  for (const s of task.slots) if (s.status === 'proven' && s.current) { book[s.slot] = { file: s.current.file, verdict: 'accept', by: 'script', at }; n++; }
  save(); console.log(`recorded ${n} proven slots (by script)`);
  process.exit(0);
}

const taskPath = one('--task'), j1Path = one('--judge1'), j2Path = one('--judge2');
if (!taskPath || !j1Path) { console.error('usage: --task task.json --judge1 judge-1.json [--judge2 judge-2.json]'); process.exit(1); }
const task = JSON.parse(readFileSync(taskPath, 'utf8'));
const j1 = JSON.parse(readFileSync(j1Path, 'utf8'));
const j2 = j2Path && existsSync(j2Path) ? JSON.parse(readFileSync(j2Path, 'utf8')) : {};
const choiceOf = (j: any, slot: string): string | undefined => (j?.[slot] ?? j?.slots?.[slot])?.choice;

let kept = 0, changed = 0, open = 0;
for (const s of task.slots as { slot: string; current: { file: string } | null }[]) {
  const c1 = choiceOf(j1, s.slot), c2 = choiceOf(j2, s.slot);
  if (c1 === 'keep-current' && s.current) {
    book[s.slot] = { file: s.current.file, verdict: 'accept', by: 'judge-1', at }; kept++;
  } else if (c1 && !c1.startsWith('none') && c1 !== 'keep-current' && c1 === c2) {
    book[s.slot] = { file: c1.replace(/_/g, ' '), verdict: 'accept', by: 'judge-1+judge-2', at }; changed++;
  } else if (c1 !== undefined) {
    open++;
  }
}
save();
console.log(`recorded ${kept} kept, ${changed} changed (both judges); ${open} left open for the next run`);
