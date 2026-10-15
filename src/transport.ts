import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { bounded } from './deadline.js';
import { NeuronError } from './errors.js';

export interface ToolTransport {
  listTools(): Promise<Tool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
  close(): Promise<void>;
}
export interface ConnectionOptions {
  endpoint: string;
  /** A short-lived, already consented OAuth access token. Never a database URI/API key. */
  accessToken?: string;
  /** Official MCP OAuth provider; application owns token custody and redirect UI. */
  authProvider?: OAuthClientProvider;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function validateEndpoint(endpoint: string): URL {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new NeuronError('invalid_arguments', 'Invalid MCP endpoint URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.hash || url.search || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new NeuronError('invalid_arguments', 'Use an HTTPS MCP endpoint, or HTTP loopback for local development, without credentials, query or fragment.');
  }
  return url;
}

export class McpTransport implements ToolTransport {
  private constructor(private readonly client: Client, private readonly timeoutMs: number) {}
  static async connect(options: ConnectionOptions): Promise<McpTransport> {
    const url = validateEndpoint(options.endpoint);
    if (!!options.accessToken === !!options.authProvider) {
      throw new NeuronError('invalid_arguments', 'Supply exactly one OAuth access token or OAuth provider.');
    }
    if (options.accessToken && /[\r\n]/.test(options.accessToken)) throw new NeuronError('invalid_arguments', 'Invalid access token.');
    if (options.accessToken?.startsWith('nctx_')) throw new NeuronError('invalid_arguments', 'This workspace context key belongs to /api/mcp. The published-process SDK requires consented access to /api/published-mcp.');
    const timeout = options.timeoutMs ?? 60_000;
    if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new NeuronError('invalid_arguments', 'timeoutMs must be a positive integer.');
    const client = new Client({ name: 'neuron-typescript-sdk', version: '0.1.0' });
    if (options.signal?.aborted) throw new NeuronError('transport_error', 'Connection cancelled.');
    const controller = new AbortController();
    let connecting = true;
    const baseFetch = globalThis.fetch;
    const transport = new StreamableHTTPClientTransport(url, {
      authProvider: options.authProvider,
      fetch: (input, init) => baseFetch(input, { ...init, signal: connecting ? AbortSignal.any([controller.signal, ...(init?.signal ? [init.signal] : [])]) : init?.signal }),
      requestInit: { redirect: 'error', headers: options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : undefined },
    });
    try {
      await bounded(client.connect(transport, { timeout }), timeout, options.signal, () => { controller.abort(); void client.close().catch(() => {}); });
      connecting = false;
      return new McpTransport(client, timeout);
    } catch {
      controller.abort();
      void client.close().catch(() => {});
      // Transport errors may contain request headers. Do not copy them into SDK errors.
      throw new NeuronError('transport_error', 'Could not connect to Neuron. Check the endpoint, OAuth consent and token validity.');
    }
  }
  async listTools(): Promise<Tool[]> {
    const tools: Tool[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await this.client.listTools(cursor ? { cursor } : {}, { timeout: this.timeoutMs });
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new NeuronError('invalid_response', 'Repeated MCP tool cursor.');
      if (cursor) seen.add(cursor);
      if (seen.size > 100) throw new NeuronError('result_limit', 'MCP tool catalog exceeded the page limit.');
    } while (cursor);
    return tools;
  }
  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return await this.client.callTool({ name, arguments: args }, undefined, { timeout: this.timeoutMs }) as CallToolResult;
  }
  async close(): Promise<void> { await this.client.close(); }
}
