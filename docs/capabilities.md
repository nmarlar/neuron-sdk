# Capabilities and limits

Use `availableTools()` to inspect the actual operations allowed by the current
connection. Generated request types do not grant access or prove a ready tool.

- Workspace context: discover permitted workspaces, read bounded business context
  and outcome guidance. Follow page offsets with the original revision/fingerprint.
- Published models/processes: read supported snapshots and stages. Configured runs,
  declared data reads and action operations require their own grants and readiness.
- Model setup/import: explicit typed operations prepare/recommend changes. Apply or
  commit requires separate write consent and exact revision/fingerprint fences.
- Computations: submit a supported private calculation, read a durable job and answer
  material questions. Queued/failed/incomplete results are not verified conclusions.
- Files: retrieve authorized file bytes and metadata when an installed operation
  actually generated them; the application chooses how to present a download.

New setup/import/computation tool results are structured JSON without complete
high-level SDK result assembly/validation. Applications must respect status,
read all required segments and preserve result fences. The SDK does not silently
retry mutation requests or supply authority/approval on the user's behalf.

Ordinary discovery/definition reads invoke no LLM. Explicit authoring, hosted
process guidance and computational planning may use configured server providers.
No operation is a universal ERP write API. A described process alone is not a
working integration, and source metadata is not proof of current records.

This beta is for Node.js 22+. No browser bundle or Python SDK is supplied. The
public CI verifies the client with synthetic transports, not private server internals.
