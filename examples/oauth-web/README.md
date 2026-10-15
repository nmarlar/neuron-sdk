# Browser OAuth and read-only process walkthrough

Use Node.js 22 or newer. You need a Neuron login, access to a workspace and a
published Operating model containing at least one process with stages to finish
the whole walkthrough. Installing the SDK does not create that workspace.

## From a GitHub release download

Download `neuron-sdk-0.1.0-beta.2.tgz` and `SHA256SUMS` from the same
[tagged release](https://github.com/nmarlar/neuron-sdk/releases/tag/v0.1.0-beta.2).
In a new directory containing those two files:

```sh
shasum -a 256 -c SHA256SUMS
npm install ./neuron-sdk-0.1.0-beta.2.tgz
NEURON_MCP_ENDPOINT=https://neuron.patternlab.ai/api/published-mcp node node_modules/@neuron/sdk/examples/oauth-web/server.mjs
```

No build step, npm account, API key or manually copied token is needed.
The `npm run example:oauth` command below is for a source checkout, not your
application's package.json.

## From a source checkout

```sh
git clone --branch v0.1.0-beta.2 https://github.com/nmarlar/neuron-sdk.git
cd neuron-sdk
npm ci
NEURON_MCP_ENDPOINT=https://neuron.patternlab.ai/api/published-mcp npm run example:oauth
```

## Follow the browser walkthrough

1. Open the printed `http://127.0.0.1:8787` URL and choose **Sign in and connect**.
2. Sign in at Neuron. Select **Business context and setup** for the workspace
   and its **Operating model** entry. Leave other capabilities unchecked.
   Workspace context and a published model are separate grants, even in the
   same workspace. The example requests only `toolkits:read workspace_context:read`.
3. Choose **Discover my workspace context and models**. Select the published
   model, then **Read full published model**. Expand the JSON to see the full
   permitted snapshot. `models.read` assembles every returned segment and checks
   its version and fingerprint before returning a successful result.
4. Choose a process and **Read process flow**. Inspect the stage directory,
   modeled links and complete process policies/governance.
5. Choose a stage and **Read stage rules and requirements**. This uses focused
   stage context with the applicable rules returned by Neuron. Repeat for other
   stages to understand the process. The release version stays pinned throughout.

This is an end-to-end **definition-reading walkthrough**, not execution. It does
not create runs, save inputs, read connected source records, call an AI provider
or perform business actions. A process definition is not evidence that its
integrations work or that any task is complete. Your app owns the conversation;
use these definitions to explain requirements and ask the user for missing inputs.

## Use the same code in your app

`server.mjs` keeps the user's OAuth provider inside their protected server-side
session. After the callback it connects with that provider, not a pasted token:

```js
const client = await NeuronClient.connect({endpoint, authProvider: session.provider});
try {
  const catalog = await discover(client);
  const release = await readModel(client, catalog, selectedWorkspace);
  const process = await readProcess(client, selectedWorkspace, release, selectedProcess);
  const stage = await readStage(client, selectedWorkspace, release, process, selectedStage);
} finally {
  await client.close();
}
```

The four helpers are in `walkthrough.mjs`. They use only the public SDK and reject
process/stage IDs outside the selected snapshots. Inspect the helpers to see the
underlying `models.read` and `processes.context` calls.

## If something is missing

- No published model: reconnect and select its **Operating model** entry. If none
  exists in Neuron, a workspace manager must publish one first.
- No processes: this release contains no adaptive processes. The example will
  say so; it does not invent one or change the workspace.
- Changed snapshot: rediscover and reread the model. No partial context is shown.
- Consent expired: start sign-in again. Never paste credentials into a tool call.
- Port busy: set `PORT=8788` when starting and use the printed loopback URL.

Tokens/state are isolated per session and kept only in memory. Restarting signs
you out of this example. Disconnect clears local memory; revoke consent in Neuron
to remove the grant. Stop the server with Ctrl+C when finished. A hosted app needs
HTTPS, protected per-user storage, origin checks, refresh/revocation and abuse controls.
