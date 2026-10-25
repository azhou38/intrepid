#!/usr/bin/env python3
"""Merges the ACT Quill shards (curation/act/quill/out-*.json) with the fact-check corrections and the browser checks into
curation/act/quill/final-spots.json ({id: entry}), and applies the destination copy fixes to the dest-*.final.json files.

  python3 curation/act/finalize_quill.py [--write]

Corrections here are decisions made after reading the fact-check files (facts-A..D.json) and the in-app browser checks
(browser-checks.json): each one cites its source in `notes`. Prints every problem it finds (missing field, bio too long).
"""
import glob, json, subprocess, sys

WRITE = '--write' in sys.argv
Q = 'curation/act/quill/'
spots = {}
shard_notes = {'unverified': [], 'needs_browser': [], 'notes': []}
for f in sorted(glob.glob(Q + 'out-*.json')):
    o = json.load(open(f))
    spots.update(o['spots'])
    for k in shard_notes:
        shard_notes[k] += o.get(k) or []
checks = json.load(open(Q + 'browser-checks.json'))

# --- decisions after the fact-check ---------------------------------------------------------------------------------
BIO = {
    'canberra-7': "Native plant gardens at the foot of Black Mountain, with a rainforest gully and a Red Centre garden.",
    'canberra-8': "Artificial lake at Canberra's centre, with a 40 km shoreline, cruises, boat hire and swimming beaches.",
    'canberra-9': "250-hectare arboretum of rare and endangered trees in the Molonglo Valley, with over 94 forests and a playground.",
    'canberra-23': "Protest site opposite Old Parliament House, founded in January 1972 and among the world's longest continuing.",
    'canberra-27': "Lakeside park on Lake Burley Griffin with sculpture gardens, ponds and an amphitheatre.",
    'canberra-14': "Gallery on King Edward Terrace in Parkes showing portraits of people who have shaped the nation.",
    'canberra-30': "Fenced woodland sanctuary in Gungahlin with walking and cycling tracks and reintroduced eastern quolls.",
    'canberra-40': "Volunteer-run railway museum in Kingston with historic locomotives and carriages from over 100 years of rail history.",
    'canberra-47': "Murrumbidgee River beach with shady picnic areas, a playground, electric barbecues and walking tracks.",
    'canberra-51': "Lakeside arts centre on Emu Bank with galleries, a 400-seat theatre, a design shop and a café.",
    'namadgi-national-park-1': "Waterfall with a drop of over 50 m, with a barbecue and picnic area off Corin Road.",
    'namadgi-national-park-2': "Granite outcrop on Booroomba Rocks Road, reached by a 2.5 km return walk and also a rock-climbing site.",
}
SET = {
    'canberra-9': {'hours': '6:00 AM – 8:30 PM (7:00 AM – 5:30 PM in winter)'},
    'canberra-15': {'costMin': 65, 'costMax': 68, 'currency': 'AUD'},   # the zoo's entry-prices table, read in the browser: adult $65 online, $68 at the gate
    'canberra-24': {'hours': 'Recitals Wed 6:30 PM, Sun 12:30 PM'},
    'canberra-62': {'hours': 'Open 24 hours (closed on Total Fire Ban days)'},
    'canberra-69': {'free': True, 'needs': 'park-pass', 'costBasis': 'entry'},   # inside Tidbinbilla Nature Reserve, which charges a gate fee per vehicle
    'namadgi-national-park-9': {'hours': 'Seasonal, mostly weekends (see the operator\'s calendar)'},
}
EXTRA_NOTES = {
    'canberra-15': 'Adult $65 online / $68 at the gate (nationalzoo.com.au/entry-prices, read in the browser); the shard\'s A$55 came from an old search snippet.',
    'canberra-12': 'Weekday hours: the official page gives no opening time, only that the building closes at 4:30 pm; 9:45 am is Wikivoyage (2017). Unverified.',
    'canberra-9': 'Entry: no fee is stated on the Visit pages (only photography/venue hire fees); free is the reading of that. Hours from nationalarboretum.act.gov.au/visit/opening-hours (grounds daily 6-8:30 pm in daylight saving, 7-5:30 otherwise).',
    'canberra-32': 'The operator page (cdscc.nasa.gov) gives Sat-Sun 10-4, free, no booking, plus ACT school-holiday days. The "temporarily closed to drop-in visitors" CSIRO line is for the CSIRO Discovery Centre (canberra-38, dropped).',
    'canberra-1': 'Mount Ainslie and Parliament House bios: no photo ID is required (aph.gov.au: airport-style screening, allow 15 minutes).',
    'canberra-51': 'Free entry rests on a 2024 CityNews quote; the official site gives hours only.',
    'canberra-52': 'Free entry rests on Wikivoyage only; the official site gives hours only.',
    'canberra-55': 'The park is open space; the railway, maze and mini golf are Yarralumla Play Station (prices and hours unread).',
    'canberra-69': 'Inside Tidbinbilla Nature Reserve: the reserve charges $16.09 per private vehicle per day (canberra-31 carries the price); shown here as "Park Pass Needed".',
    'namadgi-national-park-9': 'Wikivoyage places Corin Forest outside Namadgi National Park; it sits on Corin Road beside the park. It is an operator, kept as a place.',
}
problems = []
dropped = checks.get('drop', {})
for i in dropped:
    spots.pop(i, None)
for i, new in BIO.items():
    if i in spots:
        spots[i]['bio'] = new
for i, fields in SET.items():
    if i in spots:
        spots[i].update(fields)
        if fields.get('free'):
            spots[i].pop('costMin', None); spots[i].pop('costMax', None)
for i, c in checks.get('set', {}).items():
    if i not in spots:
        continue
    note = c.get('note')
    for k, v in c.items():
        if k != 'note':
            spots[i][k] = v
    if c.get('costMin') is not None:
        spots[i].pop('free', None)
    if note:
        spots[i]['notes'] = (spots[i].get('notes', '') + ' | BROWSER: ' + note).strip(' |')
for i, n in EXTRA_NOTES.items():
    if i in spots:
        spots[i]['notes'] = (spots[i].get('notes', '') + ' | ' + n).strip(' |')

# --- checks ---------------------------------------------------------------------------------------------------------
for i, s in spots.items():
    for k in ('name', 'icon', 'category', 'bio', 'hours', 'visitHoursMin', 'visitHoursMax', 'coordinates', 'costBasis'):
        if s.get(k) in (None, ''):
            problems.append(f'{i}: missing {k}')
    if not s.get('free') and s.get('costMin') is None:
        problems.append(f'{i}: no cost and not free')
    if s.get('free') and s.get('costMin') is not None:
        problems.append(f'{i}: free and a price')
    if not s.get('ticketUrl') and not s.get('ticket_note'):
        problems.append(f'{i}: no ticketUrl and no ticket_note')
    r = subprocess.run(['python3', 'scripts/curation/bio-fit.py', '--text', s['bio']], capture_output=True, text=True)
    if r.returncode != 0:
        problems.append(f'{i}: bio does not fit: {s["bio"]}')
    if len(s['bio'].split()) < 10:
        problems.append(f'{i}: bio under 10 words')

# --- destination copy -------------------------------------------------------------------------------------------------
DEST = {
    'canberra': {
        'goodToKnow': [
            None,
            {'icon': '🛂', 'title': 'Security screening', 'detail': 'Parliament House and the High Court screen visitors on entry. Allow 15 minutes and leave large bags behind: the High Court bans any over 30 cm.'},
            {'icon': '📅', 'title': 'Check opening days', 'detail': 'The Royal Australian Mint opens shorter hours at weekends, and Blundells Cottage opens only Wednesdays, Saturdays and Sundays.'},
        ],
        'bestTimeBlurb': 'Spring and autumn, {months}, bring mild days. Winter nights are frosty.',
    },
    'namadgi-national-park': {
        'description': "Namadgi covers about 46% of the Australian Capital Territory, a mountain landscape of granite tors, waterfalls and snow-capped ranges south-west of Canberra. Walks lead to granite outcrops, 19th-century settlers' huts and Aboriginal rock art, and the Honeysuckle Creek site recalls the Apollo moon landing broadcasts. The visitor centre is on Naas Road near Tharwa village, the park's gateway.",
        'whyVisit': ['See the drop at Gibraltar Falls', 'Climb up to Booroomba Rocks', 'See Aboriginal rock art at Yankee Hat'],
        'highlights': ['Waterfall drop', 'Granite outcrop', 'Rock painting'],
        'goodToKnow': [
            {'icon': '📍', 'title': 'Start at the visitor centre', 'detail': 'The Namadgi Visitor Centre on Naas Road near Tharwa has track information and track conditions. Check its opening hours before you go.'},
            None,
        ],
    },
}
for did, fixes in DEST.items():
    p = Q + f'dest-{did}.final.json'
    d = json.load(open(p))
    dd = d['destination']
    for k, v in fixes.items():
        if k == 'goodToKnow':
            for n, t in enumerate(v):
                if t is not None:
                    dd['goodToKnow'][n] = t
        else:
            dd[k] = v
    tg = subprocess.run(['python3', 'scripts/curation/tagline-fit.py', '--text', dd['tagline']], capture_output=True, text=True)
    bl = subprocess.run(['python3', 'scripts/curation/blurb-fit.py', '--text', dd['bestTimeBlurb'], '--months', ','.join(map(str, dd['bestMonths']))], capture_output=True, text=True)
    if tg.returncode: problems.append(f'{did}: tagline: {tg.stdout[:120]}')
    if bl.returncode: problems.append(f'{did}: blurb: {bl.stdout[:120]}')
    for t in dd['goodToKnow']:
        if len(t['detail']) > 160: problems.append(f'{did}: tip too long ({len(t["detail"])}): {t["title"]}')
    d['spots'] = [i for i in d['spots'] if i in spots]
    if WRITE:
        json.dump(d, open(p, 'w'), indent=1, ensure_ascii=False)

if WRITE:
    json.dump({'spots': spots, 'dropped': dropped, **shard_notes}, open(Q + 'final-spots.json', 'w'), indent=1, ensure_ascii=False)
print(len(spots), 'spots;', len(problems), 'problems')
for p in problems:
    print(' ', p)
