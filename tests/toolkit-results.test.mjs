import test from 'node:test';
import assert from 'node:assert/strict';
import {NeuronClient} from '../dist/index.js';
import schemas from '../dist/tool-schemas.json' with {type:'json'};
const fixture=async value=>NeuronClient.fromTransport({listTools:async()=>Object.entries(schemas).map(([name,inputSchema])=>({name,inputSchema})),callTool:async()=>({content:[],structuredContent:value}),close:async()=>{}});
const candidate={candidate_id:'c',workspace:'w',workspace_name:'Workspace',toolkit:'kit',publisher:'owner',version:1,agent:null,name:'Kit',toolkit_name:'Kit',description:'Description',capabilities:['Read'],checks:[]};
const catalog={candidates:[candidate],workspaces:[{id:'w',name:'Workspace'}],next_cursor:null,total_candidates:1,guidance:'Choose a published kit'};
test('toolkit discovery preserves direct selection and validates pagination and scope',async()=>{
 const client=await fixture(catalog);assert.equal((await client.toolkits.discover({workspace:'w'})).candidates[0].version,1);
 for(const value of [{...catalog,candidates:[candidate,candidate],total_candidates:2},{...catalog,next_cursor:'unknown'},{...catalog,total_candidates:0},{...catalog,candidates:[{...candidate,version:NaN}]},{...catalog,requires_workspace:true}]) {
  const broken=await fixture(value);await assert.rejects(broken.toolkits.discover({workspace:'w'}),e=>e.code==='invalid_response');
 }
 await assert.rejects(client.toolkits.discover({workspace:'other'}),e=>e.code==='invalid_response');
 const scoped=await fixture({...catalog,candidates:[],next_cursor:null,total_candidates:null,requires_workspace:true});assert.equal((await scoped.toolkits.discover()).requires_workspace,true);
});
const id='12345678-1234-1234-1234-123456789abc';
const proposal={id,agent:null,action:'create_agent',arguments:{toolkit:'kit',version:1,name:'Demo'},scope:{agent:null,toolkit:'kit',publisher:'owner',version:1},fingerprint:'fingerprint',status:'pending',expires_at:'2026-10-09T15:00:00+00:00',review_url:`https://neuron.example/workspaces/w/agents/review/${id}`,result:null};
test('human proposal is typed as pending review and cannot carry model approval authority',async()=>{
 const client=await fixture(proposal);const command={workspace:'w',action:'create_agent',arguments:proposal.arguments,request_id:'proposal-request'};
 assert.equal((await client.toolkits.propose(command)).status,'pending');
 assert.equal((await client.toolkits.proposalStatus({workspace:'w',action_id:id})).scope.version,1);
 for(const value of [{...proposal,confirmation_token:'private'},{...proposal,action:'create_schedule'},{...proposal,agent:'different'},{...proposal,status:'executed'},{...proposal,expires_at:'invalid'},{...proposal,scope:{...proposal.scope,version:0}},{...proposal,review_url:'javascript:alert(1)'}]){
  const broken=await fixture(value);await assert.rejects(broken.toolkits.propose(command),e=>e.code==='invalid_response');
 }
 await assert.rejects(client.toolkits.proposalStatus({workspace:'w',action_id:'different'}),e=>e.code==='invalid_response');
});

test('toolkit and agent inventories validate usable fields without exposing saved private state',async()=>{
 const toolkit={id:'kit',name:'Kit',version:1,description:'Published toolkit',capabilities:['Read'],status:'available'};
 assert.equal((await (await fixture({toolkits:[toolkit]})).toolkits.list({workspace:'w'})).toolkits[0].version,1);
 const agent={id:'a',name:'Agent',toolkit:'kit',version:1,publisher:'owner',revision:0};
 assert.equal((await (await fixture({agents:[agent]})).toolkits.agents({workspace:'w'})).agents[0].revision,0);
 await assert.rejects((await fixture({agents:[{...agent,state:{private:'value'}}]})).toolkits.agents({workspace:'w'}),e=>e.code==='invalid_response');
 const description={...agent,workspace:'w',conversation_revision:0,references:{checks:[]},operations:[],instructions:'Use published tools',execution_mode:'direct_tools',hosted_delegation_available:false,hosted_operations:[]};
 assert.equal((await (await fixture(description)).toolkits.describe({workspace:'w',agent:'a'})).execution_mode,'direct_tools');
 await assert.rejects((await fixture(description)).toolkits.describe({workspace:'w',agent:'other'}),e=>e.code==='invalid_response');
 await assert.rejects((await fixture({...description,hosted_delegation_available:true})).toolkits.describe({workspace:'w',agent:'a'}),e=>e.code==='invalid_response');
});
