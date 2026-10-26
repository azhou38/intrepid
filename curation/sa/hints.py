#!/usr/bin/env python3
"""Gives hint-less spots a town hint (Nominatim, 1 req/s) so the pin pass can search around them: writes curation/sa/hints.json
and removes the 'no hint' records from pins.json so pinpass.py retries them."""
import glob, json, re, time, urllib.parse, urllib.request
TOWN = [  # (regex on name + notes, search)
 (r'Jamestown', 'Jamestown, South Australia'), (r'Cowell|Black Stump', 'Cowell, South Australia'), (r'Wittelbee|Tumby Bay', 'Tumby Bay, South Australia'),
 (r'Arno Bay|Redbanks|Red Banks Road', 'Arno Bay, South Australia'), (r'Cleve|Federation Hill|Kielpa', 'Cleve, South Australia'),
 (r'Cummins', 'Cummins, South Australia'), (r'Elliston', 'Elliston, South Australia'), (r'Talia', 'Elliston, South Australia'),
 (r'Locks Well|Bramfield', 'Elliston, South Australia'), (r'Yalata|Mulloway', 'Yalata, South Australia'), (r'Greenly|Coulta', 'Coulta, South Australia'),
 (r'Googs', 'Ceduna, South Australia'), (r'Eyre Highway', 'Nullarbor, South Australia'), (r'Kimba|Galah', 'Kimba, South Australia'),
 (r'Brachina|Bunyeroo|Hills Homestead|Wilpena', 'Wilpena Pound, South Australia'), (r'Rawnsley', 'Rawnsley Park, South Australia'),
 (r'Trezona', 'Wilpena Pound, South Australia'), (r'Skytrek|Willow Springs', 'Willow Springs, South Australia'),
 (r'Jarvis Hill|Castle Rock|Camel Hump|Hawker|Fred Teague', 'Hawker, South Australia'), (r'Ferguson Gorge|Blinman', 'Blinman, South Australia'),
 (r'Prairie Hotel|Parachilna', 'Parachilna, South Australia'), (r'Alligator Gorge', 'Wilmington, South Australia'), (r'Melrose', 'Melrose, South Australia'),
 (r'Orroroo|Giant Gum|Pekina', 'Orroroo, South Australia'), (r'Magnetic Hill', 'Black Rock, South Australia'), (r'Heysen Trail|Mawson Trail', 'Blinman, South Australia'),
 (r'Southern Flinders Rail', 'Laura, South Australia'), (r'Caernarvon|Bunkers', 'Yunta, South Australia'), (r'Mount Ellen', 'Wirrabara, South Australia'),
 (r'Peterborough', 'Peterborough, South Australia'), (r'Kingston', 'Kingston SE, South Australia'), (r'Bordertown', 'Bordertown, South Australia'),
 (r'Swan Reach|Dark Sky|Shell Hill|Big Bend|Walker Flat', 'Swan Reach, South Australia'), (r'Ngaut', 'Nildottie, South Australia'),
 (r'Hunter Road|Paisley', 'Paisley, South Australia'), (r'Brookfield|Blanchetown', 'Blanchetown, South Australia'), (r'Karoonda', 'Karoonda, South Australia'),
 (r'Lameroo', 'Lameroo, South Australia'), (r'Pinnaroo|Mallee Tourist', 'Pinnaroo, South Australia'), (r'Coonalpyn|Tauragat', 'Coonalpyn, South Australia'),
 (r'Boothby|Tolmer|Karte|Tintinara', 'Tintinara, South Australia'), (r'Ngarkat', 'Lameroo, South Australia'), (r'Shipwreck', 'Edithburgh, South Australia'),
]
fb = {'ikara-flinders-ranges': 'Hawker, South Australia', 'mount-remarkable': 'Melrose, South Australia'}
pins = json.load(open('curation/sa/pins.json'))
plans = {}
for f in glob.glob('curation/sa/plan/*.json'):
    for s in json.load(open(f))['spots']: plans[s['id']] = s.get('destination')
hints = json.load(open('curation/sa/hints.json')) if glob.glob('curation/sa/hints.json') else {}
cache = {}
def geo(q):
    if q in cache: return cache[q]
    time.sleep(1.1)
    r = json.load(urllib.request.urlopen(urllib.request.Request('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=au&q=' + urllib.parse.quote(q), headers={'User-Agent': 'wellington-curation/1.0'}), timeout=30))
    cache[q] = {'latitude': float(r[0]['lat']), 'longitude': float(r[0]['lon'])} if r else None
    return cache[q]
for f in sorted(glob.glob('curation/sa/quill/sa-*/out-*.json')):
    for i, s in json.load(open(f))['spots'].items():
        if pins.get(i, {}).get('why') != 'no hint' or i in hints: continue
        text = s['name'] + ' ' + json.dumps(s.get('notes'))
        q = next((t for rx, t in TOWN if re.search(rx, text, re.I)), None) or fb.get(plans.get(i))
        h = geo(q) if q else None
        if h: hints[i] = h; print(i, s['name'], '->', q)
        else: print('NO HINT', i, s['name'])
json.dump(hints, open('curation/sa/hints.json', 'w'), indent=1)
for i in hints: pins.pop(i, None)
json.dump(pins, open('curation/sa/pins.json', 'w'), indent=1, ensure_ascii=False)
