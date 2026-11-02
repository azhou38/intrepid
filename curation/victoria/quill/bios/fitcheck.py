import json,glob,sys
sys.path.insert(0,'scripts/curation')
import importlib.util
spec=importlib.util.spec_from_file_location('bf','scripts/curation/bio-fit.py'); bf=importlib.util.module_from_spec(spec); spec.loader.exec_module(bf)
bad=[];tot=0;short=[]
for f in sorted(glob.glob('curation/victoria/quill/bios/out-*.json')):
    d=json.load(open(f)); d=d if isinstance(d,list) else d.get('bios',[])
    for x in d:
        tot+=1
        b=x['bio']
        n=len(bf.lines(b))
        if n>3: bad.append((x['id'],n,len(b),b))
        if len(b.split())<10: short.append((x['id'],b))
print(tot,'bios;',len(bad),'too long;',len(short),'too short')
json.dump([{'id':i,'lines':n,'chars':c,'bio':b} for i,n,c,b in bad],open('curation/victoria/quill/bios/toolong.json','w'),indent=1)
json.dump(short,open('curation/victoria/quill/bios/tooshort.json','w'),indent=1)
