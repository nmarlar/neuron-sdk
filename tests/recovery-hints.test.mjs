import test from 'node:test';
import assert from 'node:assert/strict';
import {NeuronClient} from '../dist/index.js';
import schemas from '../dist/tool-schemas.json' with {type:'json'};
const fixture=async hint=>NeuronClient.fromTransport({listTools:async()=>[{name:'start_process_run',inputSchema:schemas.start_process_run}],callTool:async()=>({isError:true,content:[{type:'text',text:'PRIVATE DETAIL'}],structuredContent:{error:{code:'state_conflict',correlation_id:'id',recovery:hint}}}),close:async()=>{}});
const command={workspace:'w',process_id:'p',case_id:'c',idempotency_key:'request-001'};
test('explicit conflict hints guide inspection without retry or authority',async()=>{
 for(const [reason,next_step] of [['stale_revision','refresh_state'],['release_changed','refresh_context_and_reassess'],['idempotency_conflict','inspect_original_command'],['operation_in_progress','retrieve_saved_outcome'],['confirmation_required','review_and_confirm']]) {
  const client=await fixture({reason,next_step,automatic_retry:false});
  await assert.rejects(client.processes.start(command),error=>error.code==='state_conflict'&&error.recovery?.reason===reason&&error.recovery.nextStep===next_step&&error.recovery.automaticRetry===false&&!error.message.includes('PRIVATE'));
 }
});
test('unknown, mismatched or retry-authorizing hints fall back to broad conflict',async()=>{
 for(const hint of [{reason:'stale_revision',next_step:'execute',automatic_retry:false},{reason:'release_changed',next_step:'refresh_context_and_reassess',automatic_retry:true},{reason:'untrusted',next_step:'execute',automatic_retry:false},null]) {
  const client=await fixture(hint);await assert.rejects(client.processes.start(command),error=>error.code==='state_conflict'&&error.recovery===undefined);
 }
});
