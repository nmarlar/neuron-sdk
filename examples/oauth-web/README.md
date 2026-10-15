# Browser OAuth example

Run `npm run build`, then:

```sh
NEURON_MCP_ENDPOINT=https://neuron.patternlab.ai/api/published-mcp npm run example:oauth
```

Open the printed loopback URL. Choose Sign in and connect, sign in through Neuron
and explicitly select the workspace context to read. Choose Discover my workspace
context after the callback. No copied web cookie, source URI or provider key is used.
This read-only example does not provision models, sources or process capabilities.

Each session has isolated state, PKCE and tokens. Tokens are memory-only and are
discarded on restart. Disconnect clears the local session; revoke consent through
Neuron to remove the grant. A hosted app needs HTTPS, protected per-user storage,
verified origins, abuse controls and its own authenticated lifecycle.

Default scopes: `toolkits:read workspace_context:read`. Published process execution,
model edits, computations and files require distinct access. Do not simply request
all supported scopes. Existing process integrations can configure Sessions with
their deliberate scope selection; they do not inherit context grants automatically.
