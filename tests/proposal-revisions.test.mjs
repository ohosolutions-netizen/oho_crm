import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptedRevision,nextProposalVersion,proposalVersions} from '../lib/proposal-revisions.ts';
import {stageErrors} from '../lib/stage-rules.ts';
const records=[{id:'v1',module:'proposals',data:{opportunityId:'deal',version:'1',status:'Sent'}},{id:'v2',module:'proposals',data:{opportunityId:'deal',version:'2',status:'Sent'}},{id:'draft',module:'proposals',data:{opportunityId:'deal',version:'3',status:'Draft'}},{id:'foreign',module:'proposals',data:{opportunityId:'other',version:'9',status:'Sent'}}];
test('proposal versions are scoped and ordered; next revision never overwrites a draft or sent version',()=>{assert.deepEqual(proposalVersions('deal',records).map(p=>p.id),['draft','v2','v1']);assert.equal(nextProposalVersion('deal',records),'4');});
test('client may accept an earlier sent revision, but not a draft or another opportunity’s proposal',()=>{assert.equal(acceptedRevision('deal','v1',records)?.id,'v1');assert.equal(acceptedRevision('deal','foreign',records),undefined);assert.equal(acceptedRevision('deal','draft',records),undefined);});
test('deal acceptance requires explicitly selecting a proposal revision',()=>{const data={stageNote:'Customer agreed',acceptedDate:'2026-10-14',acceptedBy:'Customer',amount:'50000',advanceAmount:'1000',paidDate:'2026-10-14',currency:'INR'};assert.ok(stageErrors('opportunities','Accepted',data).some(e=>e.includes('Accepted proposal revision')));assert.deepEqual(stageErrors('opportunities','Accepted',{...data,acceptedProposalId:'v1'}),[]);});
