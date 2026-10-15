import test from 'node:test';
import assert from 'node:assert/strict';
import {Sessions} from '../examples/oauth-web/sessions.mjs';
import {completeAuthorization} from '../dist/index.js';

test('OAuth state, PKCE and token storage are isolated per browser session and attempt',async()=>{
 const sessions=new Sessions();const a=sessions.create(),b=sessions.create();
 const first=sessions.attempt(a,'http://127.0.0.1:8787/callback');const second=sessions.attempt(b,'http://127.0.0.1:8787/callback');
 assert.notEqual(first.provider.state(),second.provider.state());
 first.provider.saveCodeVerifier('first-private-verifier');first.provider.saveTokens({access_token:'first-token',token_type:'Bearer'});
 assert.equal(second.provider.tokens(),undefined);assert.throws(()=>second.provider.codeVerifier());
 await assert.rejects(completeAuthorization('https://neuron.example/mcp',second.provider,{state:first.provider.state(),code:'c'}),e=>e.code==='invalid_arguments');
 sessions.attempt(a,'http://127.0.0.1:8787/callback');assert.throws(()=>first.provider.state());
});
test('expired or disconnected attempts cannot use tokens; successful session may refresh after callback deadline',()=>{
 let now=0;const sessions=new Sessions({clock:()=>now,attemptMs:10,ttlMs:100});const s=sessions.create();let a=sessions.attempt(s,'http://127.0.0.1:8787/callback');
 now=11;assert.throws(()=>a.provider.state());
 a=sessions.attempt(s,'http://127.0.0.1:8787/callback');a.provider.saveTokens({access_token:'t',token_type:'Bearer'});a.attempt.completed=true;
 now=30;assert.equal(a.provider.tokens().access_token,'t');assert.throws(()=>a.provider.state());
 sessions.disconnect(s.id);assert.throws(()=>a.provider.tokens());assert.equal(s.tokens,undefined);
});

test('example defaults to read-only workspace context; legacy execution is explicit',()=>{
 const sessions=new Sessions();const session=sessions.create();
 const {provider}=sessions.attempt(session,'http://127.0.0.1:8787/callback');
 assert.equal(provider.clientMetadata.scope,'toolkits:read workspace_context:read');
 assert.doesNotMatch(provider.clientMetadata.scope,/toolkits:execute|workspace_context:write|agents:manage/);
 const legacy=new Sessions({scope:'toolkits:read toolkits:execute'});
 assert.equal(legacy.attempt(legacy.create(),'http://127.0.0.1:8787/callback').provider.clientMetadata.scope,'toolkits:read toolkits:execute');
});
