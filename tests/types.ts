import { NeuronClient } from '../dist/index.js';
function contracts(client: NeuronClient) {
  void client.processes.context({ workspace: 'w', process_id: 'purchase', view: 'focused', stage_id: 'check' });
  void client.processes.start({ workspace: 'w', process_id: 'purchase', case_id: 'c', idempotency_key: 'request-key' });
  // @ts-expect-error revisions are numeric, not text
  void client.processes.saveInputs({ workspace: 'w', run_id: 'r', expected_revision: '1', expected_release_version: 1, idempotency_key: 'request-key', inputs: {} });
  // @ts-expect-error callers cannot impersonate a tenant
  void client.models.discover({ tenant: 'other' });
  // @ts-expect-error no arbitrary database query API
  void client.call('query_sql', { sql: 'SELECT *' });
  // @ts-expect-error execution requires release/revision fences
  void client.processes.execute({ workspace: 'w', run_id: 'r', action_id: 'a', confirmed: true, idempotency_key: 'request-key' });
}
async function receiptTypes(client: NeuronClient) {
  const run = await client.processes.start({ workspace: 'w', process_id: 'purchase', case_id: 'c', idempotency_key: 'request-key' });
  await client.processes.readData({ workspace: 'w', run_id: run.id, expected_revision: run.revision, expected_release_version: run.release_version, idempotency_key: 'read-key', stage_id: 'budget' });
}
void contracts; void receiptTypes;

async function reviewedTypes(client: NeuronClient) {
 const run = await client.processes.read({workspace:'w',run_id:'r'});
 const observation = run.stage_data?.budget_check?.packet.observations.budget;
 if (observation?.status === 'observed') { const complete: boolean = observation.result.complete; void complete; }
 const command = { workspace:'w',run_id:'r',action_id:'a',expected_revision:1,expected_case_revision:0,expected_release_version:1,idempotency_key:'test-key' };
 // @ts-expect-error confirmation must be explicit at compile time
 void client.processes.execute(command);
 // @ts-expect-error false cannot grant execution intent
 void client.processes.execute({...command,confirmed:false});
}
void reviewedTypes;

async function discoveryTypes(client: NeuronClient) {
 const catalog = await client.call('discover_operating_models', {});
 const version: number | undefined = catalog.operating_models[0]?.version;
 const context = await client.processes.context({workspace:'w',process_id:'p'});
 const name: string = context.process.name;
 void version; void name;
}
void discoveryTypes;

async function toolkitResultTypes(client: NeuronClient) {
 const catalog=await client.toolkits.discover();
 const version: number | undefined=catalog.candidates[0]?.version;
 const proposal=await client.toolkits.proposalStatus({workspace:'w',action_id:'p'});
 const state: 'pending'|'confirmed'|'rejected'|'expired'=proposal.status;
 const expiry: string=proposal.expires_at;
 void version;void state;void expiry;
}
void toolkitResultTypes;

function currentToolTypes(client: NeuronClient) {
 void client.call('discover_computation_workspaces', {});
 void client.call('recommend_model_setup', {workspace:'w',message:'Track incoming stock'});
 void client.call('run_computation_outcome', {workspace:'w',message:'Plan tomorrow',idempotency_key:'plan-test-001'});
 // @ts-expect-error applying a recommendation requires both revision fences
 void client.call('apply_model_setup', {workspace:'w',recommendation_id:'a'.repeat(32),idempotency_key:'apply-test-001'});
 // @ts-expect-error caller cannot provide executable code or database credentials
 void client.call('run_computation_outcome', {workspace:'w',message:'Plan',idempotency_key:'plan-test-001',code:'print(1)'});
}
void currentToolTypes;

function importTypes(client: NeuronClient) {
 void client.call('begin_model_import',{workspace:'w',total_chunks:1,sha256:'a'.repeat(64),idempotency_key:'upload-test-001'});
 // @ts-expect-error committing model definitions needs the original context fingerprint
 void client.call('commit_model_import',{workspace:'w',import_id:'a'.repeat(32),expected_context_revision:0,expected_model_revision:1,idempotency_key:'import-test-001'});
}
void importTypes;
