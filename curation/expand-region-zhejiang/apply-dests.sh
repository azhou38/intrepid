#!/bin/zsh
# usage: apply-dests.sh [--dry-run]; adds the nine Zhejiang destinations with no photos yet (placeholders; Lens fills them)
cd "$(dirname $0)/../.."
for d in hangzhou wuzhen ningbo shaoxing mount-putuo quzhou anji huzhou jiaxing; do
  f=curation/expand-region-zhejiang/dest-copy/$d.final.json
  n=$(python3 -c "import json;print(len(json.load(open('$f'))['destination']['whyVisit']))")
  python3 -c "import json;json.dump({'why':['']*$n},open('/tmp/zj-picks-$d.json','w'))"
  python3 scripts/curation/apply-destination.py $f --allow-no-header --allow-missing-why --picks /tmp/zj-picks-$d.json "$@" 2>&1 | tail -4
done
