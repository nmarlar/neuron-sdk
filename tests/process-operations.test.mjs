import test from 'node:test';
import assert from 'node:assert/strict';
import {NeuronClient} from '../dist/index.js';
import schemas from '../dist/tool-schemas.json' with {type:'json'};
const operation={workspace:'fictional',run_id:'run-1',expected_revision:2,idempotency_key:'operation-001',command:{operation_ref:{id:'calculate',revision:1},capability_id:'calculate',fingerprint:'snapshot-1',arguments:{quantity:10},tool_call_id:'call-1',stage_id:'review'}};
async function fixture(names=Object.keys(schemas)){
 const calls=[];const client=await NeuronClient.fromTransport({listTools:async()=>names.map(name=>({name,inputSchema:schemas[name]})),callTool:async(name,args)=>{calls.push({name,args});return {content:[],structuredContent:{status:'completed',execution_performed:true,receipt_id:'receipt-1',run_revision:3}};},close:async()=>{}});return{client,calls};
}
test('provider-free process operations preserve exact commands, revisions and request keys',async()=>{
 const {client,calls}=await fixture();
 await client.call('read_process_operations',{workspace:'fictional',run_id:'run-1'});
 const result=await client.call('execute_process_operation',operation);assert.equal(result.status,'completed');assert.deepEqual(calls[1].args,operation);
 await client.call('recover_process_operation',{workspace:'fictional',run_id:'run-1',call_id:'call-1',expected_revision:3,idempotency_key:'recover-001'});
 assert.deepEqual(calls.map(c=>c.name),['read_process_operations','execute_process_operation','recover_process_operation']);
 assert.equal(calls.length,3);assert.ok(!calls.some(c=>c.name==='guide_process_run'||c.name==='execute_process_action'));
});
test('operation commands cannot carry policy verdicts, actor overrides or missing fences',async()=>{
 const {client,calls}=await fixture();
 for(const value of [
  {...operation,principal:'other-user'},
  {...operation,command:{...operation.command,policy_assessments:[]}},
  {...operation,command:{...operation.command,confirmed:true}},
  {...operation,expected_revision:undefined},
  {...operation,command:{...operation.command,operation_ref:{id:'calculate'}}},
 ])await assert.rejects(client.call('execute_process_operation',value),e=>e.code==='invalid_arguments');
 assert.equal(calls.length,0);
 await assert.rejects(client.call('read_process_operations',{workspace:'fictional',run_id:'run-1',context_offset:1}),e=>e.code==='invalid_arguments');
});
test('unavailable provider-free operation is not replaced with a hosted guide or retried',async()=>{
 const {client,calls}=await fixture(['start_process_run','read_process_run','guide_process_run']);
 await assert.rejects(client.call('execute_process_operation',operation),e=>e.code==='unavailable_tool');assert.equal(calls.length,0);
});
