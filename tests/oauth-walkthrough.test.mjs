import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NeuronClient} from '../dist/index.js';
import schemas from '../dist/tool-schemas.json' with {type:'json'};
import {discover,readModel,readProcess,readStage} from '../examples/oauth-web/walkthrough.mjs';
import {createExample} from '../examples/oauth-web/server.mjs';
import {Sessions} from '../examples/oauth-web/sessions.mjs';
const workspace='fictional-workspace',version=3;
const process={id:'purchase',name:'Review <script>unsafe()</script>',purpose:'Review the requirement'};
const stages=[{id:'need',name:'Describe need',purpose:'Record the requirement'},{id:'review',name:'Review',purpose:'Check approval'}];
function fixture({change=false,noModels=false}={}){
 const calls=[];
 const result=value=>({structuredContent:value,content:[]});
 const payloads={read_operating_model:{workspace,version,model:{processes:[{...process,stages}],policies:[{text:'Never bypass review'}],description:'x'.repeat(200)}},read_process_context:{scope:{workspace,version},process,stage_directory:stages,stages,policies:[{text:'Never bypass review'}]}};
 const transport={listTools:async()=>Object.keys(schemas).map(name=>({name,inputSchema:schemas[name]})),close:async()=>{},callTool:async(name,args)=>{
  calls.push({name,args});
  if(name==='discover_workspace_contexts')return result({contexts:[{workspace,name:'Fictional purchasing'}],total:1,next_offset:null});
  if(name==='discover_operating_models')return result({operating_models:noModels?[]:[{workspace,name:'Fictional model',version,scope:'published'}],guidance:'Read first'});
  const value=payloads[name];if(!value)throw Error('Mutation or unexpected call: '+name);
  const text=JSON.stringify(value),offset=args.context_offset??0,next=Math.min(offset+80,text.length);
  return result({context_format:'ordered_json_segments',release_version:change&&offset?4:version,context_fingerprint:createHash('sha256').update(text).digest('hex'),total_chars:text.length,context_offset:offset,context_json:text.slice(offset,next),next_context_offset:next===text.length?null:next,complete:next===text.length});
 }};
 return {calls,client:()=>NeuronClient.fromTransport(transport)};
}
test('complete journey uses only read tools and pins every model/process/stage segment',async()=>{
 const f=fixture(),client=await f.client(),catalog=await discover(client);
 const model=await readModel(client,catalog,workspace);
 const p=await readProcess(client,workspace,model,'purchase');
 const stage=await readStage(client,workspace,model,p,'review');
 assert.equal(model.model.description.length,200);assert.equal(stage.policies[0].text,'Never bypass review');
 const allowed=['discover_workspace_contexts','discover_operating_models','read_operating_model','read_process_context'];
 assert.ok(f.calls.every(c=>allowed.includes(c.name)));
 for(const c of f.calls.filter(c=>c.name.startsWith('read_'))){assert.equal(c.args.expected_release_version,version);if(c.args.context_offset)assert.match(c.args.expected_context_fingerprint,/^[a-f0-9]{64}$/);}
 assert.deepEqual([...new Set(f.calls.filter(c=>c.name==='read_process_context').map(c=>c.args.view))],['overview','details','focused']);
 assert.ok(f.calls.some(c=>c.args.stage_id==='review'));
 await assert.rejects(readProcess(client,workspace,model,'invented'));await assert.rejects(readStage(client,workspace,model,p,'invented'));
 await client.close();
});
test('missing model consent and changed snapshots never become successful reads',async()=>{
 const missing=fixture({noModels:true}),client=await missing.client();
 await assert.rejects(readModel(client,await discover(client),workspace),/separately authorized/);
 assert.equal(missing.calls.filter(c=>c.name==='read_operating_model').length,0);
 const changed=fixture({change:true}),other=await changed.client();
 await assert.rejects(readModel(other,await discover(other),workspace),e=>e.code==='context_changed');
});
test('HTTP walkthrough enforces CSRF, rejects mutations and escapes model output',async()=>{
 const f=fixture(),sessions=new Sessions(),s=sessions.create();s.tokens={access_token:'synthetic'};s.provider={};
 const server=createExample({endpoint:'https://neuron.example/mcp',port:18877,sessions,connect:()=>f.client()});
 await new Promise((resolve,reject)=>server.once('error',reject).listen(18877,'127.0.0.1',resolve));
 try{
  const request=(path,body,headers={})=>fetch('http://127.0.0.1:18877'+path,{method:'POST',headers:{origin:'http://127.0.0.1:18877',cookie:'neuron_sdk_session='+s.id,...headers},body:new URLSearchParams({csrf:s.csrf,...body})});
  assert.equal((await request('/discover',{}, {origin:'https://evil.example'})).status,403);
  assert.equal((await request('/discover',{csrf:'wrong'})).status,403);
  assert.equal((await request('/execute',{})).status,404);
  assert.equal((await request('/discover',{})).status,200);
  let response=await request('/model',{workspace});assert.equal(response.status,200);const html=await response.text();assert.match(html,/Full published model read/);assert.match(html,/<details><summary>Complete published model JSON/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  response=await request('/process',{process:'purchase'});assert.equal(response.status,200);assert.match(await response.text(),/Complete process rules/);
  response=await request('/stage',{stage:'review'});assert.equal(response.status,200);const stageHtml=await response.text();assert.match(stageHtml,/Stage context read/);assert.match(stageHtml,/<option value="review" selected>/);
  assert.equal((await request('/stage',{stage:'invented'})).status,400);
  s.release.model.processes[0].name='<script>unsafe()</script>';
  response=await request('/model',{workspace});assert.equal(response.status,200);
  assert.doesNotMatch(await response.text(),/<script>/);
  assert.ok(f.calls.every(c=>!c.name.includes('execute')&&!c.name.includes('start_')));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
