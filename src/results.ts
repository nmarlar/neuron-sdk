import type { JsonObject } from './contracts.js';
import { NeuronError } from './errors.js';

export type DefinitionReference = JsonObject & { id: string; revision: number };
export type DataResult = JsonObject & { definition: DefinitionReference; rows: JsonObject[]; record_count: number; complete: boolean; meaning: string; grain: string; unmatched_references: Record<string, number>; source_fingerprints: Record<string, string>; observed_at: string };
export type StageObservation = (JsonObject & { status: 'observed'; result: DataResult }) | (JsonObject & { status: 'inputs_required'; missing_inputs: (JsonObject & { input: string; meaning: string; value_type: string })[] }) | (JsonObject & { status: 'unavailable'; code: string; message: string });
export type StagePacket = JsonObject & { process_id?: string; stage_id?: string; observations: Record<string, StageObservation>; required_data_complete: boolean; blocked_requirements?: string[]; supports_effects: false };
export type SavedStageData = JsonObject & { packet: StagePacket; release_version: number; read_at: string; inputs_fingerprint: string };
export type ProcessRun = JsonObject & { stage_data?: Record<string, SavedStageData>; id: string; process_id: string; case_id: string; revision: number; case_revision: number; release_version: number; scope: string };
export type ActionSimulation = JsonObject & { allowed: boolean; action_id: string; case_id: string; release_version: number; case_revision: number };
export type PublishedModel = JsonObject & { version: number; model: JsonObject };

function integer(value: unknown, minimum: number): boolean { return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum; }
export function processRun(value: JsonObject): ProcessRun {
  if (!['id', 'process_id', 'case_id', 'scope'].every(k => typeof value[k] === 'string' && value[k]) || !integer(value.revision, 0) || !integer(value.case_revision, 0) || !integer(value.release_version, 1)) throw new NeuronError('invalid_response', 'Invalid process-run receipt. Inspect saved state before retrying a mutation.');
  if (value.stage_data !== undefined) validateStageData(value.stage_data);
  return value as ProcessRun;
}
export function simulation(value: JsonObject): ActionSimulation {
  if (typeof value.allowed !== 'boolean' || typeof value.action_id !== 'string' || typeof value.case_id !== 'string' || !integer(value.release_version, 1) || !integer(value.case_revision, 0)) throw new NeuronError('invalid_response', 'Invalid action simulation; do not execute from this result.');
  return value as ActionSimulation;
}
export function publishedModel(value: JsonObject): PublishedModel {
  if (!integer(value.version, 1) || !value.model || typeof value.model !== 'object' || Array.isArray(value.model)) throw new NeuronError('invalid_response', 'Invalid published model snapshot.');
  return value as PublishedModel;
}

export type ActionReceipt = ActionSimulation & { id: string; status: 'executed' | 'blocked'; executed: boolean; replayed: boolean; result?: JsonObject };
export function actionReceipt(value: JsonObject, expected: { action_id: string; case_id: string; expected_release_version: number }): ActionReceipt {
  simulation(value);
  if (typeof value.id !== 'string' || !value.id || !['executed', 'blocked'].includes(value.status as string) || typeof value.executed !== 'boolean' || typeof value.replayed !== 'boolean' || value.executed !== (value.status === 'executed') || value.allowed !== value.executed || value.action_id !== expected.action_id || value.case_id !== expected.case_id || value.release_version !== expected.expected_release_version) throw new NeuronError('invalid_response', 'Invalid action receipt. Inspect saved state before retrying.');
  if (value.executed && (!value.result || typeof value.result !== 'object' || Array.isArray(value.result) || !integer((value.result as JsonObject).case_revision, 0) || (value.result as JsonObject).completed_action !== expected.action_id)) throw new NeuronError('invalid_response', 'Executed action has no verified completion result.');
  return value as ActionReceipt;
}

function isObject(value: unknown): value is JsonObject { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validateStageData(value: unknown): void {
  const fail = () => { throw new NeuronError('invalid_response', 'Malformed saved stage observations.'); };
  if (!isObject(value)) return fail();
  for (const saved of Object.values(value)) {
    if (!isObject(saved) || !integer(saved.release_version, 1) || typeof saved.read_at !== 'string' || typeof saved.inputs_fingerprint !== 'string' || !isObject(saved.packet)) return fail();
    const packet = saved.packet;
    if (typeof packet.required_data_complete !== 'boolean' || packet.supports_effects !== false || !isObject(packet.observations)) return fail();
    for (const observation of Object.values(packet.observations)) {
      if (!isObject(observation)) return fail();
      if (observation.status === 'observed') {
        const r = observation.result;
        if (!isObject(r) || !isObject(r.definition) || typeof r.definition.id !== 'string' || !integer(r.definition.revision, 1) || !Array.isArray(r.rows) || !r.rows.every(isObject) || !integer(r.record_count, 0) || typeof r.complete !== 'boolean' || typeof r.meaning !== 'string' || typeof r.grain !== 'string' || !isObject(r.unmatched_references) || !Object.values(r.unmatched_references).every(n => integer(n, 0)) || !isObject(r.source_fingerprints) || !Object.values(r.source_fingerprints).every(s => typeof s === 'string') || typeof r.observed_at !== 'string') return fail();
      } else if (observation.status === 'inputs_required') {
        if (!Array.isArray(observation.missing_inputs) || !observation.missing_inputs.every(i => isObject(i) && typeof i.input === 'string' && typeof i.meaning === 'string' && typeof i.value_type === 'string')) return fail();
      } else if (observation.status === 'unavailable') {
        if (typeof observation.code !== 'string' || typeof observation.message !== 'string') return fail();
      } else return fail();
    }
  }
}

export type ModelDiscovery = JsonObject & { operating_models: (JsonObject & { workspace: string; name: string; version: number; scope: string })[]; guidance: string };
export function modelDiscovery(value: JsonObject): ModelDiscovery {
  if (!Array.isArray(value.operating_models) || typeof value.guidance !== 'string' || !value.operating_models.every(m => isObject(m) && typeof m.workspace === 'string' && typeof m.name === 'string' && integer(m.version, 1) && typeof m.scope === 'string')) throw new NeuronError('invalid_response', 'Invalid operating-model discovery result.');
  return value as ModelDiscovery;
}
export type ProcessContext = JsonObject & { scope: JsonObject & { workspace: string; version: number }; process: JsonObject & { id: string; name: string; purpose: string }; stage_directory?: (JsonObject & { id: string; name: string; purpose: string })[]; stages?: JsonObject[] };
export function processContext(value: JsonObject): ProcessContext {
  if (!isObject(value.scope) || typeof value.scope.workspace !== 'string' || !integer(value.scope.version, 1) || !isObject(value.process) || !['id','name','purpose'].every(k => typeof (value.process as JsonObject)[k] === 'string')) throw new NeuronError('invalid_response', 'Invalid process context.');
  if (value.stage_directory !== undefined && (!Array.isArray(value.stage_directory) || !value.stage_directory.every(s => isObject(s) && ['id','name','purpose'].every(k => typeof s[k] === 'string')))) throw new NeuronError('invalid_response', 'Invalid stage directory.');
  return value as ProcessContext;
}

export type OperatingCase = JsonObject & { case_id: string; revision: number; values: JsonObject; completed_actions: string[]; scope: string };
export function operatingCase(value: JsonObject, expected: string): OperatingCase {
  if (value.case_id !== expected || !integer(value.revision, 0) || !isObject(value.values) || !Array.isArray(value.completed_actions) || !value.completed_actions.every(s=>typeof s==='string') || typeof value.scope!=='string') throw new NeuronError('invalid_response','Invalid case state. Do not infer approval from this result.');
  return value as OperatingCase;
}

export type ToolkitCandidate = JsonObject & { candidate_id: string; workspace: string; workspace_name: string; toolkit: string; publisher: string; version: number; agent: string | null; name: string; toolkit_name: string; description: string; capabilities: string[]; checks: (JsonObject & { id: string; title: string })[] };
export type ToolkitDiscovery = JsonObject & { candidates: ToolkitCandidate[]; workspaces: (JsonObject & { id: string; name: string })[]; next_cursor: string | null; total_candidates: number | null; guidance: string; requires_workspace?: boolean };
export function toolkitDiscovery(value: JsonObject, workspace?: string | null): ToolkitDiscovery {
 const fail=()=>{throw new NeuronError('invalid_response','Invalid toolkit catalog. Rediscover before selecting a capability.');};
 if (!Array.isArray(value.candidates) || !Array.isArray(value.workspaces) || !value.workspaces.every(w=>isObject(w)&&typeof w.id==='string'&&typeof w.name==='string') || typeof value.guidance!=='string') return fail();
 if (!(value.next_cursor===null || typeof value.next_cursor==='string') || !(value.total_candidates===null || integer(value.total_candidates,0))) return fail();
 const ids=new Set<string>();
 for (const c of value.candidates) {
  if (!isObject(c) || !['candidate_id','workspace','workspace_name','toolkit','publisher','name','toolkit_name','description'].every(k=>typeof c[k]==='string') || !integer(c.version,1) || !(c.agent===null || typeof c.agent==='string') || !Array.isArray(c.capabilities) || !c.capabilities.every(s=>typeof s==='string') || !Array.isArray(c.checks) || !c.checks.every(r=>isObject(r)&&typeof r.id==='string'&&typeof r.title==='string')) return fail();
  if (ids.has(c.candidate_id as string) || (workspace && c.workspace!==workspace)) return fail();
  ids.add(c.candidate_id as string);
 }
 if (value.requires_workspace===true) {
  if (value.candidates.length || value.next_cursor!==null || value.total_candidates!==null) return fail();
 } else if (!integer(value.total_candidates,0) || (value.total_candidates as number)<value.candidates.length || (value.next_cursor!==null && (value.candidates.length===0 || value.next_cursor!==(value.candidates.at(-1) as JsonObject).candidate_id))) return fail();
 return value as ToolkitDiscovery;
}

export type ActionProposal = JsonObject & { id: string; agent: string | null; action: string; arguments: JsonObject; scope: JsonObject & { agent: string | null; toolkit: string; publisher: string; version: number }; fingerprint: string; status: 'pending' | 'confirmed' | 'rejected' | 'expired'; expires_at: string; review_url: string; result: JsonObject | null };
export function actionProposal(value: JsonObject, expected: {workspace: string; action_id?: string; action?: string; agent?: string | null}): ActionProposal {
 const fail=()=>{throw new NeuronError('invalid_response','Invalid action proposal. No confirmation or completion can be inferred from this result.');};
 if (typeof value.id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id) || !(value.agent===null || typeof value.agent==='string') || typeof value.action!=='string' || !isObject(value.arguments) || !isObject(value.scope) || !['toolkit','publisher'].every(k=>typeof (value.scope as JsonObject)[k]==='string') || !integer(value.scope.version,1) || value.scope.agent!==value.agent || typeof value.fingerprint!=='string' || !value.fingerprint || !['pending','confirmed','rejected','expired'].includes(value.status as string) || !(typeof value.expires_at==='string' && Number.isFinite(Date.parse(value.expires_at))) || typeof value.review_url!=='string' || !(value.result===null || isObject(value.result)) || value.confirmation_token!==undefined) return fail();
 if ((expected.action_id!==undefined && value.id!==expected.action_id) || (expected.action!==undefined && value.action!==expected.action) || (expected.agent!==undefined && value.agent!==expected.agent)) return fail();
 let url: URL;try{url=new URL(value.review_url);}catch{return fail();}
 if (url.username || url.password || url.search || url.hash || url.pathname!==('/workspaces/'+encodeURIComponent(expected.workspace)+'/agents/review/'+value.id) || (url.protocol!=='https:' && !(url.protocol==='http:' && ['127.0.0.1','[::1]'].includes(url.hostname)))) return fail();
 return value as ActionProposal;
}

export type ToolkitSummary = JsonObject & { id: string; name: string; version: number; description: string; capabilities: string[]; status: string };
export type ToolkitList = JsonObject & { toolkits: ToolkitSummary[] };
export function toolkitList(value: JsonObject): ToolkitList {
 if (!Array.isArray(value.toolkits) || !value.toolkits.every(k=>isObject(k) && ['id','name','description','status'].every(f=>typeof k[f]==='string') && integer(k.version,1) && Array.isArray(k.capabilities) && k.capabilities.every(s=>typeof s==='string'))) throw new NeuronError('invalid_response','Invalid published toolkit list.');
 return value as ToolkitList;
}
export type AgentSummary = JsonObject & { id: string; name: string; toolkit: string; version: number; publisher: string; revision: number };
export type AgentList = JsonObject & { agents: AgentSummary[] };
export function agentList(value: JsonObject): AgentList {
 if (!Array.isArray(value.agents) || !value.agents.every(a=>isObject(a) && ['id','name','toolkit','publisher'].every(k=>typeof a[k]==='string') && integer(a.version,1) && integer(a.revision,0) && a.state===undefined)) throw new NeuronError('invalid_response','Invalid private agent list.');
 return value as AgentList;
}
export type AgentDescription = AgentSummary & { workspace: string; conversation_revision: number; references: JsonObject; operations: JsonObject[]; instructions: string; execution_mode: 'direct_tools'; hosted_delegation_available: false; hosted_operations: [] };
export function agentDescription(value: JsonObject, expected: {workspace: string; agent: string}): AgentDescription {
 agentList({agents:[value]});
 if (value.id!==expected.agent || value.workspace!==expected.workspace || !integer(value.conversation_revision,0) || !isObject(value.references) || !Array.isArray(value.operations) || !value.operations.every(isObject) || typeof value.instructions!=='string' || value.execution_mode!=='direct_tools' || value.hosted_delegation_available!==false || !Array.isArray(value.hosted_operations) || value.hosted_operations.length!==0) throw new NeuronError('invalid_response','Invalid agent capability description.');
 return value as AgentDescription;
}
