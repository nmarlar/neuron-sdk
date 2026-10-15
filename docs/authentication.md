# Authentication

Connect to `https://neuron.patternlab.ai/api/published-mcp` with the OAuth example
or a consented access token. OAuth uses PKCE. Keep tokens/state isolated per user;
protect persisted credentials, handle expiry/refresh and provide revocation.

The loopback example defaults to `toolkits:read workspace_context:read`. The first
name is a compatibility transport scope, not blanket access to every toolkit.
Only selected workspace grants and current user permissions authorize access.

Published model/process access is separate from workspace-context access. Model
writes require `workspace_context:write` and current manager rights. Computations
need their own workspace grant with `computations:read` and, for execution,
`computations:run`. Private files also have separate permissions. Ask only for
the access your application actually needs.

A general-purpose unattended service API key is not supplied by this SDK. Never
substitute a provider key, source URI, web cookie or Neuron password. Local
example disconnect clears memory; server-side connection revocation is separate.

For the read-only browser walkthrough, select both Business context and setup
and Operating model in the same workspace. The first authorizes workspace
understanding; the second authorizes published model/process reads. Leave
unrelated capability entries unchecked. The example does not request execution.
See [download and source instructions](../examples/oauth-web/README.md).
