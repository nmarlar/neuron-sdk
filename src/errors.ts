export type ErrorCode = 'invalid_arguments' | 'unavailable_tool' | 'operation_refused' | 'transport_error' | 'invalid_response' | 'context_changed' | 'result_limit' | 'authorization_required' | 'permission_denied' | 'state_conflict' | 'not_found' | 'invalid_input';

export type RecoveryReason = 'stale_revision' | 'release_changed' | 'context_changed' | 'idempotency_conflict' | 'operation_in_progress' | 'confirmation_required';
export interface RecoveryHint { reason: RecoveryReason; nextStep: 'refresh_state' | 'refresh_context_and_reassess' | 'restart_context_read' | 'inspect_original_command' | 'retrieve_saved_outcome' | 'review_and_confirm'; automaticRetry: false; }

export class NeuronError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly tool?: string, public readonly correlationId?: string, public readonly recovery?: RecoveryHint) {
    super(message);
    this.name = 'NeuronError';
  }
}
