import {createServer} from 'node:http';
import {NeuronClient,authorizeConnection,completeAuthorization,validateEndpoint} from '@neuron/sdk';
import {Sessions} from './sessions.mjs';

const endpoint=process.env.NEURON_MCP_ENDPOINT;
if(!endpoint)throw Error('Set NEURON_MCP_ENDPOINT. No token, password or provider key is needed.');
const authorizationOrigin=validateEndpoint(endpoint).origin;
const port=Number(process.env.PORT??8787);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid local port');
const origin=`http://127.0.0.1:${port}`;
const sessions=new Sessions();
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const send=(res,status,body,type='text/html')=>{res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${authorizationOrigin}; frame-ancestors 'none'; base-uri 'none'`});res.end(body);};
const server=createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${port}`){send(res,403,'Use the loopback address.');return;}
  const path=new URL(req.url,origin).pathname;
  const sid=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('neuron_sdk_session='))?.slice('neuron_sdk_session='.length);
  let session=sid?sessions.get(sid):undefined;
  if(!session){session=sessions.create();res.setHeader('Set-Cookie',`neuron_sdk_session=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200`);}
  if(req.method==='POST'){
   if(req.headers.origin!==origin){send(res,403,'Open this application to continue.');return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>8192){send(res,413,'Request too large');return;}}
   if(new URLSearchParams(body).get('csrf')!==session.csrf){send(res,403,'Reload this page and try again.');return;}
  }
  if(req.method==='GET'&&path==='/'){
   const form=(route,label)=>`<form method="post" action="${route}"><input type="hidden" name="csrf" value="${escape(session.csrf)}"><button>${label}</button></form>`;
   send(res,200,`<!doctype html><meta charset="utf-8"><title>Neuron SDK OAuth example</title><style>body{font:16px system-ui;max-width:760px;margin:60px auto;padding:20px}button{padding:12px;margin:8px 0}</style><h1>Connect your Neuron account</h1><p>This local developer example uses OAuth consent. Credentials stay with Neuron; the SDK sees only this user's consented access.</p>${form('/connect','Sign in and connect')}${session.tokens?form('/discover','Discover my workspace context'):''}${form('/disconnect','Disconnect this local application')}<p>Local, in-memory sessions. Restarting this example signs you out here. Disconnecting here does not revoke consent in Neuron.</p>`);return;
  }
  if(req.method==='POST'&&path==='/connect'){
   const attempt=sessions.attempt(session,origin+'/callback');session.provider=attempt.provider;
   const result=await authorizeConnection(endpoint,attempt.provider);
   if(result==='REDIRECT'){
    if(!attempt.attempt.url)throw Error('No authorization location');
    res.writeHead(303,{Location:attempt.attempt.url,'Cache-Control':'no-store'});res.end();
   }else{session.attempt.completed=true;res.writeHead(303,{Location:'/'});res.end();}return;
  }
  if(req.method==='GET'&&path==='/callback'){
   const query=new URL(req.url,origin).searchParams;
   if(query.has('error')){if(!session.attempt || query.get('state')!==session.attempt.state)throw Error('Invalid cancelled authorization');session.attempt=undefined;session.provider=undefined;send(res,400,'Authorization was cancelled or refused. <a href="/">Try again</a>');return;}
   if(!session.provider || session.attempt?.completed)throw Error('No authorization attempt for this browser session');
   await completeAuthorization(endpoint,session.provider,{state:query.get('state')??'',code:query.get('code')??''});
   // The attempt remains available for this session's refresh provider, but a
   // callback can only complete once; reset on a new /connect.
   session.attempt.completed=true;
   session.attempt.verifier=undefined;
   res.writeHead(303,{Location:'/','Cache-Control':'no-store'});res.end();return;
  }
  if(req.method==='POST'&&path==='/discover'){
   if(!session.provider || !session.tokens)throw Error('Sign in first');
   const client=await NeuronClient.connect({endpoint,authProvider:session.provider});
   try{const catalog=await client.call('discover_workspace_contexts',{});send(res,200,`<h1>Accessible workspace context</h1><pre>${escape(JSON.stringify(catalog,null,2))}</pre><a href="/">Back</a>`);}finally{await client.close();}return;
  }
  if(req.method==='POST'&&path==='/disconnect'){
   sessions.disconnect(session.id);res.setHeader('Set-Cookie','neuron_sdk_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');res.writeHead(303,{Location:'/','Cache-Control':'no-store'});res.end();return;
  }
  send(res,404,'Not found');
 }catch{send(res,400,'The connection could not complete. Check the endpoint and consent, or start a new authorization attempt. <a href="/">Back</a>');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local OAuth example: ${origin}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
