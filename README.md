# Neuron SDK

**Versioned business context for your application and AI assistant.**

Read permitted business concepts, relationships and process rules from a Neuron
workspace. Build the conversation in your own application, with your chosen AI
provider. The SDK is a Node.js client for Neuron's authenticated MCP interface;
it is not an agent runtime or a copy of the Neuron server.

**Developer beta · MIT · Node.js 22+ · GitHub distribution only.**
No npm package is published. The working package name `@neuron/sdk` is not a
claim of ownership of the `@neuron` npm scope. Neuron service access is separate.

[What developers can build](docs/for-developers.md) ·
[OAuth and access](docs/authentication.md) ·
[Capabilities and limits](docs/capabilities.md) ·
[Releases](https://github.com/nmarlar/neuron-sdk/releases)

## Try it without an account

```sh
git clone https://github.com/nmarlar/neuron-sdk.git
cd neuron-sdk
npm ci
npm run example:offline
```

This example uses fictional business definitions in memory and calls no server
or AI provider. It demonstrates how an application consumes context; it does not
simulate production authorization or execute a business process.

## Download and connect your Neuron workspace

Download `neuron-sdk-0.1.0-beta.2.tgz` and `SHA256SUMS` from the
[tagged release](https://github.com/nmarlar/neuron-sdk/releases/tag/v0.1.0-beta.2).
Put both files in a new project directory, then run:

```sh
shasum -a 256 -c SHA256SUMS
npm install ./neuron-sdk-0.1.0-beta.2.tgz
NEURON_MCP_ENDPOINT=https://neuron.patternlab.ai/api/published-mcp node node_modules/@neuron/sdk/examples/oauth-web/server.mjs
```

Open the printed URL. Sign in and select **Business context and setup** for your
workspace and its **Operating model**. The example uses read-only consent and
keeps tokens in memory; no token copying or API key is needed.
Choose discovery, read the full published model, then select a process and its
stages to inspect their requirements and rules. This does not create a run or
execute business actions. You need an accessible published model with processes;
installing the SDK does not provision one.

[Complete walkthrough and troubleshooting](examples/oauth-web/README.md)

From a source checkout after `npm ci`, use
`NEURON_MCP_ENDPOINT=https://neuron.patternlab.ai/api/published-mcp npm run example:oauth`.
That npm script belongs to this repository; it does not exist in a new consumer
project. To build the archive from source, run `npm pack`. Do not install an
unrelated package from npm by assuming it is this SDK.

## Read context

The browser walkthrough above connects using its session auth provider and reads
model/process context without manually handling tokens. The lower-level snippet
below is for an application that already obtains a consented OAuth access token
and stores it securely.
Do not use a Neuron password, provider key, database URI or copied browser cookie.
The browser OAuth example avoids copying tokens by using an auth provider.

```ts
import { NeuronClient } from '@neuron/sdk';

const client = await NeuronClient.connect({
  endpoint: 'https://neuron.patternlab.ai/api/published-mcp',
  accessToken: process.env.NEURON_ACCESS_TOKEN!,
});
try {
  const workspaces = await client.call('discover_workspace_contexts', {});
  console.log(workspaces);
  const page = await client.call('read_workspace_context', {
    workspace: 'YOUR_AUTHORIZED_WORKSPACE',
  });
  console.log(page);
} finally {
  await client.close();
}
```

Context is bounded. Follow returned offsets with the original revision and
fingerprint; a single page is not the whole model or SOP. Published model/process
helpers assemble their supported ordered segments. Model setup, import and
computation tools are typed calls with structured JSON results, not fully
assembled high-level application workflows.

## Available surfaces

| Surface | Purpose |
| --- | --- |
| `call` | Generated request types and runtime validation for available MCP tools |
| `models` | Published model discovery, reading and supported sandbox operations |
| `processes` | Published stage context and supported configured run operations |
| `artifacts` | Authorized generated file bytes and metadata |
| OAuth helpers | PKCE authorization with the official MCP client |
| Compatibility `toolkits` | Existing integrations; separate from workspace-context reads |

Operations require actual publication/configuration, explicit grants and current
permissions. A model description is not proof of a ready connector. Ordinary
context reads do not invoke a provider; explicit model authoring, hosted guidance
or computational planning may. The SDK does not add consent, approve effects,
silently retry mutations or turn a queued job into a completed result.

## Development

```sh
npm ci
npm test
npm run test:package
```

Public tests use synthetic client transports. Private server acceptance is
maintained separately and is not needed to run this repository. Client tests do
not prove compatibility with every external AI chat product or every connector.

## License

[MIT](LICENSE) covers the SDK. It does not license the Neuron service, server code,
workspace definitions or customer data, or grant hosted service access.
