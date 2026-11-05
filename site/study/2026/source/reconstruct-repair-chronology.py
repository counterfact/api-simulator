"""Collect exact-file source bounds, not introduction claims, for adjudication."""
import json,pathlib,subprocess,re
root=pathlib.Path(__file__).parent
internal=json.loads((root/'internal.json').read_text()); delivery=json.loads((root/'delivery.json').read_text());npm=json.loads((root/'delivery-tools/npm-counterfact.json').read_text())
def git(*a):
 r=subprocess.run(['git',*a],capture_output=True,text=True);return r.stdout.strip() if r.returncode==0 else None
releases=sorted([(v,t) for v,t in npm['time'].items() if re.match(r'^\d+\.\d+\.\d+$',v) and t<'2026-09-04'],key=lambda x:x[1]); prs={r['number']:r for r in delivery['pullRequests']};out=[]
for c in internal['confirmed_findings']:
 p=c['source_pr'];n=p['number'];r={'id':c['defect_id'],'number':n,'reportedAt':p['created_at'],'title':p['title'],'discoveryChannel':'unknown','affectedFileEvidence':[],'fixedRelease':None,'fixedPublishedAt':None}
 merge=(prs.get(n) or {}).get('mergeCommit');r['fixCommit']=merge
 if merge:
  tags=set((git('tag','--contains',merge) or '').splitlines());fixed=next(((v,t) for v,t in releases if 'v'+v in tags),None)
  if fixed:r.update(fixedRelease=fixed[0],fixedPublishedAt=fixed[1])
 prior=[(v,t) for v,t in releases if t<p['created_at']]
 for f in p['detail']['files']:
  path=f['filename']
  if not (path.startswith('src/') or re.match(r'packages/[^/]+/src/',path)):continue
  old=git('rev-parse',p['base_sha']+':'+path)
  if not old:continue
  # Entire file identity at a published tag establishes a conservative affected bound.
  for v,t in reversed(prior):
   sha=git('rev-parse','v'+v+':'+path)
   if sha and old==sha:
    r['affectedFileEvidence'].append({'path':path,'blob':old,'release':v,'publishedAt':t,'tagCommit':git('rev-parse','v'+v+'^{commit}'),'comparisonBase':p['base_sha']});break
 out.append(r)
(root/'repair-chronology.json').write_text(json.dumps({'method':'Exact pre-fix file blob equality with a published tag. Requires semantic adjudication: matching an unrelated file does not demonstrate the reported fault. First corrected candidate uses Git ancestry plus npm publication; unproven remains null.','records':out},indent=2)+'\n')
for r in out:print(r['id'],r['title'],[(x['path'],x['release']) for x in r['affectedFileEvidence']],r['fixedRelease'])
