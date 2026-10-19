#!/usr/bin/env python3
"""After nsw-add-destinations.py: a destination whose name equals a removed spot's name (Port Macquarie's spot keys, Bathurst...) can have
its header override or subject point clobbered by that spot's old entry. Re-sets, for the given destinations, the WIKI_IMAGE_OVERRIDES
header (or removes it for a header-less one), the PHOTO_SUBJECT point, and drops a stale externalPhotos entry under the destination's name.
  python3 scripts/curation/nsw-repair-overrides.py <id>..."""
import json, glob, re, sys
base = 'curation/nz-rest/nsw-destinations/'
judged = {}
for f in glob.glob(base + 'judge-tasks/batch-*.judged.json'): judged.update(json.load(open(f)))
p = 'src/data/imageOverrides.ts'; ov = open(p).read()
q = lambda s: json.dumps(s, ensure_ascii=False)
def blk(ov, name):
    a = ov.index('export const ' + name); b = ov.index('\n};', a); return a, b
ext = json.load(open('src/data/externalPhotos.json')); extch = False
for did in sys.argv[1:]:
    name = json.load(open(base + did + '.final.json'))['destination']['name']; h = judged[did]['header']; k = q(name)
    pat = re.compile(r'^  ' + re.escape(k) + r': .*,$\n?', re.M)
    a, b = blk(ov, 'PHOTO_SUBJECT'); part = re.sub(r'^  ' + re.escape(k) + r': "[^"]*",$\n?', '', ov[a:b], flags=re.M)
    if h['choice'].lower().startswith('none') or not isinstance(h.get('hero_crop'), dict): part = pat.sub('', part)
    else:
        hc = h['hero_crop']; line = f"  {k}: {{ " + ', '.join(f'{x}: {hc[x]}' for x in ('x', 'y', 'zoom') if hc.get(x) is not None) + ' },'
        part = pat.sub(line + '\n', part, 1) if pat.search(part) else part + '\n' + line
    ov = ov[:a] + part + ov[b:]
    a, b = blk(ov, 'WIKI_IMAGE_OVERRIDES'); part = ov[a:b]
    if h['choice'].lower().startswith('none'): part = pat.sub('', part)
    else:
        line = f"  {k}: {q(re.sub('^File:', '', h['choice']))},"
        part = pat.sub(line + '\n', part, 1) if pat.search(part) else part + '\n' + line
    ov = ov[:a] + part + ov[b:]
    if name in ext: del ext[name]; extch = True
open(p, 'w').write(ov.replace(',\n\n  "', ',\n  "'))
if extch: json.dump(ext, open('src/data/externalPhotos.json', 'w'), indent=1, ensure_ascii=False)
print('repaired', len(sys.argv) - 1)
