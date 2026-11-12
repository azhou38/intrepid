#!/usr/bin/env python3
"""Runs one Overpass query through the mirrors that answer from this network, with retries (a busy mirror answers 504 to most requests).

  python3 scripts/curation/overpass-query.py '<overpass ql>'      (or the query on stdin with '-')

Prints the JSON the server returned, or exits 1 with 'unreachable' (then retry later; it is not evidence the feature does not exist).
overpass-api.de refuses some networks; maps.mail.ru's mirror is global. Keep queries small (an `around:` or a short bbox, `out center tags 60;`)."""
import subprocess, sys, time, json
q = sys.stdin.read() if sys.argv[1:] == ['-'] else sys.argv[1]
MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
for i in range(8):
    r = subprocess.run(['curl', '-s', '-m', '60', '-A', 'IntrepidApp-Curation/1.0', '--data-urlencode', 'data=' + q, MIRRORS[i % 2 if i < 2 else 1]], capture_output=True, text=True)
    try:
        json.loads(r.stdout); print(r.stdout); sys.exit(0)
    except Exception:
        time.sleep(2 + i)
print('unreachable'); sys.exit(1)
