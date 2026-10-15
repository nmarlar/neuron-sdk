# Read-only connection smoke check

This packaged example can validate a local or hosted endpoint. It discovers a
selected operating workspace, reads a pinned published model, optionally reads
its process/stage context and optionally retrieves an existing saved run. It does
not start a run, read fresh database records, execute tools, create approval or
provision anything. The report contains metadata only, not model text or rows.

Use the normal [browser OAuth example](../oauth-web/README.md) for onboarding.
An application that already has a user-scoped client can import `inspectConnection`
and pass that authenticated client. For an advanced scripted acceptance check,
create a private JSON file outside the repository:

```json
{
  "endpoint": "https://YOUR_NEURON_HOST/api/published-mcp",
  "accessToken": "YOUR_OWN_CONSENTED_ACCESS_TOKEN",
  "workspace": "SELECTED_WORKSPACE",
  "processId": "OPTIONAL_PROCESS_ID",
  "stageId": "OPTIONAL_STAGE_ID",
  "runId": "OPTIONAL_EXISTING_RUN_ID"
}
```

Omit unused optional fields. Never commit this file or share its token. Execute:

```sh
node node_modules/@neuron/sdk/examples/acceptance/run.mjs /private/path/config.json /private/path/new-summary.json
```

The output file must not exist; the command creates it with private permissions.
Failures expose only a safe SDK category, never raw transport/config details.
Do not call this a complete hosted acceptance: OAuth browser consent, fresh
sample reads, authorized review/resumption, revocation, direct ChatGPT/Claude
and any real connector effects require separate controlled checks.
