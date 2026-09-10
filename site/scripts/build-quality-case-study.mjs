/** Rebuild the version-4 view from archived v3 inputs and source-linked adjudications. */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deriveMonthly, derivePeriods, deriveMature } from './quality-case-study-lib.mjs';
const root = new URL('../../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const source = 'site/study/2026/source/';
const legacy = read('site/src/data/quality-audit-evidence-v3.json');
const delivery = read(source + 'delivery.json');
delivery.pullRequests = delivery.pullRequests.map(r=>({...r,disposition:r.disposition === 'non_dependency' ? 'non-dependency' : r.disposition}));
const external = read(source + 'external.json');
const internal = read(source + 'internal.json');
const chronology = read(source + 'repair-chronology.json');
const npm = read(source + 'delivery-tools/npm-counterfact.json');
const adjudications = read(source + 'adjudications.json');
const proof = new Map(chronology.records.map(r => [r.id, r]));
const adoptionAt = legacy.study.intervention.startedAt;
const defects = legacy.productCases.map(c => ({
 id:c.id, title:c.shortTitle, reportedAt:c.reportedAt, originalReportedAt:c.reportedAt,
 firstAffectedPublishedAt:c.firstAffectedPublishedAt, firstAffectedRelease:c.firstAffectedRelease,
 firstAffectedPrecision:c.evidencePrecision === 'Exact origin' ? 'exact' : 'bound',
 fixedPublishedAt:npm.time[c.fixedRelease] ?? null, fixedRelease:c.fixedRelease,
 discoveryChannel:'external-human', releaseStatus:'released', disposition:'confirmed-defect', duplicateOf:null,
 originStatus:Date.parse(c.firstAffectedPublishedAt) < Date.parse(adoptionAt) ? 'pre-existing' : 'introduced-after-adoption',
 sources:c.sources, originalPopulation:true, classificationNote:'Retained original external case, with correction time joined to npm publication metadata.'
}));
const originalIds = new Set(defects.map(d=>d.id));
for (const row of external.records) {
 const id = `issue-${row.source.number}`;
 if (originalIds.has(id) || (!row.screening.inObservationWindow && !row.screening.carryInCandidate)) continue;
 const classified = row.screening.disposition;
 if (classified.startsWith('excluded') || classified.startsWith('deduplicated')) continue;
 const confirmed = classified.startsWith('confirmed');
 defects.push({id,title:row.report.title,reportedAt:row.report.createdAt,
  firstAffectedPublishedAt:row.chronology.firstAffectedPublishedAt,firstAffectedRelease:row.chronology.firstAffectedRelease,
  firstAffectedPrecision:row.chronology.firstAffectedPublishedAt ? 'bound' : 'unknown',
  fixedPublishedAt:row.chronology.fixedPublishedAt,fixedRelease:row.chronology.fixedRelease,
  discoveryChannel:'external-human',releaseStatus:row.classification.releaseStatusAtReport === 'released' ? 'released' : 'unknown',
  disposition:classified === 'process_incident' ? 'process-incident' : confirmed ? 'confirmed-defect' : 'unresolved',duplicateOf:null,
  originStatus:'unresolved',sources:[row.source.url],classificationNote:row.screening.dispositionReason});
}
const fixMap = new Map(legacy.productCases.map(c=>[c.fixPr,c.id]));
fixMap.set(1062,'issue-1056');
for (const c of internal.confirmed_findings) {
 const existing = defects.find(d=>d.id === fixMap.get(c.finding_pr));
 if (existing) {existing.sources=[...new Set([...existing.sources,c.finding_url])]; continue;}
 const p=proof.get(c.defect_id); const override=adjudications.repairs[c.defect_id] ?? {};
 if(override.exclude) continue;
 const supported=p?.affectedFileEvidence.filter(e=>!override.disallowedPaths?.includes(e.path)) ?? [];
 const bound=supported.sort((a,b)=>a.publishedAt.localeCompare(b.publishedAt))[0];
 const d={id:c.defect_id,title:c.source_pr.title,reportedAt:c.source_pr.created_at,
  firstAffectedPublishedAt:bound?.publishedAt ?? null,firstAffectedRelease:bound?.release ?? null,
  firstAffectedPrecision:bound ? 'bound' : 'unknown',fixedPublishedAt:p?.fixedPublishedAt ?? null,fixedRelease:p?.fixedRelease ?? null,
  discoveryChannel:'unknown',releaseStatus:bound ? 'released' : 'unknown',disposition:'confirmed-defect',duplicateOf:null,
  originStatus:bound && bound.publishedAt < adoptionAt ? 'pre-existing' : 'unresolved',
  sources:[c.finding_url,...supported.map(e=>`https://github.com/counterfact/api-simulator/blob/${e.tagCommit}/${e.path}`)],
  classificationNote:bound ? 'Accepted repair demonstrates the faulty behavior; a matching pre-fix source file in a previously published tag supplies a conservative affected bound. Discovery attribution is not established by authorship.' : 'Accepted repair demonstrates faulty behavior; released status or origin remains unresolved.',
  repairEvidence:{fixCommit:p?.fixCommit ?? null,affectedFiles:supported}};
 Object.assign(d,override.fields ?? {});d.sources=[...new Set([...d.sources,...(override.sources ?? [])])]; defects.push(d);
}
for(const [id,override] of Object.entries(adjudications.cases ?? {})) {
 const record=defects.find(d=>d.id===id);if(record){Object.assign(record,override.fields);record.sources=[...new Set([...record.sources,...(override.sources??[])])];}
}
const issueReview=read(source+'external-tools/internal-issue-review.json');
for(const r of issueReview.records) {
 const linked=defects.find(d=>d.id===adjudications.internalIssueLinks?.[String(r.number)]);
 if(linked) {if(Date.parse(r.createdAt)<Date.parse(linked.reportedAt))linked.reportedAt=r.createdAt;linked.sources=[...new Set([...linked.sources,r.url])];linked.reportIds=[...(linked.reportIds??[]),`issue-${r.number}`];}
}
for(const number of [1580,1755]) {
 const r=issueReview.records.find(r=>r.number===number);if(!r)continue;
 defects.push({id:`issue-${number}`,title:r.title,reportedAt:r.createdAt,firstAffectedPublishedAt:null,firstAffectedPrecision:'unknown',fixedPublishedAt:null,discoveryChannel:'unknown',releaseStatus:'unknown',disposition:number===1755?'process-incident':'unresolved',duplicateOf:null,sources:[r.url],classificationNote:number===1755?'Maintainer reports an invalid manual-acceptance workflow; retained as process quality.':'Concrete invalid-example-name failure is reported, but affected release and correction have not been traced.'});
}
const candidates=[...external.records.map(r=>({id:`issue-${r.source.number}`,title:r.report.title,reportedAt:r.report.createdAt,disposition:r.screening.disposition,reason:r.screening.dispositionReason,source:r.source.url})),...internal.screening_ledger.map(r=>({id:`pr-${r.pr}`,title:r.title,reportedAt:r.created_at,disposition:r.disposition,reason:r.rationale,source:r.url}))];
for(const record of candidates) {
 const internalRow=issueReview.records.find(r=>`issue-${r.number}`===record.id);
 if(internalRow) Object.assign(record,{disposition:internalRow.disposition,reason:internalRow.reason});
 const link=adjudications.internalIssueLinks?.[record.id.replace('issue-','')];
 if(link) Object.assign(record,{disposition:'deduplicated-report',reason:`Report linked to underlying defect ${link}; counted once.`,duplicateOf:link});
 const decision=adjudications.sourceCorrections.find(r=>r.id===record.id && r.decision.startsWith('excluded'));
 if(decision) Object.assign(record,{disposition:decision.decision,reason:decision.reason});
 const defect=defects.find(d=>d.id===record.id);
 if(defect) Object.assign(record,{disposition:defect.disposition,reason:defect.classificationNote});
}
for(const record of issueReview.records) {
 const final=candidates.find(r=>r.id===`issue-${record.number}`);if(final){record.disposition=final.disposition;record.reason=final.reason;}
}
for(const record of candidates) { const override=adjudications.candidateOverrides?.[record.id]; if(override) Object.assign(record,override); }
const rawExperiments=read('site/study/2026/experiments/results.json');
const results=Array.isArray(rawExperiments)?rawExperiments:rawExperiments.results ?? rawExperiments.cases ?? rawExperiments.experiments ?? rawExperiments.attempts;
if(!Array.isArray(results)) throw new Error('Experiment artifact must contain results, cases, or experiments array');
const experimentRoot = new URL('site/study/2026/experiments/',root);
const artifactFiles = (url,prefix='')=>readdirSync(url,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?artifactFiles(new URL(entry.name+'/',url),prefix+entry.name+'/'):entry.isFile()&&entry.name!=='artifact-manifest.json'?[prefix+entry.name]:[]);
const artifacts = artifactFiles(experimentRoot).sort().map(file=>({path:'site/study/2026/experiments/'+file,sha256:createHash('sha256').update(readFileSync(new URL(file,experimentRoot))).digest('hex')}));
writeFileSync(new URL('artifact-manifest.json',experimentRoot),JSON.stringify({artifacts},null,2)+'\n');
const experiments={fixed7:{artifacts,results:results.map(r=>({...r,id:String(r.issue ?? r.issueNumber ?? r.id).replace(/^issue-/, '')}))}};
const matureRecords=[...legacy.productCases.map(c=>({id:c.id,reportedAt:c.reportedAt,firstAffectedPublishedAt:c.firstAffectedPublishedAt,firstAffectedPrecision:c.evidencePrecision==='Exact origin'?'exact':'bound',fixedPublishedAt:npm.time[c.fixedRelease]??null,sources:c.sources})),...read(source+'historical-dated-records.json').records.map(r=>({...r,firstAffectedPrecision:r.firstAffectedPrecision??(r.originPrecision==='original-audit-origin'?'exact':'unknown')}))];
const caseStudy={
 researchQuestion:'Can agent-assisted development increase delivery while keeping verification and repair effective?',
 interpretiveHypothesis:{statement:'Agent-assisted development can increase what I deliver while preserving a working verification and repair loop.',assessment:'Retrospective observational assessment formulated after inspecting outcomes; not a preregistered or causal test.',checks:[{question:'Did delivery increase?',population:'Non-dependency PRs in the matched 2022–2026 windows.',against:'Delivery does not exceed the highest observed earlier matched-window non-dependency PR count.',scope:'Counts measure merged activity, not effort saved or product value.'},{question:'Did confirmed external defects reach public corrections?',population:'All seven confirmed external product-defect reports after adoption.',against:'A report in the fixed seven-case population has no traceable public correction by the study boundary.',scope:'Report-to-publication times describe these cases. The separate 90-day historical follow-up boundary is an observation and censoring rule, not a repair target or MTTR.'},{question:'Do the relevant checks distinguish faulty from corrected behavior?',population:'All seven fixed experiment cases.',against:'A relevant assertion fails to distinguish the affected and corrected behavior, or remains inconclusive.',scope:'Focused checks, performed retrospectively; not historical whole-suite results.'}]},
 window:{start:'2024-09-01T00:00:00Z',endExclusive:'2026-09-04T00:00:00Z'},adoptionAt,
 census:{issues:external.counts.screened,issueSource:external.sourceMetadata,pullRequests:internal.retrieval.all_state_pr_count,intervalPullRequests:internal.counts.screened_prs,sourceRef:delivery.cutoff.firstParentRef},
 delivery,defects,candidates,experiments,matureRecords,internalIssueReview:issueReview,mainlineScreen:internal.direct_mainline_screen,
 unresolvedRecords:[...(adjudications.directMainlineReview ?? []),...internal.unresolved.filter(r=>Number.isInteger(r.pr)).map(r=>{const p=internal.screening_ledger.find(p=>p.pr===r.pr);return {id:`pr-${r.pr}`,reportedAt:p?.created_at,reason:r.reason,sources:p?[p.url]:[]};})],
 limitations:[
  'Public records establish known findings, not all defects or active usage. Rule-screened records are distinct from individually adjudicated repairs.',
  'Discovery channel remains unknown unless the public record attributes discovery. PR authorship is insufficient.',
  'Known backlog excludes unresolved release-status findings and undisclosed issues. It is not a complete measure of customer impact.',
  'A pre-fix source-file match establishes an affected bound, not an exact origin or a behavioral experiment.',
  'The first GitHub issues traversal missed actual issues; the independently paginated 395-issue search is the retained actual-issue census.',
  'The original external population and the expanded repair population answer different questions and must not share a defect-rate denominator.'
 ],
 adjudication:adjudications,
 sourceFiles:['delivery.json','external.json','internal.json','historical-dated-records.json','repair-chronology.json','adjudications.json'].map(file=>({path:source+file,sha256:createHash('sha256').update(readFileSync(new URL(source+file,root))).digest('hex')}))
};
caseStudy.sourceFiles.push({path:'site/study/2026/experiments/results.json',sha256:createHash('sha256').update(readFileSync(new URL('site/study/2026/experiments/results.json',root))).digest('hex')});
caseStudy.monthly=deriveMonthly(caseStudy);caseStudy.periods=derivePeriods(caseStudy);caseStudy.supportingMature=deriveMature(matureRecords,delivery,delivery.windows);
const {historicalCandidates,...base}=legacy;
const evidence={...base,schemaVersion:4,analysis:{...base.analysis,version:'4.0',updatedOn:'2026-09-09',previousDataset:'/quality/2026/data-v3.json'},caseStudy};
evidence.featureTimeline = base.featureTimeline.map(r=>({...r,href:r.href.replace("/blob/main/",`/blob/${delivery.cutoff.firstParentRef}/`)}));
evidence.study={...base.study,researchQuestion:caseStudy.researchQuestion,originalAnalysisRole:'Retained original external-population comparison; version 4 leads with the expanded descriptive case study.'};
writeFileSync(new URL('site/src/data/quality-audit-evidence.json',root),JSON.stringify(evidence,null,2)+'\n');
console.log(`Built v4: ${defects.length} adjudicated case records, ${candidates.length} candidate records, ${caseStudy.monthly.length} monthly rows, ${results.length} experiment outcomes.`);
