import assert from 'node:assert/strict';
import {recordReadWhere} from '../catalyst/record-read-plan.mjs';
const quote=s=>"'"+s.replaceAll("'","''")+"'";
for(const module of ['companies','contacts','enquiries','opportunities','proposals','invoices','projects']){
 assert.equal(recordReadWhere(module,'abc',quote),"AppId='abc' AND IsDeleted=false");
}
assert.equal(recordReadWhere('activities','abc',quote),"(AppId='abc' OR LeadAppId='abc' OR OpportunityAppId='abc') AND IsDeleted=false");
assert.ok(recordReadWhere('opportunities',"a'b",quote).includes("a''b"));
console.log('Targeted detail read checks passed.');
