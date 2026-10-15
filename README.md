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

## Connect your Neuron workspace

```sh
NEURON_MCP_ENDPOINT=https://neuron.patternlab.ai/api/published-mcp npm run example:oauth
```

Open the printed local URL, sign in through Neuron and explicitly select the
workspace context the application may read. Credentials stay with Neuron. Your
account needs workspace access; installing the SDK does not provide it.
The example requests read-only context and stores tokens only in memory.

## Install in another project

Download the `.tgz` and `SHA256SUMS` from a tagged GitHub release. Verify the archive
checksum, then install that file locally:

```sh
shasum -a 256 -c SHA256SUMS
npm install ./neuron-sdk-0.1.0-beta.1.tgz
```

To build the archive from source, run `npm pack`. Do not install an unrelated
package from npm by assuming it is this SDK.

## Read context

Your application obtains a consented OAuth access token and stores it securely.
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
