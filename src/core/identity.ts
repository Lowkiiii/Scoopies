import type { IdentifiedValue } from './types';
import { readCoreBinding } from './bindings';

export interface UidFunction {
  (): string;
  _c?: number;
}

function uidCounterTarget(activeUid: unknown): object {
  if (activeUid == null) {
    // Match the classic script's nullish property-access failure.
    void (activeUid as unknown as UidFunction)._c;
  }
  return Object(activeUid);
}

export const uid: UidFunction = function uid() {
  const activeUid = readCoreBinding<unknown>('uid', uid);
  const counterTarget = uidCounterTarget(activeUid);
  const counter = (Reflect.get(counterTarget, '_c') || 0) + 1;
  // The classic helper ran in sloppy mode, where a primitive or read-only
  // target silently ignored this write while the computed counter was used.
  Reflect.set(counterTarget, '_c', counter);
  return `id${counter}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
};

export function getById<T extends IdentifiedValue>(list: readonly T[], id: unknown): T | null {
  for (let index = 0; index < list.length; index += 1) {
    if (list[index].id === id) return list[index];
  }
  return null;
}

export function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}
