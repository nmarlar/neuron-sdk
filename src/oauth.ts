import { timingSafeEqual } from 'node:crypto';
import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { validateEndpoint } from './transport.js';
import { NeuronError } from './errors.js';
import { bounded } from './deadline.js';

export interface AuthorizationOptions { timeoutMs?: number; signal?: AbortSignal; }
async function authorizationWork<T>(options: AuthorizationOptions, work: (fetchFn: typeof fetch) => Promise<T>): Promise<T> {
  const timeout = options.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new NeuronError('invalid_arguments', 'timeoutMs must be a positive integer.');
  if (options.signal?.aborted) throw new NeuronError('transport_error', 'Authorization cancelled.');
  const controller = new AbortController();
  const baseFetch = globalThis.fetch;
  const fetchFn: typeof fetch = (input, init) => baseFetch(input, { ...init, signal: AbortSignal.any([controller.signal, ...(init?.signal ? [init.signal] : [])]) });
  return bounded(work(fetchFn), timeout, options.signal, () => controller.abort());
}
/** Provider must keep a stable unpredictable state and PKCE verifier for this user's authorization attempt. */
export async function authorizeConnection(endpoint: string, provider: OAuthClientProvider, options: AuthorizationOptions = {}): Promise<'AUTHORIZED' | 'REDIRECT'> {
  const serverUrl = validateEndpoint(endpoint);
  if (!provider.state) throw new NeuronError('invalid_arguments', 'OAuth provider must supply per-session state.');
  try { return await authorizationWork(options, fetchFn => auth(provider, { serverUrl, scope: provider.clientMetadata.scope, fetchFn })); }
  catch (error) { if (error instanceof NeuronError) throw error; throw new NeuronError('transport_error', 'OAuth authorization failed. Check registration and the configured callback URL.'); }
}

export async function completeAuthorization(endpoint: string, provider: OAuthClientProvider, callback: { code: string; state: string }, options: AuthorizationOptions = {}): Promise<void> {
  const serverUrl = validateEndpoint(endpoint);
  await authorizationWork(options, async fetchFn => {
    let expected: string | undefined;
    try { expected = await provider.state?.(); }
    catch { throw new NeuronError('transport_error', 'Could not load this authorization attempt. Start a new authorization attempt.'); }
    if (typeof expected !== 'string' || !expected || expected.length > 1024 || typeof callback.state !== 'string' || !callback.state || typeof callback.code !== 'string' || !callback.code || callback.state.length > 1024 || callback.code.length > 4096) throw new NeuronError('invalid_arguments', 'Invalid OAuth callback or expired authorization attempt.');
    const left = Buffer.from(expected), right = Buffer.from(callback.state);
    if (left.length !== right.length || !timingSafeEqual(left, right)) throw new NeuronError('invalid_arguments', 'OAuth callback state does not match this authorization attempt.');
    try {
      if (await auth(provider, { serverUrl, authorizationCode: callback.code, scope: provider.clientMetadata.scope, fetchFn }) !== 'AUTHORIZED') throw new Error('Incomplete exchange');
    } catch { throw new NeuronError('transport_error', 'OAuth code exchange failed. Start a new authorization attempt.'); }
  });
}
