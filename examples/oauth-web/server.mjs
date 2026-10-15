import {createServer} from 'node:http';
import {NeuronClient,authorizeConnection,completeAuthorization,validateEndpoint} from '@neuron/sdk';
import {Sessions} from './sessions.mjs';
import {discover,readModel,readProcess,readStage} from './walkthrough.mjs';

const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createExample({endpoint,port=8787,connect=NeuronClient.connect,sessions=new Sessions()}) {
const authorizationOrigin=validateEndpoint(endpoint).origin;
const origin=`http://127.0.0.1:${port}`;
const send=(res,status,body,type='text/html')=>{res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${authorizationOrigin}; frame-ancestors 'none'; base-uri 'none'`});res.end(body);};

const frame=body=>`<!doctype html><meta charset="utf-8"><title>Neuron SDK read-only walkthrough</title><style>body{font:16px system-ui;max-width:960px;margin:40px auto;padding:20px;line-height:1.5}button,select{padding:10px;margin:8px 0;max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f4;padding:16px}details{margin:16px 0}h2{margin-top:32px}</style><h1>Neuron SDK read-only walkthrough</h1><p>Read definitions and process rules. This example does not create runs, read source records, call an AI provider or execute business actions.</p>${body}`;
const json=value=>`<pre>${escape(JSON.stringify(value,null,2))}</pre>`;
const form=(session,route,label,fields='')=>`<form method="post" action="${route}"><input type="hidden" name="csrf" value="${escape(session.csrf)}">${fields}<button>${label}</button></form>`;
const select=(name,items,selected)=>`<label>${name === 'workspace' ? 'Published model' : name === 'process' ? 'Process' : 'Stage'} <select name="${name}">${items.map(item=>`<option value="${escape(item.workspace??item.id)}"${(item.workspace??item.id)===selected?' selected':''}>${escape(item.name)}${item.version?` · version ${escape(item.version)}`:''}</option>`).join('')}</select></label>`;
const server=createServer(async(req,res)=>{
 let session;
 try{
  if(req.headers.host!==`127.0.0.1:${port}`){send(res,403,'Use the loopback address.');return;}
  const path=new URL(req.url,origin).pathname;
  const sid=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('neuron_sdk_session='))?.slice('neuron_sdk_session='.length);
  session=sid?sessions.get(sid):undefined;
  if(!session){session=sessions.create();res.setHeader('Set-Cookie',`neuron_sdk_session=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200`);}
  let fields=new URLSearchParams();
  if(req.method==='POST'){
   if(req.headers.origin!==origin){send(res,403,'Open this application to continue.');return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>8192){send(res,413,'Request too large');return;}}
   fields=new URLSearchParams(body);
   if(fields.get('csrf')!==session.csrf){send(res,403,'Reload this page and try again.');return;}
  }
  if(req.method==='GET'&&path==='/'){
   send(res,200,frame(`<h2>1. Connect</h2><p>Sign in to Neuron. Select <strong>Business context and setup</strong> for your workspace, and its <strong>Operating model</strong> to read the published model and processes. Leave other capabilities unchecked. Both requested scopes are read-only.</p>${form(session,'/connect','Sign in and connect')}${session.tokens?form(session,'/discover','Discover my workspace context and models'):''}${form(session,'/disconnect','Disconnect this local application')}<p>Local, in-memory sessions. Restarting this example signs you out here. Disconnecting here does not revoke consent in Neuron.</p>`));return;
  }
  if(req.method==='POST'&&path==='/connect'){
   delete session.catalog;delete session.release;delete session.workspace;delete session.process;
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
  if(req.method==='POST'&&['/discover','/model','/process','/stage'].includes(path)){
   if(!session.provider || !session.tokens)throw Error('Sign in first');
   const client=await connect({endpoint,authProvider:session.provider});
   try{
    const back='<p><a href="/">Connection home</a></p>';
    if(path==='/discover'){
     session.catalog=await discover(client);delete session.release;delete session.process;
     const models=session.catalog.models.operating_models;
     send(res,200,frame(`<h2>2. Choose a published model</h2><p>Only separately consented published models appear below. Workspace context permission alone does not grant a published model.</p>${models.length?form(session,'/model','Read full published model',select('workspace',models)):'<p>No published model is available. Reconnect and select its Operating model entry, or ask a workspace manager to publish one. This example will not create or publish one for you.</p>'}<details><summary>Workspace discovery response</summary>${json(session.catalog.contexts)}</details><details><summary>Published model discovery response</summary>${json(session.catalog.models)}</details>${back}`));
    }else if(path==='/model'){
     if(!session.catalog)throw Error('Discover workspaces and models first.');
     const release=await readModel(client,session.catalog,fields.get('workspace'));
     session.release=release;session.workspace=fields.get('workspace');delete session.process;
     const processes=release.model.processes??[];
     send(res,200,frame(`<h2>3. Full published model read</h2><p>Version ${escape(release.version)}. The SDK assembled and validated all returned model segments before showing this result. This is the permitted published snapshot, not unpublished drafts, source credentials or live business records.</p>${processes.length?form(session,'/process','Read process flow',select('process',processes)):'<p>This published model has no adaptive processes. Ask its manager to configure and publish one before trying the process walkthrough. No setup was changed.</p>'}<details><summary>Complete published model JSON</summary>${json(release)}</details>${back}`));
    }else if(path==='/process'){
     if(!session.release)throw Error('Read the model first.');
     const process=await readProcess(client,session.workspace,session.release,fields.get('process'));
     session.process=process;
     const stages=process.overview.stage_directory??[];
     send(res,200,frame(`<h2>4. Process flow</h2><h3>${escape(process.overview.process.name)}</h3><p>${escape(process.overview.process.purpose)}</p><p>Version ${escape(session.release.version)}. These are saved definitions, not evidence of a completed process or current operational readiness. Links describe the modeled flow; stage order alone does not authorize an action.</p>${stages.length?form(session,'/stage','Read stage rules and requirements',select('stage',stages)):'<p>No stages are configured for this process.</p>'}<details open><summary>Stage directory and flow overview</summary>${json(process.overview)}</details><details><summary>Complete process rules, links and governance</summary>${json(process.details)}</details>${back}`));
    }else{
     if(!session.process || !session.release)throw Error('Read the process first.');
     const stage=await readStage(client,session.workspace,session.release,session.process,fields.get('stage'));
     send(res,200,frame(`<h2>5. Stage context read</h2><p>Complete focused context for stage ${escape(fields.get('stage'))}, including applicable rules returned by Neuron. Your application can now explain the required inputs, responsibilities and next choices using these definitions. No run or business action has been created.</p>${form(session,'/stage','Read another stage',select('stage',session.process.overview.stage_directory??[],fields.get('stage')))}<details open><summary>Stage requirements and applicable rules</summary>${json(stage)}</details>${back}`));
    }
   }finally{await client.close();}return;
  }
  if(req.method==='POST'&&path==='/disconnect'){
   sessions.disconnect(session.id);res.setHeader('Set-Cookie','neuron_sdk_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');res.writeHead(303,{Location:'/','Cache-Control':'no-store'});res.end();return;
  }
  send(res,404,'Not found');
 }catch(error){
  const messages={context_changed:'The model or access changed during this read. Discover again and read the current model; no partial result is shown.',state_conflict:'The saved release changed. Discover again and restart the read.',permission_denied:'This read is not permitted. Reconnect and select the required model, or check your current workspace rights.',authorization_required:'Sign in and authorize the connection again.',unavailable_tool:'This server does not expose the requested read under the current connection.',transport_error:'The read did not complete. Check the endpoint and connection before trying again.'};
  send(res,400,frame(`<h2>Read not completed</h2><p>${escape(messages[error?.code]??'Check the endpoint, selected access and published process configuration. Start with discovery, then read the model before choosing a process or stage. No business action was attempted.')}</p><a href="/">Back to connection</a>${session?.tokens?form(session,'/discover','Discover again'):''}`));
 }
});
return server;
}

if(process.argv[1] && new URL(import.meta.url).pathname===process.argv[1]){
 const endpoint=process.env.NEURON_MCP_ENDPOINT;
 if(!endpoint)throw Error('Set NEURON_MCP_ENDPOINT. No token, password or provider key is needed.');
 const port=Number(process.env.PORT??8787);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid local port');
 const server=createExample({endpoint,port});
 server.listen(port,'127.0.0.1',()=>console.log(`Local OAuth example: http://127.0.0.1:${port}`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
}
