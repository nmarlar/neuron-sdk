import {mkdtemp,writeFile,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const home=await mkdtemp(join(tmpdir(),'neuron-sdk-package-'));
const npm=(args,cwd)=>{
 const result=spawnSync(process.execPath,[process.env.npm_execpath,...args],{cwd,env:process.env,encoding:'utf8',timeout:60000});
 if(result.status!==0)throw Error('Package command failed: '+args[0]+'\n'+result.stderr);
 return result.stdout;
};
try{
 if(!process.env.npm_execpath)throw Error('Run this check with npm run test:package.');
 npm(['pack','--pack-destination',home],process.cwd());
 const archive=(await readdir(home)).find(name=>name.endsWith('.tgz'));if(!archive)throw Error('No packed package');
 await writeFile(join(home,'package.json'),JSON.stringify({type:'module',private:true}));
 npm(['install',join(home,archive),'--ignore-scripts','--no-audit','--no-fund'],home);
 const installed=join(home,'node_modules','@neuron','sdk');
 const metadata=JSON.parse(await readFile(join(installed,'package.json'),'utf8'));
 if(metadata.license!=='MIT'||!(await readFile(join(installed,'LICENSE'),'utf8')).startsWith('MIT License'))throw Error('Missing SDK MIT license');

 await writeFile(join(home,'consumer.mjs'),`import {NeuronClient} from '@neuron/sdk';
import {Sessions} from './node_modules/@neuron/sdk/examples/oauth-web/sessions.mjs';
import {inspectConnection} from './node_modules/@neuron/sdk/examples/acceptance/inspect.mjs';
if(![NeuronClient,Sessions,inspectConnection].every(v=>typeof v==='function'))throw Error('Missing packaged exports');
const client=await NeuronClient.fromTransport({listTools:async()=>[],callTool:async()=>{throw Error('Unexpected call');},close:async()=>{}});
if(client.availableTools().length!==0)throw Error('Invalid installed client');await client.close();
`);
 const result=spawnSync(process.execPath,[join(home,'consumer.mjs')],{cwd:home,encoding:'utf8'});if(result.status!==0)throw Error('Installed consumer failed: '+result.stderr);
 console.log('Packed SDK and all examples import and run from a separate consumer project.');
}finally{await rm(home,{recursive:true,force:true});}
