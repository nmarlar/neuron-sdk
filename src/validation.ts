import { NeuronError } from './errors.js';

/** Check arbitrary JSON before serialization can silently change its meaning. */
export function assertJson(value: unknown, code: 'invalid_arguments' | 'invalid_response', tool?: string, seen = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
  } else if (typeof value === 'object') {
    if (seen.has(value)) throw new NeuronError(code, 'Cyclic JSON is unsupported.', tool);
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new NeuronError(code, 'Only plain JSON objects are supported.', tool);
    seen.add(value);
    for (const item of Object.values(value)) assertJson(item, code, tool, seen);
    seen.delete(value);
    return;
  }
  throw new NeuronError(code, 'Values must be valid JSON with finite numbers.', tool);
}
export function safeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}
