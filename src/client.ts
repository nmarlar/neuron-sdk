import { createHash } from 'node:crypto';
import { Ajv, type ValidateFunction } from 'ajv';
import schemas from './tool-schemas.json' with { type: 'json' };
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolArguments, ToolName, JsonObject } from './contracts.js';
import { bounded } from './deadline.js';
import { assertJson, safeInteger } from './validation.js';
import { NeuronError, type RecoveryHint } from './errors.js';
import { processRun, simulation, publishedModel, actionReceipt, modelDiscovery, processContext, operatingCase, toolkitDiscovery, actionProposal, toolkitList, agentList, agentDescription, type ToolkitList, type AgentList, type AgentDescription, type ToolkitDiscovery, type ActionProposal, type OperatingCase, type ModelDiscovery, type ActionReceipt, type ActionSimulation, type ProcessRun } from './results.js';
import { McpTransport, type ConnectionOptions, type ToolTransport } from './transport.js';

const validators = new Map<ToolName, ValidateFunction>();
for (const [name, schema] of Object.entries(schemas)) validators.set(name as ToolName, new Ajv({ strict: false, strictNumbers: true, allErrors: true }).compile(schema));
function object(value: unknown): value is JsonObject { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function parseResult(result: CallToolResult, tool: string): JsonObject {
  if (result.isError) {
    const envelope = object(result.structuredContent) && object(result.structuredContent.error) ? result.structuredContent.error : undefined;
    const code = envelope?.code;
    const id = typeof envelope?.correlation_id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(envelope.correlation_id) ? envelope.correlation_id : undefined;
    let recovery: RecoveryHint | undefined;
    const steps = { stale_revision: 'refresh_state', release_changed: 'refresh_context_and_reassess', context_changed: 'restart_context_read', idempotency_conflict: 'inspect_original_command', operation_in_progress: 'retrieve_saved_outcome', confirmation_required: 'review_and_confirm' } as const;
    const hint = envelope?.recovery;
    if (code === 'state_conflict' && object(hint) && typeof hint.reason === 'string' && Object.hasOwn(steps, hint.reason) && hint.next_step === steps[hint.reason as keyof typeof steps] && hint.automatic_retry === false) {
      recovery = { reason: hint.reason as keyof typeof steps, nextStep: steps[hint.reason as keyof typeof steps], automaticRetry: false };
    }
    const messages = {
      authorization_required: 'Sign in and authorize this connection again.',
      permission_denied: 'Current permission is required. Review access before continuing.',
      state_conflict: 'Saved state or its rules changed. Refresh context and state before deciding the next step.',
      not_found: 'This resource is unavailable. Refresh discovery and check the selected resource.',
      invalid_input: 'Correct the inputs to match the published operation.',
    } as const;
    if (typeof code === 'string' && Object.hasOwn(messages, code)) throw new NeuronError(code as keyof typeof messages, messages[code as keyof typeof messages] + ' No automatic retry was made.', tool, id, recovery);
    throw new NeuronError('operation_refused', 'Neuron refused this operation. Check current access, required inputs, release/revision and required human review. No automatic retry was made.', tool, id);
  }
  if (object(result.structuredContent)) { assertJson(result.structuredContent, 'invalid_response', tool); return result.structuredContent; }
  const first = result.content.find(item => item.type === 'text');
  if (first?.type === 'text') {
    try { const value: unknown = JSON.parse(first.text); if (object(value)) { assertJson(value, 'invalid_response', tool); return value; } } catch { /* reject */ }
  }
  throw new NeuronError('invalid_response', 'Neuron did not return a structured result.', tool);
}
export type ToolResults = { [K in ToolName]: K extends 'list_toolkits' ? ToolkitList : K extends 'list_agents' ? AgentList : K extends 'describe_agent' ? AgentDescription : K extends 'discover_toolkits' ? ToolkitDiscovery : K extends 'propose_action' | 'get_action_status' ? ActionProposal : K extends 'discover_operating_models' ? ModelDiscovery : K extends 'execute_operating_action' ? ActionReceipt : K extends 'simulate_operating_action' ? ActionSimulation : K extends 'read_operating_case' ? OperatingCase : JsonObject };
export interface ClientLimits { maxContextChars?: number; maxContextPages?: number; }
export interface PrivateArtifact { filename: string; mimeType: string; uri: string; bytes: Uint8Array; }

export class NeuronClient {
  private tools = new Map<string, Tool>();
  private readonly maxChars: number;
  private readonly maxPages: number;
  private constructor(private readonly transport: ToolTransport, limits: ClientLimits) {
    this.maxChars = limits.maxContextChars ?? 2_000_000;
    this.maxPages = limits.maxContextPages ?? 400;
    for (const value of [this.maxChars, this.maxPages]) if (!Number.isSafeInteger(value) || value <= 0) throw new NeuronError('invalid_arguments', 'Context limits must be positive integers.');
  }
  static async connect(options: ConnectionOptions & ClientLimits): Promise<NeuronClient> {
    const started = Date.now(), timeout = options.timeoutMs ?? 60_000;
    const transport = await McpTransport.connect(options);
    try { return await bounded(NeuronClient.fromTransport(transport, options), Math.max(1, timeout - (Date.now() - started)), options.signal, () => { void transport.close().catch(() => {}); }); }
    catch (error) { void transport.close().catch(() => {}); throw error; }
  }
  /** Advanced adapter/testing boundary. Applications must authenticate their custom transport. */
  static async fromTransport(transport: ToolTransport, limits: ClientLimits = {}): Promise<NeuronClient> {
    const client = new NeuronClient(transport, limits);
    await client.refreshTools();
    return client;
  }
  async refreshTools(): Promise<Tool[]> {
    try {
      const tools = await this.transport.listTools();
      this.tools = new Map(tools.map(tool => [tool.name, tool]));
      return tools;
    } catch (error) { if (error instanceof NeuronError) throw error; throw new NeuronError('transport_error', 'Could not read authorized operations. Check the connection.'); }
  }
  availableTools(): Tool[] { return [...this.tools.values()]; }
  async close(): Promise<void> { await this.transport.close(); }
  private async raw<K extends ToolName>(name: K, args: ToolArguments[K]): Promise<CallToolResult> {
    assertJson(args, 'invalid_arguments', name);
    for (const [key, value] of Object.entries(args)) {
      if (value !== null && /(?:revision|version|offset|limit)$/.test(key) && !safeInteger(value)) throw new NeuronError('invalid_arguments', 'Control integers must be non-negative safe integers.', name);
    }
    const validate = validators.get(name);
    if (!validate || !validate(args)) {
      const fields = validate?.errors?.map(e => `${e.instancePath || '/'} ${e.message}`).join('; ');
      throw new NeuronError('invalid_arguments', `Invalid ${name} arguments: ${fields ?? 'unknown operation'}`, name);
    }
    if (name === 'get_computation_run') {
      const command = args as ToolArguments['get_computation_run'];
      if ((command.context_offset ?? 0) > 0 && (command.expected_revision == null || command.expected_fingerprint == null)) {
        throw new NeuronError('invalid_arguments', 'Later computation result segments require the original revision and fingerprint.', name);
      }
    }
    const tool = this.tools.get(name);
    if (!tool) throw new NeuronError('unavailable_tool', 'This operation is unavailable under the current connection. Refresh tools or review consent.', name);
    if (!new Ajv({ strict: false, strictNumbers: true }).compile(tool.inputSchema)(args)) throw new NeuronError('invalid_arguments', 'The server contract differs. Update the SDK before proceeding.', name);
    // Never supply confirmation, revisions, request keys or effect retries on the caller's behalf.
    if ((name === 'execute_process_action' || name === 'execute_operating_action') && (args as { confirmed?: boolean }).confirmed !== true) throw new NeuronError('invalid_arguments', 'Execution requires explicit confirmation of this exact action.', name);
    try { return await this.transport.callTool(name, args as Record<string, unknown>); }
    catch (error) { if (error instanceof NeuronError) throw error; throw new NeuronError('transport_error', 'No verified receipt was received. For mutations, inspect state before retrying with the same request key.', name); }
  }
  async call<K extends ToolName>(name: K, args: ToolArguments[K]): Promise<ToolResults[K]> {
    const value = parseResult(await this.raw(name, args), name);
    if (name === 'execute_operating_action') actionReceipt(value, args as ToolArguments['execute_operating_action']);
    if (name === 'simulate_operating_action') {
      simulation(value); const command = args as ToolArguments['simulate_operating_action'];
      if (value.action_id !== command.action_id || value.case_id !== command.case_id) throw new NeuronError('invalid_response', 'The simulation belongs to a different action or case.', name);
    }
    if (name === 'read_operating_case') operatingCase(value, (args as ToolArguments['read_operating_case']).case_id);
    if (name === 'discover_operating_models') modelDiscovery(value);
    if (name === 'list_toolkits') toolkitList(value);
    if (name === 'list_agents') agentList(value);
    if (name === 'describe_agent') agentDescription(value, args as ToolArguments['describe_agent']);
    if (name === 'discover_toolkits') toolkitDiscovery(value, (args as ToolArguments['discover_toolkits']).workspace);
    if (name === 'propose_action') actionProposal(value, { ...(args as ToolArguments['propose_action']), agent: (args as ToolArguments['propose_action']).agent ?? null });
    if (name === 'get_action_status') actionProposal(value, args as ToolArguments['get_action_status']);
    return value as ToolResults[K];
  }
  private checkSnapshot(name: string, args: Record<string, unknown>, value: JsonObject, envelope?: number): void {
    if (Array.from(JSON.stringify(value)).length > this.maxChars) throw new NeuronError('result_limit', 'Context exceeds the configured limit. Request a focused stage.', name);
    const scope = object(value.scope) ? value.scope : undefined;
    const version = name === 'read_process_run' ? value.revision : name === 'read_operating_model' ? value.version : scope?.version ?? value.release_version ?? value.version;
    const expected = name === 'read_process_run' ? args.expected_run_revision : args.expected_release_version;
    if (!safeInteger(version) || (expected != null && version !== expected) || (envelope !== undefined && version !== envelope)) throw new NeuronError('context_changed', 'The payload does not match the requested snapshot.', name);
    if (name === 'read_process_run' && value.id !== args.run_id) throw new NeuronError('invalid_response', 'The receipt belongs to a different run.', name);
    if (name === 'read_process_context' && (scope?.workspace !== args.workspace || (!object(value.process) || value.process.id !== args.process_id))) throw new NeuronError('invalid_response', 'The context belongs to a different process.', name);
    if (value.workspace !== undefined && value.workspace !== args.workspace) throw new NeuronError('invalid_response', 'The context belongs to a different workspace.', name);
  }
  private async assembled<K extends 'read_operating_model' | 'read_process_context' | 'read_process_run'>(name: K, args: ToolArguments[K]): Promise<JsonObject> {
    let result = await this.call(name, { ...args, context_offset: 0 });
    if (result.context_format !== 'ordered_json_segments') { this.checkSnapshot(name, args, result); return result; }
    const versionKey = name === 'read_process_run' ? 'run_revision' : 'release_version';
    const expectedKey = name === 'read_process_run' ? 'expected_run_revision' : 'expected_release_version';
    const fingerprint = result.context_fingerprint, version = result[versionKey], total = result.total_chars;
    if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint) || typeof version !== 'number' || (!Number.isSafeInteger(version) || version < 0) || typeof total !== 'number' || !Number.isSafeInteger(total) || total <= 0) throw new NeuronError('invalid_response', 'Invalid snapshot metadata.', name);
    const requested = (args as Record<string, unknown>)[expectedKey];
    if (requested != null && requested !== version) throw new NeuronError('context_changed', 'The returned snapshot is not the requested version.', name);
    if (total > this.maxChars) throw new NeuronError('result_limit', 'Context exceeds the configured limit. Request a focused stage.', name);
    let text = '', offset = 0, pages = 0;
    while (true) {
      if (++pages > this.maxPages) throw new NeuronError('result_limit', 'Context exceeded the page limit.', name);
      if (result.context_format !== 'ordered_json_segments' || result.context_offset !== offset || result.context_fingerprint !== fingerprint || result[versionKey] !== version || result.total_chars !== total || typeof result.context_json !== 'string' || !result.context_json.length) throw new NeuronError('context_changed', 'Inconsistent context segments. Restart the read; no partial context was returned.', name);
      text += result.context_json;
      if (text.length > total) throw new NeuronError('invalid_response', 'Context exceeded its declared size.', name);
      if (result.next_context_offset === null) {
        if (result.complete !== true || text.length !== total) throw new NeuronError('invalid_response', 'Incomplete context snapshot.', name);
        break;
      }
      if (result.complete !== false || result.next_context_offset !== text.length || text.length >= total) throw new NeuronError('invalid_response', 'Invalid context continuation.', name);
      offset = text.length;
      result = await this.call(name, { ...args, context_offset: offset, [expectedKey]: version, expected_context_fingerprint: fingerprint });
    }
    if (createHash('sha256').update(text).digest('hex') !== fingerprint) throw new NeuronError('context_changed', 'Context integrity check failed. Restart the read.', name);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new NeuronError('invalid_response', 'Complete context was not valid JSON.', name); }
    if (object(parsed)) { assertJson(parsed, 'invalid_response', name); this.checkSnapshot(name, args, parsed, version); return parsed; }
    throw new NeuronError('invalid_response', 'Complete context was not a JSON object.', name);
  }
  private async runResult(value: JsonObject, expected: { workspace: string; run_id?: string; process_id?: string; case_id?: string }): Promise<ProcessRun> {
    const receipt = processRun(value);
    if ((expected.run_id !== undefined && receipt.id !== expected.run_id) || (expected.process_id !== undefined && receipt.process_id !== expected.process_id) || (expected.case_id !== undefined && receipt.case_id !== expected.case_id)) throw new NeuronError('invalid_response', 'The run receipt belongs to a different task.');
    if (value.details_available === true) return this.processes.read({workspace:expected.workspace,run_id:receipt.id,expected_run_revision:receipt.revision});
    return receipt;
  }
  readonly models = {
    discover: (args: ToolArguments['discover_operating_models'] = {}) => this.call('discover_operating_models', args),
    read: (args: Omit<ToolArguments['read_operating_model'], 'context_offset' | 'expected_context_fingerprint'>) => this.assembled('read_operating_model', args).then(publishedModel),
    simulate: (args: ToolArguments['simulate_operating_action']) => this.call('simulate_operating_action', args).then(simulation),
    execute: (args: ToolArguments['execute_operating_action'] & { confirmed: true }) => this.call('execute_operating_action', args).then(value => actionReceipt(value, args)),
    readCase: (args: ToolArguments['read_operating_case']) => this.call('read_operating_case', args),
    outcomes: (args: ToolArguments['get_operating_outcomes']) => this.call('get_operating_outcomes', args),
  };
  readonly processes = {
    context: (args: Omit<ToolArguments['read_process_context'], 'context_offset' | 'expected_context_fingerprint'>) => this.assembled('read_process_context', { view: 'overview', ...args }).then(processContext),
    start: (args: ToolArguments['start_process_run']) => this.call('start_process_run', args).then(value => this.runResult(value, args)),
    read: (args: Omit<ToolArguments['read_process_run'], 'context_offset' | 'expected_context_fingerprint'>) => this.assembled('read_process_run', args).then(processRun),
    saveInputs: (args: ToolArguments['save_process_inputs']) => this.call('save_process_inputs', args).then(value => this.runResult(value, args)),
    readData: async (args: ToolArguments['read_stage_data']): Promise<ProcessRun> => {
      const result = await this.call('read_stage_data', args);
      if (result.details_available === true) {
        if (!safeInteger(result.revision) || result.id !== args.run_id) throw new NeuronError('invalid_response', 'Invalid saved-run continuation receipt.', 'read_stage_data');
        return this.processes.read({ workspace: args.workspace, run_id: args.run_id, expected_run_revision: result.revision });
      }
      return this.runResult(result, args);
    },
    /** Explicit hosted guidance; ordinary context/data calls do not use an LLM. */
    guide: (args: ToolArguments['guide_process_run']) => this.call('guide_process_run', args).then(value => this.runResult(value, args)),
    execute: (args: ToolArguments['execute_process_action'] & { confirmed: true }) => this.call('execute_process_action', args).then(value => this.runResult(value, args)),
  };
  readonly toolkits = {
    discover: (args: ToolArguments['discover_toolkits'] = {}) => this.call('discover_toolkits', args),
    list: (args: ToolArguments['list_toolkits']) => this.call('list_toolkits', args),
    agents: (args: ToolArguments['list_agents']) => this.call('list_agents', args),
    describe: (args: ToolArguments['describe_agent']) => this.call('describe_agent', args),
    readModel: (args: ToolArguments['read_model']) => this.call('read_model', args),
    invoke: (args: ToolArguments['invoke_capability']) => this.call('invoke_capability', args),
    runCheck: (args: ToolArguments['run_check']) => this.call('run_check', args),
    propose: (args: ToolArguments['propose_action']) => this.call('propose_action', args),
    proposalStatus: (args: ToolArguments['get_action_status']) => this.call('get_action_status', args),
  };
  readonly artifacts = {
    get: async (args: ToolArguments['get_file']): Promise<PrivateArtifact> => {
      const result = await this.raw('get_file', args);
      if (result.isError) parseResult(result, 'get_file');
      const resources = result.content.filter(c => c.type === 'resource');
      if (resources.length !== 1) throw new NeuronError('invalid_response', 'Expected one private file resource.', 'get_file');
      const resource = resources[0]!;
      if (resource.type !== 'resource' || !('blob' in resource.resource) || !resource.resource.mimeType) throw new NeuronError('invalid_response', 'Invalid private file resource.', 'get_file');
      const blob = resource.resource.blob;
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(blob) || blob.length > 2_800_000) throw new NeuronError('result_limit', 'Invalid or oversized file resource.', 'get_file');
      const meta = parseResult(result, 'get_file');
      if (typeof meta.filename !== 'string' || typeof meta.content_type !== 'string' || meta.content_type !== resource.resource.mimeType) throw new NeuronError('invalid_response', 'Invalid file metadata.', 'get_file');
      const bytes = Buffer.from(blob, 'base64');
      if (bytes.length > 2 * 1024 * 1024) throw new NeuronError('result_limit', 'File exceeds the embedded resource limit.', 'get_file');
      return { filename: meta.filename, mimeType: meta.content_type, uri: resource.resource.uri, bytes };
    },
  };
}
