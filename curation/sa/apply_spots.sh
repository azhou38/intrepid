#!/bin/sh
# Applies one SA region's spots, one commit per destination and one for its standalone spots.   sh curation/sa/apply_spots.sh <region>
r=$1
python3 scripts/curation/build-apply-placement.py sa-$r --evidence curation/sa >/dev/null
python3 - "$r" > /tmp/sa-groups-$$ <<'PY'
import json, re, sys
r = sys.argv[1]
P = json.load(open(f'curation/sa/plan/{r}.json')); F = json.load(open(f'curation/sa/quill/sa-{r}/final.json'))
dests = re.findall(r"^\s*id: '([a-z0-9-]+)', name: '([^']+)'", open('src/data/destinations.ts').read(), re.M)
names = dict(dests)
done = set()
for d in P['destinations']:
    ids = [i for i in F['spots'] if re.fullmatch(re.escape(d['id']) + r'-\d+', i)]
    done |= set(ids)
    if ids: print(d['id'], d['name'].replace(' ', '_'), ','.join(ids))
# spots moved into another destination (e.g. leigh-creek-1 -> ikara-flinders-ranges-N) are numbered spots of a destination in another plan; group them by prefix
rest = [i for i in F['spots'] if i not in done]
bypref = {}
for i in rest:
    m = re.fullmatch(r'([a-z0-9-]+)-(\d+)', i)
    if m and m.group(1) in names: bypref.setdefault(m.group(1), []).append(i)
for p, ids in bypref.items(): print(p, names[p].replace(' ', '_'), ','.join(ids)); done |= set(ids)
st = [i for i in F['spots'] if i not in done]
if st: print('_standalone', 'standalone', ','.join(st))
PY
while read did dname ids; do
  python3 scripts/curation/apply-region.py sa-$r --photoless --evidence curation/sa --only "$ids" | tail -2
  n=$(echo $ids | tr ',' '\n' | wc -l | tr -d ' ')
  python3 scripts/curation/build-sa-lgas.py --only "$ids" | tail -1
  git add src/data/spots.ts src/data/spotDistricts.json src/data/imageOverrides.ts scripts/coverage-regions.json
  if [ "$did" = "_standalone" ]; then msg="SA $r: $n standalone spots"; else msg="SA: $(echo $dname | tr '_' ' ') spots ($n)"; fi
  git commit -q -m "$msg

Pins from OpenStreetMap features and sources (weak ones flagged in curation/sa/quill/weak-pins.json), facts and copy from Quill.
Photos follow in the Lens spot pass.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && echo "committed: $msg"
done < /tmp/sa-groups-$$
rm -f /tmp/sa-groups-$$
