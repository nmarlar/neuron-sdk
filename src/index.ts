export { NeuronClient } from './client.js';
export type { ClientLimits, PrivateArtifact, ToolResults } from './client.js';
export { NeuronError } from './errors.js';
export type { ErrorCode, RecoveryHint, RecoveryReason } from './errors.js';
export type { ToolArguments, ToolName, JsonValue, JsonObject } from './contracts.js';
export type { ToolTransport, ConnectionOptions } from './transport.js';
export { validateEndpoint } from './transport.js';
export type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
export { authorizeConnection, completeAuthorization } from './oauth.js';
export type { ProcessRun, PublishedModel, ActionSimulation, ActionReceipt, DataResult, StageObservation, StagePacket, SavedStageData, ModelDiscovery, ProcessContext, OperatingCase, ToolkitDiscovery, ToolkitCandidate, ActionProposal, ToolkitSummary, ToolkitList, AgentSummary, AgentList, AgentDescription } from './results.js';

export type { AuthorizationOptions } from './oauth.js';
