# Provider-free process operations

SDK v0.1.0-beta.3 adds the current server's `read_process_operations`,
`execute_process_operation` and `recover_process_operation` request contracts.
The published beta.2 archive does not include these three operations.

Your application owns the reasoning. In Neuron's external-reasoning mode, do not
replace these operations with `processes.guide` or `processes.execute`: those
older paths use Neuron's hosted planner and may be unavailable. Discover the
actual authorized tools first.

1. With explicit `toolkits:execute` consent for the selected Operating model,
   create an isolated run using `client.processes.start`. Use a unique fictional
   case and stable request key. Read-only consent cannot create a run.
2. Call `read_process_operations` with the workspace/run ID. This reads the
   published operation contracts, exact capability IDs, run revision and current
   descriptor fingerprints. It does not execute a tool.
3. Select an operation supported by the user's request. Send its exact
   `operation_ref`, `capability_id`, current release `fingerprint`, business
   `arguments`, and stable `tool_call_id` inside `command`. Include the current
   run `expected_revision` and an `idempotency_key` in `execute_process_operation`.
4. Check the actual receipt. `completed` is a completed operation, not proof the
   entire process is complete. Confirmation, missing requirements or independent
   prose-policy assessment can block an effect. Never provide your own policy
   verdicts or weaken expected revisions to pass a refusal.
5. Reopen with `client.processes.read` to inspect saved history. After a dropped
   response, retrieve saved state/receipts and reuse the same original request
   key. `recover_process_operation` retrieves the exact pending source receipt;
   it does not reissue an uncertain effect.

These tools are available as typed `client.call(...)` operations. Responses are
structured JSON. There is no new high-level receipt validator or whole-process
completion helper in this update. A large operation contract can return ordered
`operation_json` segments; follow `next_context_offset` with the initial
`expected_fingerprint`, concatenate all segments and parse before reasoning.
A direct result's `fingerprint` is the release fingerprint used in the command;
the continuation envelope's fingerprint pins the segmented contract payload.
Never substitute one for the other.

Creating a run does not make an attached connector harmless. For acceptance,
use a disposable synthetic workspace with a fictional adapter. The isolated
qualification exercised actual MCP transport, OAuth grants, native SQLite run
storage, a private synthetic effect, reconnect/resume, idempotency and refused
stale revisions. It did not test production connector effects, AI decisions or
mark an open session as a completed business process.
