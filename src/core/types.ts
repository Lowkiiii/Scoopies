export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'piece';
export type UnitDimension = 'weight' | 'volume' | 'count';

export interface IdentifiedValue {
  id: unknown;
}
