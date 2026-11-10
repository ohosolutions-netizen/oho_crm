import assert from 'node:assert/strict';
import {isActiveSyncOwner,resolveFallbackOwner} from '../catalyst/zoho-sync/owner.mjs';

const users=[
 {id:'inactive',email:'old@ohosolutions.in',name:'Old User',active:false},
 {id:'u1',email:'soorya@ohosolutions.in',name:'Soorya',auth_id:'auth-1',active:true},
 {id:'u2',email:'robin@ohosolutions.in',name:'Robin',active:1},
];
const active=users.filter(user=>isActiveSyncOwner(user));
assert.deepEqual(active.map(user=>user.id),['u1','u2']);
assert.equal(resolveFallbackOwner(active,'ROBIN@ohosolutions.in').id,'u2');
assert.equal(resolveFallbackOwner(active,'auth-1').id,'u1');
assert.equal(resolveFallbackOwner(active,'Soorya').id,'u1');
assert.equal(resolveFallbackOwner(active,'missing-user').id,'u1');
assert.equal(isActiveSyncOwner({id:'legacy'},{Active:'true'}),true);
assert.equal(resolveFallbackOwner([],''),undefined);
console.log('Zoho sync fallback owner resolution passed');
