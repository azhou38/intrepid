import json,glob,os,random,sys
for d in sorted(glob.glob('curation/expand-region-queensland/region-*/')):
    if not os.path.exists(d+'tail-triage.json') or os.path.exists(d+'marginal.tail-merged'): continue
    allm={c['name']:c for c in json.load(open(d+'marginal.all.json'))}
    A=json.load(open(d+'marginal.tierA.json'))
    T=json.load(open(d+'tail-triage.json'))
    tn={t['name'] for t in T}
    tail_lines=[l.split('\t')[0] for l in open(d+'tail.tsv') if l.strip()]
    missing=[n for n in tail_lines if n not in tn]
    assert not missing, (d,len(missing),missing[:3])
    checks=[allm[t['name']] for t in T if t['verdict']=='check' and t['name'] in allm]
    rej=[t for t in T if t['verdict']=='reject']
    names={c['name'] for c in A}
    M=A+[c for c in checks if c['name'] not in names]
    json.dump(M,open(d+'marginal.json','w'),indent=1)
    json.dump(rej,open(d+'tail-rejected.json','w'),indent=1)
    random.seed(7); samp=random.sample(rej,min(25,len(rej)))
    json.dump([{'name':s['name'],**{k:allm[s['name']].get(k) for k in('wiki','views','note')}} for s in samp if s['name'] in allm],open(d+'tail-audit.json','w'),indent=1)
    open(d+'marginal.tail-merged','w').write('1')
    print(os.path.basename(d.rstrip('/')),'judge',len(M),'tail-rejected',len(rej))
