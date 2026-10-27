# SA run: brief for the blind second judge of the external-photo slots

Repo: /Users/alexzhou/Developer/mobile-wellington (run commands from there). Role: .claude/agents/image-judge.md ("Second judge"). Rules: IMAGES.md.
You are given one or more batch folders `curation/sa/search/<B>/`. Judge ONLY the slots listed in each `judge2-task.json` (the first judge proposed a photo for each). Work BLIND:
NEVER read `judge-1.json`. Inputs per batch: `in.json` (slot facts: name, destination, category, bio, coordinates), `candidates.json` ({ slot: [ {local (path from repo root), url, page, width, height, licence, by, source, note} ] }).
For each listed slot, open every candidate image with the Read tool, pick your own best candidate against the four checks (right place; shows the named thing itself, not a neighbouring sight, sign or stand-in;
good, wide, well-lit real colour photograph, people/animals in frame fine when the place is the subject; unique subject among neighbouring spots) and the rules: width >= 960, no watermark/overlay, free licence
(CC0/BY/BY-SA, or an official photo marked "permission not confirmed": acceptable, flagged), never an ND/NC licence. Where its page can be loaded (`npx tsx scripts/curation/fetch.ts <url>`) confirm the caption/geotag; if it can't be loaded say you judged from the image alone.
For a choice with aspect outside 0.8-1.25 or an off-centre subject, run `python3 scripts/curation/hero-crop.py <local> --x X --y Y [--zoom Z] --out <a scratch file>` and LOOK at the crop; record `hero_crop`. If nothing passes, `none: <why>`.
Write `curation/sa/search/<B>/judge-2.json` = { "<slot>": { "decision": "choice|none", "choice": "<local path>" | "none: <why>", "hero_crop": "ok"|{x,y,zoom?}|"fail: <why>", "licence_note": "...", "reason": "<one line>" } } per batch; validate it parses.
Final message at most 6 lines. Never paste JSON or images. Leave no files in the repo root.
