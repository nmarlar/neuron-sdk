import test from 'node:test';
import assert from 'node:assert/strict';
import {NeuronClient} from '../dist/index.js';
import schemas from '../dist/tool-schemas.json' with {type:'json'};
async function fixture(names=Object.keys(schemas),fail=false){
 const calls=[];
 const client=await NeuronClient.fromTransport({listTools:async()=>names.map(name=>({name,inputSchema:schemas[name]})),callTool:async(name,args)=>{calls.push({name,args});if(fail)throw Error('private transport');return {content:[],structuredContent:{status:'queued'}};},close:async()=>{}});
 return {client,calls};
}
test('current computation and setup tools preserve exact caller arguments without granting authority',async()=>{
 const {client,calls}=await fixture();
 const args={workspace:'w',message:'Plan tomorrow',idempotency_key:'plan-test-001'};
 assert.deepEqual(await client.call('run_computation_outcome',args),{status:'queued'});
 assert.deepEqual(calls,[{name:'run_computation_outcome',args}]);
 assert.equal((await client.call('recommend_model_setup',{workspace:'w',message:'Track receiving'})).status,'queued');
});
test('missing setup revision fences and impersonation are rejected before transport',async()=>{
 const {client,calls}=await fixture();
 for(const args of [{workspace:'w',recommendation_id:'a'.repeat(32),idempotency_key:'apply-test-001'},
 {workspace:'w',recommendation_id:'a'.repeat(32),expected_revision:0,expected_model_revision:1,idempotency_key:'apply-test-001',tenant:'other'}])
 await assert.rejects(client.call('apply_model_setup',args),e=>e.code==='invalid_arguments');
 assert.equal(calls.length,0);
});
test('computation result continuation requires pinned revision and fingerprint',async()=>{
 const {client,calls}=await fixture();
 await assert.rejects(client.call('get_computation_run',{workspace:'w',run_id:'a'.repeat(32),context_offset:10}),e=>e.code==='invalid_arguments');
 const args={workspace:'w',run_id:'a'.repeat(32),context_offset:10,expected_revision:2,expected_fingerprint:'b'.repeat(64)};
 await client.call('get_computation_run',args);assert.deepEqual(calls,[{name:'get_computation_run',args}]);
});
test('context-only connection cannot call ungranted computation operations',async()=>{
 const {client,calls}=await fixture(['discover_workspace_contexts','read_workspace_context']);
 await assert.rejects(client.call('run_computation_outcome',{workspace:'w',message:'Plan',idempotency_key:'plan-test-001'}),e=>e.code==='unavailable_tool');assert.equal(calls.length,0);
});
test('ambiguous computation submission is not automatically retried',async()=>{
 const {client,calls}=await fixture(undefined,true);
 await assert.rejects(client.call('run_computation_outcome',{workspace:'w',message:'Plan',idempotency_key:'plan-test-001'}),e=>e.code==='transport_error'&&!e.message.includes('private transport'));assert.equal(calls.length,1);
});

test('definition import commit preserves pinned fingerprints and refuses missing fences',async()=>{
 const {client,calls}=await fixture();
 const args={workspace:'w',import_id:'a'.repeat(32),expected_context_revision:0,expected_model_revision:3,expected_context_fingerprint:'b'.repeat(64),idempotency_key:'import-test-001'};
 const {expected_context_fingerprint,...missing}=args;
 await assert.rejects(client.call('commit_model_import',missing),e=>e.code==='invalid_arguments');
 await client.call('commit_model_import',args);assert.deepEqual(calls,[{name:'commit_model_import',args}]);
});
