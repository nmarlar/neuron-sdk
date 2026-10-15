// Installed-package example: no repository build or business-specific identifiers.
import { NeuronClient } from '@neuron/sdk';
const endpoint=process.env.NEURON_MCP_ENDPOINT;
const accessToken=process.env.NEURON_ACCESS_TOKEN;
if(!endpoint || !accessToken)throw new Error('Set a Neuron MCP endpoint and a consented OAuth access token.');
const client=await NeuronClient.connect({endpoint,accessToken});
try {
 const catalog=await client.call('discover_workspace_contexts',{});
 console.log(JSON.stringify(catalog,null,2));
}finally{await client.close();}
