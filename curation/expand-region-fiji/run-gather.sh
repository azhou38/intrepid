#!/bin/bash
cd /Users/alexzhou/Developer/mobile/.claude/worktrees/bold-mclaren-4328f3
set -a; . /Users/alexzhou/Developer/mobile/.env.local; set +a
for g in curation/expand-region-fiji/lens/*/; do
  echo "== $g"
  python3 scripts/curation/photo-prove.py ${g}task.json 2>&1 | tail -1
  python3 scripts/curation/gather-photo-candidates.py $g 2>&1 | tail -2
done
echo ALLDONE
