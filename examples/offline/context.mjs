import {NeuronClient} from '@neuron/sdk';
const workspace='fictional-training';
const context={revision:1,authority:'definitions_only',grounding:{business_name:'Fictional purchasing training',concepts:[{id:'purchase_request',name:'Purchase request',description:'A proposed purchase requiring review.'}],relationships:[],process_directory:[{id:'purchase',name:'Review a purchase request',stage_names:['Describe need','Review approval']}],complete:true},complete:true,next_offsets:{item_offset:null,concept_offset:null,relationship_offset:null,process_offset:null}};
const client=await NeuronClient.fromTransport({
 listTools:async()=>[{name:'read_workspace_context',inputSchema:{type:'object',properties:{workspace:{type:'string'}},required:['workspace'],additionalProperties:false}}],
 callTool:async(name,args)=>{if(name!=='read_workspace_context'||args.workspace!==workspace)throw Error('Unsupported fictional read');return {content:[],structuredContent:context};},close:async()=>{},
});
try{const answer=await client.call('read_workspace_context',{workspace});console.log('OFFLINE SAMPLE — fictional definitions; no network, provider or business action.');console.log(JSON.stringify(answer,null,2));}finally{await client.close();}
