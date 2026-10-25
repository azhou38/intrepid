#!/bin/sh
# Applies the ACT region's spots, one commit per destination (the destinations must already be in src/data: apply_dest.sh).
#   sh curation/act/apply_spots.sh
set -e
python3 scripts/curation/build-apply-placement.py act-canberra --evidence curation/act >/dev/null
python3 - > /tmp/act-groups-$$ <<'PY'
import json, re
F = json.load(open('curation/act/quill/act-canberra/final.json'))
for d in ('canberra', 'namadgi-national-park'):
    ids = [i for i in F['spots'] if re.fullmatch(re.escape(d) + r'-\d+', i)]
    if ids: print(d, d, ','.join(ids))
PY
while read did dname ids; do
  python3 scripts/curation/apply-region.py act-canberra --photoless --evidence curation/act --only "$ids" | tail -2
  n=$(echo $ids | tr ',' '\n' | wc -l | tr -d ' ')
  python3 scripts/curation/build-spot-districts.py --only "$ids" | tail -1
  git add src/data/spots.ts src/data/spotDistricts.json src/data/imageOverrides.ts
  git commit -q -m "ACT: $dname spots ($n)

Pins resolved (resolve-pin / OSM features), facts and copy from Quill, every place
judged by the coverage judges. Photos follow in the Lens spot pass.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
  echo "committed: $dname ($n)"
done < /tmp/act-groups-$$
rm -f /tmp/act-groups-$$
