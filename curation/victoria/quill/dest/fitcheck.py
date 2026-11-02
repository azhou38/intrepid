import json,glob,subprocess,sys
bad=[]
for f in sorted(glob.glob('curation/victoria/quill/dest/wr-out-*.json')):
    d=json.load(open(f)); d=d if isinstance(d,list) else d.get('destinations',[])
    for x in d:
        t=subprocess.run(['python3','scripts/curation/tagline-fit.py','--text',x['tagline']],capture_output=True,text=True)
        b=subprocess.run(['python3','scripts/curation/blurb-fit.py','--text',x['bestTimeBlurb'],'--months',','.join(map(str,x['bestMonths']))],capture_output=True,text=True)
        tl=t.returncode!=0; bl=b.returncode!=0
        semi=';' in x['bestTimeBlurb']
        reasons=[len(x['whyVisit']),len(x['highlights']),len(x['goodToKnow'])]
        long=[g['title'] for g in x['goodToKnow'] if len(g['detail'])>160]
        print(x['id'],'tag' if tl else 'ok','blurb' if bl else 'ok','semi' if semi else '',reasons,long)
        if tl or bl or semi or long: bad.append((x['id'],t.stdout[-120:] if tl else '',b.stdout[-120:] if bl else ''))
print(len(bad),'to fix')
for x in bad: print(x)
