import {readFile,writeFile} from 'node:fs/promises';
import {NeuronClient} from '@neuron/sdk';
import {inspectConnection} from './inspect.mjs';
// A caller-owned private token file is an advanced test option. Normal onboarding
// is examples/oauth-web, which uses consent rather than copied credentials.
let client;
try{
 const [configPath,outputPath]=process.argv.slice(2);
 if(!configPath)throw Error('Pass a private config-file path, optionally followed by a new report path.');
 const config=JSON.parse(await readFile(configPath,'utf8'));
 const allowed=['endpoint','accessToken','workspace','processId','stageId','runId'];
 if(!config || Array.isArray(config) || Object.keys(config).some(k=>!allowed.includes(k)) || !['endpoint','accessToken','workspace'].every(k=>typeof config[k]==='string'&&config[k]) || ['processId','stageId','runId'].some(k=>config[k]!==undefined && typeof config[k]!=='string'))throw Error('Invalid acceptance configuration.');
 client=await NeuronClient.connect({endpoint:config.endpoint,accessToken:config.accessToken});
 const report=await inspectConnection(client,config);
 const text=JSON.stringify(report,null,2)+'\n';
 if(outputPath){await writeFile(outputPath,text,{mode:0o600,flag:'wx'});console.log('Read-only connection checks completed; summary saved.');}
 else console.log(text);
}catch(error){
 // Only expose the SDK's safe category, not config, raw endpoint errors or tokens.
 console.error('Acceptance did not complete. '+(typeof error?.code==='string'&&/^[a-z_]+$/.test(error.code)?`Category: ${error.code}. `:'')+'Check the selected connection, permissions and resource IDs.');process.exitCode=1;
}finally{if(client)await client.close().catch(()=>{console.error('Connection cleanup did not complete.');process.exitCode=1;});}
