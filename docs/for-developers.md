# What the Neuron SDK gives developers

## The problem it solves

An AI application often starts with a prompt explaining a company's terminology,
rules and procedures. The same explanation gets copied into a support assistant,
a planning tool and an internal application. When the business changes, each copy
has to be updated. A new chat can lose the background that makes a task meaningful.

Neuron gives that background a saved, versioned home: the workspace model and its
process definitions. The SDK lets your code retrieve the context it is permitted
to use and call the operations that Neuron actually exposes.

You build the application and choose its AI provider. Neuron supplies shared
business context and governs access to its supported operations. You still need
to design the conversation, handle errors and decide which context to send to
an AI provider. The SDK is not an agent framework or an automatic context manager.

## What you can do

- Discover workspaces that the signed-in user has explicitly authorized.
- Read business concepts, relationships and saved understanding in bounded pages.
- Read published process definitions, stage instructions and recorded policies.
- Start or resume a supported process run, supply named inputs and read declared
  stage data, when the process has been configured and separately authorized.
- Request supported private calculations or proposed plans through the new
  computation tools, with separate consent. A queued job is not a finished answer.
- Retrieve authorized generated files where the selected capability supports them.
- Receive errors for stale versions, missing access or invalid inputs, rather
  than having the SDK silently retry a business operation.

The SDK uses Neuron's MCP interface. MCP is the connection protocol; the SDK is
convenient typed code for developers building their own applications on it.
Someone who only wants to connect a compatible AI chat client to Neuron may use
MCP directly without this Node.js package.

## Where the value is

**Reuse business knowledge across applications.** A company's definition of a
purchase request can live in Neuron instead of being duplicated in every app.

**Keep the same business background when changing AI providers.** Your code can
retrieve Neuron context for whichever provider you use. Providers do not become
interchangeable automatically: their tool support and behavior still need testing.

**Give a fresh conversation a grounded starting point.** Retrieve relevant
concepts and process stages before answering. You do not have to paste the whole
setup transcript into every conversation.

**Keep permissions and versions explicit.** Access follows consent and current
workspace rights. Supported process operations carry version/revision checks.
A copied description alone is not permission to execute an action.

## Example use cases

### A new employee's purchasing assistant

The employee asks, “What do I need before submitting this purchase request?”
Your app reads the published purchasing stages and policies, explains the required
inputs, and asks for what is missing. It can collect inputs for a configured
process. It cannot invent an approval or create a purchase order unless a specific
supported capability exists and the required permissions are granted.

### A customer quotation interface

Your app reads the quotation process, gathers product and commercial choices,
and calls a configured pricing capability. If that capability generates a file,
the app retrieves the authorized file for the customer-facing interface.
Pricing comes from the configured tool, not a number guessed by an LLM.
This requires a working quotation integration; installing the SDK does not create it.

### An internal operations dashboard

Your dashboard uses declared process data reads to show relevant records and
filters. It uses the same definitions as a conversational app. These are configured
reads, not unrestricted SQL against every company database. A model being present
does not prove that its data mapping or connector is ready.

### A planning assistant

A user requests a plan. With a separate computation grant, your app submits the
business outcome, receives a durable job ID, answers any returned questions and
reads the verified result when available. It shows incomplete data or infeasibility
honestly. A proposed plan does not commit it to an ERP or production system.
The SDK currently exposes these new tools through typed `client.call` arguments;
complete result assembly and status handling remain the application's responsibility.

### Different AI clients using one workspace

A team can use one Neuron workspace from several applications. Each connection
gets its own authorized access. Each app retrieves the current permitted context
instead of sharing another user's conversation or database credentials.

## How a developer starts

1. Create or select a Neuron workspace and prepare its business model.
2. Connect data and validate any reads needed for the intended use case.
3. Configure and publish a process if you need process execution; context reading
   has its own separate access path.
4. Use the SDK's OAuth example to sign in and select only the required access.
5. Discover the available tools, retrieve the relevant context, and build the app.

The current SDK runs in Node.js 22 or newer. It is a developer beta distributed through GitHub, with
no public npm package. Install the reviewed release archive or build from source. Do not use a Neuron password, database URI or provider key as an SDK
access token. OAuth lets a person approve access using their Neuron login.

For unattended jobs, plan token storage, refresh and revocation deliberately.
A separate general-purpose service API key is not supplied by this SDK.

## What it does not promise

- It does not make an LLM understand everything by installing a package.
- It does not connect every database, infer every mapping or supply every tool.
- It does not turn a described process into an executable integration automatically.
- It does not replace your application, AI orchestration, ERP or authorization design.
- It does not guarantee that copied context stays current after it is retrieved.
- It does not give an external assistant credentials or permission to bypass Neuron.

Use a focused context read, verify the returned version and completeness, then
call only operations available under that user's current grant.
