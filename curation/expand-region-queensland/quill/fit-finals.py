import json,glob,sys,importlib.util
sys.argv=['x']
spec=importlib.util.spec_from_file_location('bf','scripts/curation/bio-fit.py'); src=open('scripts/curation/bio-fit.py').read()
# reuse its measuring function without running its main
ns={}
head=src.split("if __name__")[0] if "if __name__" in src else src
exec(compile(head.split("\ndef main")[0],'bf','exec'),ns)
lines=ns['lines']
bad=[];n=0
for f in sorted(glob.glob('curation/expand-region-queensland/quill/shard-*/final.json')):
    d=json.load(open(f))
    for k,v in d.items():
        b=v.get('bio') if isinstance(v,dict) else None
        if not b: continue
        n+=1
        L=len(lines(b))
        if L>3 or len(b.split())<10: bad.append((f.split('/')[-2],k,L,len(b.split()),b))
print(n,len(bad))
for x in bad: print(x)
