import { NeuronError } from './errors.js';
/** Bounds async work even when a caller-supplied provider ignores cancellation. */
export async function bounded<T>(work: Promise<T>, timeoutMs: number, signal?: AbortSignal, cancel: () => void = () => {}): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    abort = () => { cancel(); reject(new NeuronError('transport_error', 'Connection cancelled. No automatic retry was made.')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { cancel(); reject(new NeuronError('transport_error', 'Connection deadline exceeded. No automatic retry was made.')); }, timeoutMs);
  });
  try { return await Promise.race([work, deadline]); }
  finally { if (timer) clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort); }
}
