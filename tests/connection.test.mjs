import test from 'node:test';
import assert from 'node:assert/strict';
import { McpTransport } from '../dist/transport.js';

test('deadline bounds initialized notification and aborts its fetch', async()=>{
 const original=globalThis.fetch; let aborted=false; let methods=[];
 try {
  globalThis.fetch=async(input,init)=>{
   if(init.method==='GET')return new Response(null,{status:405});
   const m=JSON.parse(init.body);methods.push(m.method);
   if(m.method==='initialize')return Response.json({jsonrpc:'2.0',id:m.id,result:{protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'test',version:'1'}}});
   if(m.method==='notifications/initialized')return new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true});});
   return new Response(null,{status:202});
  };
  const began=performance.now();
  await assert.rejects(McpTransport.connect({endpoint:'https://neuron.example/mcp',accessToken:'synthetic',timeoutMs:40}),e=>e.code==='transport_error');
  assert.ok(performance.now()-began<500);assert.equal(aborted,true);assert.deepEqual(methods,['initialize','notifications/initialized']);
 }finally{globalThis.fetch=original;}
});
test('caller can cancel a stalled connection without retry',async()=>{
 const original=globalThis.fetch;let calls=0;let began;const started=new Promise(resolve=>{began=resolve;});
 try{
  globalThis.fetch=async(_,init)=>{calls++;began();return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('cancel')),{once:true}));};
  const controller=new AbortController();const pending=McpTransport.connect({endpoint:'https://neuron.example/mcp',accessToken:'synthetic',timeoutMs:1000,signal:controller.signal});
  await started;controller.abort();await assert.rejects(pending,e=>e.code==='transport_error');assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});

test('OAuth deadline also bounds a stalled application state provider',async()=>{
 const {completeAuthorization}=await import('../dist/index.js');
 const began=performance.now();
 await assert.rejects(completeAuthorization('https://neuron.example/mcp',{state:()=>new Promise(()=>{})},{state:'s',code:'c'},{timeoutMs:30}),e=>e.code==='transport_error');
 assert.ok(performance.now()-began<500);
});


test('legacy workspace key is rejected before sending it to the published process endpoint',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;throw Error('Unexpected network');};
  await assert.rejects(McpTransport.connect({endpoint:'https://neuron.example/api/published-mcp',accessToken:'nctx_synthetic-key'}),e=>e.code==='invalid_arguments'&&e.message.includes('/api/mcp')&&!e.message.includes('synthetic-key'));
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
