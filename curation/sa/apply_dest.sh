#!/bin/sh
# Applies one approved WA destination: apply-destination.py with its picks, then the picks' crop points into PHOTO_SUBJECT.
#   sh curation/wa/apply_dest.sh <id>
set -e
f=$(ls curation/sa/quill/sa-*/dest-$1.final.json)
p=$(dirname "$f")/picks-$1.json
python3 scripts/curation/apply-destination.py "$f" --picks "$p" --allow-missing-why --allow-no-header
python3 - "$f" "$p" <<'EOF'
import json, re, sys
name = json.load(open(sys.argv[1]))['destination']['name']
subj = json.load(open(sys.argv[2])).get('subjects') or {}
ov = open('src/data/imageOverrides.ts').read()
a = ov.index('export const PHOTO_SUBJECT'); b = ov.index('\n};', a); blk = ov[a:b]
for k, v in subj.items():
    k = name if k == 'header' else k
    kk = json.dumps(k, ensure_ascii=False)
    line = f"  {kk}: {{ " + ', '.join(f'{c}: {v[c]}' for c in ('x', 'y', 'zoom') if c in v) + ' },'
    pat = re.compile(r'^  ' + re.escape(kk) + r': .*,$', re.M)
    blk = pat.sub(lambda m: line, blk, 1) if pat.search(blk) else blk + '\n' + line
    print('PHOTO_SUBJECT', line.strip())
open('src/data/imageOverrides.ts', 'w').write(ov[:a] + blk + ov[b:])
EOF
