export { ceilTo, getById, uid } from './identity';
export { num, pct, peso } from './money';
export { canonicalValue, sameDataValue, stableSerialize } from './serialization';
export type { IdentifiedValue, Unit, UnitDimension } from './types';
export {
  convertUnitQuantity,
  toBase,
  TYPE_BASE,
  TYPE_UNITS,
  UNIT_FACTOR,
  UNIT_TYPE,
} from './units';

import { ceilTo, getById, uid } from './identity';
import { num, pct, peso } from './money';
import { canonicalValue, sameDataValue, stableSerialize } from './serialization';
import { convertUnitQuantity, toBase, TYPE_BASE, TYPE_UNITS, UNIT_FACTOR, UNIT_TYPE } from './units';

export const CORE_API = {
  UNIT_FACTOR,
  UNIT_TYPE,
  TYPE_UNITS,
  TYPE_BASE,
  toBase,
  convertUnitQuantity,
  peso,
  pct,
  num,
  uid,
  getById,
  ceilTo,
  canonicalValue,
  stableSerialize,
  sameDataValue,
};
