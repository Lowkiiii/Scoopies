import type { Unit, UnitDimension } from './types';
import { readCoreBinding } from './bindings';

export const UNIT_FACTOR: Record<string, number | undefined> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  piece: 1,
};

export const UNIT_TYPE: Record<string, UnitDimension | undefined> = {
  g: 'weight',
  kg: 'weight',
  ml: 'volume',
  l: 'volume',
  piece: 'count',
};

export const TYPE_UNITS: Record<UnitDimension, Unit[]> = {
  weight: ['g', 'kg'],
  volume: ['ml', 'l'],
  count: ['piece'],
};

export const TYPE_BASE: Record<UnitDimension, Unit> = {
  weight: 'g',
  volume: 'ml',
  count: 'piece',
};

export function toBase(qty: unknown, unit: string): number {
  const factors = readCoreBinding('UNIT_FACTOR', UNIT_FACTOR);
  return (parseFloat(qty as string) || 0) * (factors[unit] || 1);
}

export function convertUnitQuantity<T>(qty: T, fromUnit: string, toUnit: string): T | number {
  if (qty === '' || qty == null) return qty;
  const value = Number(qty);
  const fromFactor = readCoreBinding('UNIT_FACTOR', UNIT_FACTOR)[fromUnit];
  const toFactor = readCoreBinding('UNIT_FACTOR', UNIT_FACTOR)[toUnit];
  if (
    !isFinite(value) ||
    !fromFactor ||
    !toFactor ||
    readCoreBinding('UNIT_TYPE', UNIT_TYPE)[fromUnit] !==
      readCoreBinding('UNIT_TYPE', UNIT_TYPE)[toUnit]
  ) {
    return qty;
  }
  return (value * fromFactor) / toFactor;
}
