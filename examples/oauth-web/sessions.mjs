import {randomUUID} from 'node:crypto';
/** Loopback example storage. Replace with protected, per-user persistent storage
 * in a real application; restart deliberately discards local authorization. */
export class Sessions {
 constructor({clock=()=>Date.now(),ttlMs=2*60*60*1000,attemptMs=10*60*1000,scope="toolkits:read workspace_context:read"}={}){this.scope=scope;this.clock=clock;this.ttlMs=ttlMs;this.attemptMs=attemptMs;this.entries=new Map();}
 create(){for(const [id,s] of this.entries)if(s.expires<=this.clock())this.disconnect(id);if(this.entries.size>=1000)throw Error('Session capacity reached');const session={id:randomUUID(),csrf:randomUUID(),expires:this.clock()+this.ttlMs,clientInfo:undefined,tokens:undefined,attempt:undefined};this.entries.set(session.id,session);return session;}
 get(id){const s=this.entries.get(id);if(s?.expires<=this.clock()){this.disconnect(id);return undefined;}return s;}
 attempt(session,redirectUrl){
  if(this.get(session.id)!==session)throw Error('Expired session');
  const attempt={state:randomUUID(),expires:this.clock()+this.attemptMs,verifier:undefined,url:undefined,completed:false};session.attempt=attempt;
  const active=()=>{if(this.get(session.id)!==session || session.attempt!==attempt || (!attempt.completed && attempt.expires<=this.clock()))throw Error('Expired authorization attempt');};
  const provider={
   redirectUrl,clientMetadata:{client_name:'Neuron SDK local OAuth example',redirect_uris:[redirectUrl],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',scope:this.scope},
   state:()=>{active();if(attempt.completed)throw Error('Authorization callback already consumed');return attempt.state;},
   clientInformation:()=>{active();return session.clientInfo;},saveClientInformation:value=>{active();session.clientInfo=value;},
   tokens:()=>{active();return session.tokens;},saveTokens:value=>{active();session.tokens=value;},
   saveCodeVerifier:value=>{active();attempt.verifier=value;},codeVerifier:()=>{active();if(!attempt.verifier)throw Error('Missing verifier');return attempt.verifier;},
   redirectToAuthorization:url=>{active();attempt.url=url.href;},
   invalidateCredentials:scope=>{active();if(scope==='all'||scope==='tokens')session.tokens=undefined;if(scope==='all'||scope==='client')session.clientInfo=undefined;if(scope==='all'||scope==='verifier')attempt.verifier=undefined;},
  };
  return {provider,attempt};
 }
 disconnect(id){const session=this.entries.get(id);if(session){session.tokens=undefined;session.clientInfo=undefined;session.attempt=undefined;this.entries.delete(id);}}
}
