#!/bin/sh
# Applies one NSW region end to end: spots (photoless), districts, photo verdicts, commit, push, link.
# usage: sh scripts/curation/nsw-apply-all.sh <region-id> "<commit message>"
set -e
R=$1
python3 scripts/curation/apply-region.py $R --photoless 2>&1 | tail -4
ids=$(python3 -c "
import json
print(','.join(e['id'] for e in json.load(open('curation/nz-rest/region-$R/apply-placement.json'))['placements']))")
python3 scripts/curation/build-nsw-districts.py --only "$ids"
python3 scripts/curation/nsw-judge2-to-lens.py $R
JUDGE_GLOB="curation/nz-rest/lens/judge-2-C-nsw-$R.json" python3 scripts/curation/apply-photos.py stage
sh scripts/curation/nsw-commit-link.sh "$2"
