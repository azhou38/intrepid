#!/usr/bin/env python3
"""Validates a Quill final.json: parses, every bio >=10 words and fits three lines on the spot card.
  python3 scripts/curation/check-final-bios.py curation/nz-rest/quill/<region>/final.json"""
import json, subprocess, sys
d = json.load(open(sys.argv[1]))
bad = 0
for k, v in d['spots'].items():
    r = subprocess.run(['python3', 'scripts/curation/bio-fit.py', '--text', v['bio']], capture_output=True, text=True).stdout
    lines = [l for l in r.splitlines() if l.strip().startswith('|')]
    w = len(v['bio'].split())
    if len(lines) > 3 or '…' in r or w < 10 or 'fits' not in r:
        bad += 1; print('BAD', k, w, len(lines), v['bio'])
print(len(d['spots']), 'spots,', bad, 'bad')
