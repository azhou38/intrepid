"""Applies a Pipeline A coverage result to src/data: for one destination it reads curation/<branch>/<dest>/coverage-proposal.json
and coverage-skeptic.json and appends every new spot the skeptic KEPT and whose photo it ACCEPTED to src/data/spots.ts (next
free id, never reusing one from git history; standalone spots get their country fields), takes the skeptic's coordinate, bio
and link corrections, and writes each photo into src/data/imageOverrides.ts. Spots without an accepted photo are listed, not
added: find a photo (IMAGES.md "When Commons has no suitable photo") and rerun.

  python3 scripts/apply-coverage.py <destination-id> [--standalone "Name,Other Name"]

Existing-spot fixes in the skeptic file (moves, renames, links, hours) are applied by hand. Run from the repo root, then
scripts/build-image-manifest.ts, tsc, audit-spot-coordinates.ts and commit one destination per commit.
"""
import json, re, sys, subprocess
import re,sys,json,subprocess
def setov(key,file):
    p='src/data/imageOverrides.ts';s=open(p).read()
    k=json.dumps(key,ensure_ascii=False); v=json.dumps(file,ensure_ascii=False)
    pat=re.compile(r'^  '+re.escape(k)+r': .*,$',re.M)
    if pat.search(s): s=pat.sub(f'  {k}: {v},',s,1)
    else:
        i=s.index('};',s.index('export const WIKI_IMAGE_OVERRIDES'))
        s=s[:i]+f'  {k}: {v},\n'+s[i:]
    open(p,'w').write(s)
def whyswap(old,new):
    p='src/data/destinations.ts';s=open(p).read()
    assert old in s; open(p,'w').write(s.replace(json.dumps(old,ensure_ascii=False),json.dumps(new,ensure_ascii=False),1))


def ids_ever():
    out=subprocess.run("git log -p -- src/data/spots.ts | grep -o \"id: '[a-z0-9-]*'\" | sort -u",shell=True,capture_output=True,text=True).stdout
    return set(re.findall(r"id: '([^']+)'",out))
def q(s):  # TS string literal
    return json.dumps(s,ensure_ascii=False)
def spot_line(sid,dest,e,standalone=None):
    c=e['coordinates']
    f=[f"id: '{sid}'"]
    if dest: f.append(f"destinationId: '{dest}'")
    if standalone: f.append("country: 'New Zealand', countryCode: 'NZ', continent: 'Oceania', timezone: 'Pacific/Auckland'")
    f.append(f"name: {q(e['name'])}")
    if e.get('wiki'): f.append(f"wiki: {q(e['wiki'])}")
    f.append(f"icon: {q(e['icon'])}")
    f.append(f"coordinates: {{ latitude: {c['latitude']}, longitude: {c['longitude']} }}")
    f.append(f"category: '{e['category']}'")
    f.append(f"bio: {q(e['bio'])}")
    f.append(f"hours: {q(e['hours'])}")
    f.append(f"visitHoursMin: {e['visitHoursMin']}, visitHoursMax: {e['visitHoursMax']}")
    if e.get('free'): f.append("free: true")
    elif e.get('costMin') is not None: f.append(f"costMin: {e['costMin']}, costMax: {e['costMax']}, currency: '{e.get('currency') or 'NZD'}'")
    if e.get('ticketUrl'): f.append(f"ticketUrl: '{e['ticketUrl']}'")
    return "  { "+", ".join(f)+" },"
def insert_spots(dest,lines):
    p='src/data/spots.ts';L=open(p).read().split('\n')
    if dest:
        idx=max(i for i,l in enumerate(L) if f"destinationId: '{dest}'" in l and l.startswith('  { id:'))
    else:
        idx=max(i for i,l in enumerate(L) if l.startswith('  { id:'))
    L[idx+1:idx+1]=lines; open(p,'w').write('\n'.join(L))
def slug(n):
    import unicodedata
    t=unicodedata.normalize('NFKD',n).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',t).strip('-')
def apply(dest,standalone=(),patch=None,B='curation/nz-2026-10-14/'):
    patch=patch or {}
    prop=json.load(open(B+dest+'/coverage-proposal.json')); sk=json.load(open(B+dest+'/coverage-skeptic.json'))
    sks={s['name']:s for s in sk['new_spots']}
    ever=ids_ever(); nums=[int(m.group(1)) for i in ever for m in [re.fullmatch(re.escape(dest)+r'-(\d+)',i)] if m]
    n=max(nums or [0]); lines=[]; sl=[]; added=[]; skipped=[]
    pass
    for e in prop['new_spots']:
        s=sks.get(e['name'])
        if not s or not s.get('keep') or s.get('photo_verdict')!='accept' or not e.get('photo'): skipped.append(e['name']); continue
        e=dict(e); e.update(patch.get(e['name'],{}))
        co=s.get('coordinates_ok')
        if isinstance(s.get('corrected'),dict): e['coordinates']=s['corrected']
        if s.get('bio_fix'): e['bio']=s['bio_fix']
        if s.get('ticketUrl_ok') is False: e['ticketUrl']=None
        if e['name'] in standalone:
            sid=slug(e['name']); assert sid not in ever, sid
            sl.append(spot_line(sid,None,e,standalone=True))
        else:
            n+=1; sid=f"{dest}-{n}"; lines.append(spot_line(sid,dest,e))
        ph=e.get('photo')
        if ph and s.get('photo_verdict')=='accept': setov(e.get('wiki') or e['name'],ph['file'])
        added.append((sid,e['name'],bool(ph and s.get('photo_verdict')=='accept')))
    if lines: insert_spots(dest,lines)
    if sl: insert_spots(None,sl)
    print('NOT ADDED (kept by skeptic but no accepted photo, or dropped):',skipped)
    return added


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument('dest'); ap.add_argument('--standalone', default='')
    ns = ap.parse_args()
    print(apply(ns.dest, standalone=tuple(x.strip() for x in ns.standalone.split(',') if x.strip())))
