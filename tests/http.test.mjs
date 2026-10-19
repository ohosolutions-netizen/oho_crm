import test from 'node:test';import assert from 'node:assert/strict';import {readJSON} from '../lib/http.ts';
test('valid JSON responses preserve record save results',async()=>{assert.deepEqual(await readJSON(Response.json({id:'record',ok:true})),{id:'record',ok:true});});
test('empty and malformed backend responses give recovery guidance',async()=>{for(const body of ['', '<html>Gateway error</html>'])await assert.rejects(readJSON(new Response(body)),/Refresh records before trying again/);});
