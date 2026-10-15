import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NeuronClient, NeuronError, completeAuthorization } from '../dist/index.js';
import schemas from '../dist/tool-schemas.json' with { type: 'json' };
import { validateEndpoint } from '../dist/transport.js';

const response = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
async function fixture(handler, names = Object.keys(schemas), limits) {
  const calls = [];
  const client = await NeuronClient.fromTransport({
    listTools: async () => names.map(name => ({ name, inputSchema: schemas[name] })),
    callTool: async (name, args) => { calls.push({ name, args }); return await handler(name, args); },
    close: async () => {},
  }, limits);
  return { client, calls };
}
const rejects = (promise, code) => assert.rejects(promise, e => e instanceof NeuronError && e.code === code);
const run = { id: 'r', process_id: 'purchase', case_id: 'PR-1', scope: 'connected_read', revision: 1, case_revision: 0, release_version: 2 };
const start = { workspace: 'workspace', process_id: 'purchase', case_id: 'PR-1', idempotency_key: 'purchase-start-001' };
const execute = { workspace: 'workspace', run_id: 'r', action_id: 'prepare', expected_revision: 1, expected_case_revision: 0, expected_release_version: 1, idempotency_key: 'purchase-execute-001' };

function segments(value, key = 'release_version', chunk = 40) {
  const text = JSON.stringify(value);
  const fingerprint = createHash('sha256').update(text).digest('hex');
  return (name, args) => {
    const offset = args.context_offset ?? 0, end = Math.min(offset + chunk, text.length);
    if (offset) { assert.equal(args.expected_context_fingerprint, fingerprint); assert.equal(args[key === 'run_revision' ? 'expected_run_revision' : 'expected_release_version'], 2); }
    return response({ context_format: 'ordered_json_segments', context_json: text.slice(offset, end), context_offset: offset, next_context_offset: end < text.length ? end : null, complete: end === text.length, total_chars: text.length, context_fingerprint: fingerprint, [key]: 2 });
  };
}

test('typed operation preserves revision and request key without adding authority', async () => {
  const { client, calls } = await fixture((name, args) => response({ ...run, ...args }));
  const result = await client.processes.start(start);
  assert.equal(result.id, 'r'); assert.deepEqual(calls[0].args, start);
});
test('forged identity, raw queries and wrong input types never reach transport', async () => {
  const { client, calls } = await fixture(() => response({}));
  for (const extra of [{ tenant: 'other' }, { values: { approved: true } }, { query: 'SELECT *' }]) await rejects(client.processes.start({ ...start, ...extra }), 'invalid_arguments');
  await rejects(client.processes.saveInputs({ workspace: 'workspace', run_id: 'r', expected_revision: '1', expected_release_version: 1, idempotency_key: 'saved-inputs', inputs: {} }), 'invalid_arguments');
  assert.equal(calls.length, 0);
});
test('execution refuses omitted, false and string confirmation', async () => {
  const { client, calls } = await fixture(() => response(run));
  for (const confirmed of [undefined, false, 'true', 1]) await rejects(client.processes.execute({ ...execute, confirmed }), 'invalid_arguments');
  assert.equal(calls.length, 0);
  await client.processes.execute({ ...execute, confirmed: true }); assert.equal(calls.length, 1);
});
test('operation refusals and transport ambiguity do not retry or expose transport secrets', async () => {
  const refusal = await fixture(() => ({ isError: true, content: [{ type: 'text', text: 'refused' }] }));
  await rejects(refusal.client.processes.start(start), 'operation_refused'); assert.equal(refusal.calls.length, 1);
  const timeout = await fixture(() => { throw new Error('Authorization: Bearer SECRET'); });
  await assert.rejects(timeout.client.processes.start(start), e => e.code === 'transport_error' && !e.message.includes('SECRET'));
  assert.equal(timeout.calls.length, 1);
});
test('unavailable operation refuses before calling a differently scoped server', async () => {
  const { client, calls } = await fixture(() => response({}), ['discover_operating_models']);
  await rejects(client.processes.start(start), 'unavailable_tool'); assert.equal(calls.length, 0);
});
test('assembles complete model, focused context and run with exact snapshot fences', async () => {
  const payload = { ...run, scope: { workspace: 'workspace', version: 2 }, process: { id: 'purchase', name: 'Purchase', purpose: 'Budget check' }, version: 2, model: {}, policies: ['Never bypass approval', 'Use the complete applicable rules'], revision: 2 };
  for (const [method, args, key] of [[c => c.models.read({ workspace: 'workspace' }), {}, 'release_version'], [c => c.processes.context({ workspace: 'workspace', process_id: 'purchase', stage_id: 'check', view: 'focused' }), {}, 'release_version'], [c => c.processes.read({ workspace: 'workspace', run_id: 'r' }), {}, 'run_revision']]) {
    const { client, calls } = await fixture(segments(key === 'run_revision' ? { ...payload, scope: 'connected_read' } : payload, key));
    const result = await method(client); assert.equal(result.version, payload.version); assert.ok(calls.length > 1);
  }
});
test('does not return partially assembled context after a release/access change', async () => {
  const base = segments({ policies: ['A'.repeat(100)] }); let count = 0;
  const { client } = await fixture((n, a) => { const r = base(n, a); if (++count === 2) r.structuredContent.release_version = 3; return r; });
  await rejects(client.models.read({ workspace: 'workspace' }), 'context_changed');
});
test('rejects tampered context despite unchanged supplied fingerprint', async () => {
  const base = segments({ policies: ['A'.repeat(100)] });
  const { client } = await fixture((n, a) => { const r = base(n, a); r.structuredContent.context_json = r.structuredContent.context_json.replace('A', 'B'); return r; });
  await rejects(client.models.read({ workspace: 'workspace' }), 'context_changed');
});
test('context size/page limits and invalid offsets fail closed', async () => {
  const limited = await fixture(segments({ text: 'A'.repeat(100) }), undefined, { maxContextChars: 20 });
  await rejects(limited.client.models.read({ workspace: 'workspace' }), 'result_limit');
  const paged = await fixture(segments({ text: 'A'.repeat(100) }), undefined, { maxContextPages: 1 });
  await rejects(paged.client.models.read({ workspace: 'workspace' }), 'result_limit');
  const broken = await fixture((n, a) => { const r = segments({ text: 'A'.repeat(100) })(n, a); r.structuredContent.next_context_offset = 0; return r; });
  await rejects(broken.client.models.read({ workspace: 'workspace' }), 'invalid_response');
});
test('large stage-read receipt is followed through the saved run pointer', async () => {
  const { client, calls } = await fixture((name, args) => response(name === 'read_stage_data' ? { id: 'r', details_available: true, revision: 2 } : { ...run, revision: 2, stage_data: { budget: { release_version: 2, read_at: '2026-10-08T00:00:00Z', inputs_fingerprint: 'f', packet: { required_data_complete: false, supports_effects: false, observations: { budget: { status: 'inputs_required', missing_inputs: [{ input: 'company', meaning: 'Company', value_type: 'text' }] } } } } } }));
  const result = await client.processes.readData({ workspace: 'workspace', run_id: 'r', expected_revision: 1, expected_release_version: 1, idempotency_key: 'budget-read-001', stage_id: 'budget' });
  assert.equal(result.stage_data.budget.packet.required_data_complete, false); assert.equal(calls[1].args.expected_run_revision, 2);
});
test('private artifact returns verified bytes and never writes a server filename', async () => {
  const bytes = Buffer.from('sample report\n');
  const { client } = await fixture(() => ({ content: [{ type: 'text', text: JSON.stringify({ filename: '../../report.csv', content_type: 'text/csv' }) }, { type: 'resource', resource: { uri: 'neuron://private-files/a/f', mimeType: 'text/csv', blob: bytes.toString('base64') } }] }));
  const file = await client.artifacts.get({ workspace: 'workspace', agent: 'a', file_id: 'f' });
  assert.deepEqual(Buffer.from(file.bytes), bytes); assert.equal(file.filename, '../../report.csv');
});
test('invalid file data is rejected', async () => {
  const { client } = await fixture(() => ({ content: [{ type: 'resource', resource: { uri: 'neuron://f', mimeType: 'text/csv', blob: '!invalid!' } }] }));
  await rejects(client.artifacts.get({ workspace: 'workspace', agent: 'a', file_id: 'f' }), 'result_limit');
});
test('endpoint refuses cleartext remote URLs and embedded credentials', () => {
  for (const endpoint of ['http://neuron.example/api', 'https://user:password@neuron.example/api', 'https://neuron.example/api?token=secret', 'https://neuron.example/api#secret']) assert.throws(() => validateEndpoint(endpoint), NeuronError);
  assert.equal(validateEndpoint('http://127.0.0.1:8123/api/published-mcp').hostname, '127.0.0.1');
});
test('OAuth callback verifies state before exchanging any code', async () => {
  await rejects(completeAuthorization('https://neuron.example/api/published-mcp', { state: () => 'expected-state' }, { state: 'wrong-state', code: 'private-code' }), 'invalid_arguments');
});

test('malformed successful run receipt cannot be used as execution authority', async () => {
  const { client } = await fixture(() => response({ id: 'r', revision: '1' }));
  await rejects(client.processes.start(start), 'invalid_response');
});


test('run and trusted case receipts reject unrelated identities', async () => {
 const wrongRun=await fixture(()=>response({...run,process_id:'other'}));
 await rejects(wrongRun.client.processes.start(start),'invalid_response');
 const validCase=await fixture(()=>response({case_id:'PR-1',revision:1,values:{},completed_actions:[],scope:'sandbox'}));
 assert.equal((await validCase.client.models.readCase({workspace:'workspace',case_id:'PR-1'})).case_id,'PR-1');
 const wrongCase=await fixture(()=>response({case_id:'other',revision:1,values:{},completed_actions:[],scope:'sandbox'}));
 await rejects(wrongCase.client.models.readCase({workspace:'workspace',case_id:'PR-1'}),'invalid_response');
});
