import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NeuronClient, NeuronError, completeAuthorization } from '../dist/index.js';
import schemas from '../dist/tool-schemas.json' with { type: 'json' };
const response = value => ({ content: [], structuredContent: value });
const saved = { workspace: 'w', run_id: 'r', expected_revision: 1, expected_release_version: 1, idempotency_key: 'save-inputs', inputs: {} };
async function fixture(handler, limits) {
  const calls = [];
  const client = await NeuronClient.fromTransport({ listTools: async () => Object.entries(schemas).map(([name,inputSchema])=>({name,inputSchema})), callTool: async (name,args) => {calls.push({name,args});return handler(name,args);},close:async()=>{} },limits);
  return {client,calls};
}
const rejects = (p,code) => assert.rejects(p,e=>e instanceof NeuronError && e.code===code);
test('nonfinite arbitrary nested JSON and unsafe control integers fail before transport', async()=>{
 const {client,calls}=await fixture(()=>response({}));
 for(const n of [NaN,Infinity,-Infinity]) {
  await rejects(client.processes.saveInputs({...saved,inputs:{budget:n}}),'invalid_arguments');
  await rejects(client.toolkits.invoke({workspace:'w',agent:'a',operation:'x',request_id:'numeric-test',arguments:{nested:[{amount:n}]}}),'invalid_arguments');
 }
 for(const n of [Infinity,2**53]) await rejects(client.processes.saveInputs({...saved,expected_revision:n}),'invalid_arguments');
 assert.equal(calls.length,0);
 await client.call('save_process_inputs',{...saved,inputs:{amount:'123.45',enabled:true,nullable:null,finite:1.25}});
 assert.equal(calls.length,1); assert.equal(calls[0].args.inputs.amount,'123.45');
});
test('missing, null, unsafe or wrong-run continuation receipts never trigger follow-up',async()=>{
 for(const revision of [undefined,null,-1,2**53]) {
  const pointer={details_available:true,id:'r'}; if(revision!==undefined)pointer.revision=revision;
  const {client,calls}=await fixture(()=>response(pointer));
  await rejects(client.processes.readData({workspace:'w',run_id:'r',expected_revision:1,expected_release_version:1,idempotency_key:'read-stage',stage_id:'s'}),'invalid_response'); assert.equal(calls.length,1);
 }
 const {client,calls}=await fixture(()=>response({details_available:true,id:'different',revision:2}));
 await rejects(client.processes.readData({workspace:'w',run_id:'r',expected_revision:1,expected_release_version:1,idempotency_key:'read-stage',stage_id:'s'}),'invalid_response');assert.equal(calls.length,1);
});
test('direct snapshots enforce requested versions, identity and size',async()=>{
 const wrong=await fixture(()=>response({version:12,model:{}}));
 await rejects(wrong.client.models.read({workspace:'w',expected_release_version:3}),'context_changed');
 const large=await fixture(()=>response({version:1,model:{text:'a'.repeat(100)}}),{maxContextChars:10});
 await rejects(large.client.models.read({workspace:'w'}),'result_limit');
 const other=await fixture(()=>response({id:'other',revision:1}));
 await rejects(other.client.processes.read({workspace:'w',run_id:'r'}),'invalid_response');
});
test('segmented snapshot must match both caller fence and inner version',async()=>{
 for(const [requested,inner] of [[3,12],[12,9]]) {
  const text=JSON.stringify({version:inner,model:{}});
  const {client,calls}=await fixture(()=>response({context_format:'ordered_json_segments',context_offset:0,next_context_offset:null,complete:true,total_chars:text.length,release_version:12,context_json:text,context_fingerprint:createHash('sha256').update(text).digest('hex')}));
  await rejects(client.models.read({workspace:'w',expected_release_version:requested}),'context_changed'); assert.equal(calls.length,1);
 }
});
test('empty or unrelated action receipts cannot imply execution',async()=>{
 const args={workspace:'w',action_id:'a',case_id:'c',confirmed:true,idempotency_key:'execute-action',expected_release_version:1,expected_case_revision:0};
 for(const receipt of [{},{id:'receipt',allowed:true,executed:true,status:'executed',replayed:false,action_id:'other',case_id:'c',release_version:1,case_revision:0}]) {
  const {client}=await fixture(()=>response(receipt)); await rejects(client.models.execute(args),'invalid_response');
 }
});
test('state storage exceptions are sanitized without exchanging a code',async()=>{
 await assert.rejects(completeAuthorization('https://neuron.example/mcp',{state:()=>{throw Error('PRIVATE-STORAGE-MARKER');}},{state:'s',code:'c'}),e=>e instanceof NeuronError && !e.message.includes('PRIVATE-STORAGE-MARKER'));
});

test('structured refusals expose safe categories and correlation, never raw text or authority',async()=>{
 for(const code of ['authorization_required','permission_denied','state_conflict','not_found','invalid_input']) {
  const {client,calls}=await fixture(()=>({isError:true,structuredContent:{error:{code,correlation_id:'safe-request-id',message:'PRIVATE marker',approved:true}},content:[{type:'text',text:'PRIVATE marker'}]}));
  await assert.rejects(client.processes.start({workspace:'w',process_id:'p',case_id:'c',idempotency_key:'test-request'}),e=>e.code===code && e.correlationId==='safe-request-id' && !e.message.includes('PRIVATE') && e.approved===undefined);
  assert.equal(calls.length,1);
 }
 const {client}=await fixture(()=>({isError:true,structuredContent:{error:{code:'invented_grant',message:'PRIVATE'}},content:[]}));
 await rejects(client.processes.start({workspace:'w',process_id:'p',case_id:'c',idempotency_key:'test-request'}),'operation_refused');
});
