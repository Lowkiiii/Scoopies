import { readCoreBinding } from './bindings';

function activeCanonicalValue(): typeof canonicalValue {
  return readCoreBinding('canonicalValue', canonicalValue);
}

function activeStableSerialize(): typeof stableSerialize {
  return readCoreBinding('stableSerialize', stableSerialize);
}

export function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(activeCanonicalValue());
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    Object.keys(source)
      .sort()
      .forEach((key) => {
        if (source[key] !== undefined) output[key] = activeCanonicalValue()(source[key]);
      });
    return output;
  }
  return value;
}

export function stableSerialize(value: unknown): string | undefined {
  return JSON.stringify(activeCanonicalValue()(value));
}

export function sameDataValue(left: unknown, right: unknown): boolean {
  return activeStableSerialize()(left) === activeStableSerialize()(right);
}
