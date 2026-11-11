import { readStocksBinding, runtimeValue } from './bindings';
import type { LegacyValue } from './types';

export function stockNumber(value: LegacyValue): number {
  const parsed = Number(value);
  return isFinite(parsed) ? parsed : 0;
}

export function stockFormatNumber(value: LegacyValue): string {
  return readStocksBinding('stockNumber', stockNumber)(value).toLocaleString(
    'en-PH',
    { minimumFractionDigits: 0, maximumFractionDigits: 3 },
  );
}

export function stockFormatQuantity(
  value: LegacyValue,
  baseUnit: LegacyValue,
  signed: LegacyValue,
): string {
  const amount = readStocksBinding('stockNumber', stockNumber)(value);
  const absolute = Math.abs(amount);
  let unit = baseUnit;
  let display = amount;
  if (baseUnit === 'g' && absolute >= 1000) {
    display = amount / 1000;
    unit = 'kg';
  } else if (baseUnit === 'ml' && absolute >= 1000) {
    display = amount / 1000;
    unit = 'L';
  }
  const prefix = signed && display > 0 ? '+' : '';
  const label =
    unit === 'piece'
      ? Math.abs(display) === 1
        ? 'piece'
        : 'pieces'
      : unit;
  return (
    prefix +
    readStocksBinding('stockFormatNumber', stockFormatNumber)(display) +
    ' ' +
    label
  );
}

export function stockSourceForItem(item: LegacyValue): LegacyValue {
  return runtimeValue('getById')(
    runtimeValue('state').ingredients || [],
    item && item.sourceId,
  );
}

export function stockStatus(item: LegacyValue): LegacyValue {
  if (!item.initialized) {
    return {
      key: 'not_counted',
      label: 'Not counted',
      cls: 'warn',
      rank: 2,
    };
  }
  if (item.balance <= 0) {
    return { key: 'out', label: 'Out of stock', cls: 'bad', rank: 0 };
  }
  if (item.threshold != null && item.balance <= item.threshold) {
    return { key: 'low', label: 'Low stock', cls: 'warn', rank: 1 };
  }
  return { key: 'good', label: 'In stock', cls: 'good', rank: 3 };
}

export function stockFilteredItems(): LegacyValue[] {
  const query = String(runtimeValue('stockState').search || '')
    .trim()
    .toLowerCase();
  const stockItems = runtimeValue('stockState').items as LegacyValue[];
  const savedOrder = Array.isArray(runtimeValue('state').stockOrder)
    ? runtimeValue('state').stockOrder
    : [];
  const orderById = new Map<string, number>();
  savedOrder.forEach(function (
    rawId: LegacyValue,
    index: number,
  ) {
    const id = String(rawId || '').trim();
    if (id && !orderById.has(id)) orderById.set(id, index);
  });
  return stockItems
    .filter(function (item: LegacyValue) {
      const status = readStocksBinding('stockStatus', stockStatus)(item);
      const source = readStocksBinding(
        'stockSourceForItem',
        stockSourceForItem,
      )(item);
      const categoryName = source
        ? runtimeValue('categoryNameIn')(
            runtimeValue('state'),
            source.categoryId,
          )
        : item.categoryName;
      if (
        runtimeValue('stockState').status !== 'all' &&
        status.key !== runtimeValue('stockState').status
      ) {
        return false;
      }
      if (
        runtimeValue('stockState').kind !== 'all' &&
        item.kind !== runtimeValue('stockState').kind
      ) {
        return false;
      }
      if (
        query &&
        [
          item.name,
          categoryName,
          item.purchasedFrom,
          item.notes,
          item.kind === 'mixture' ? 'prepared in-house' : '',
        ]
          .join(' ')
          .toLowerCase()
          .indexOf(query) < 0
      ) {
        return false;
      }
      return item.active !== false;
    })
    .sort(function (a: LegacyValue, b: LegacyValue) {
      const aOrder = orderById.get(
        String((a && (a.sourceId || a.id)) || ''),
      );
      const bOrder = orderById.get(
        String((b && (b.sourceId || b.id)) || ''),
      );
      if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      if (aOrder !== undefined && bOrder === undefined) return -1;
      if (aOrder === undefined && bOrder !== undefined) return 1;
      const rank =
        readStocksBinding('stockStatus', stockStatus)(a).rank -
        readStocksBinding('stockStatus', stockStatus)(b).rank;
      if (rank) return rank;
      return a.name.localeCompare(b.name, undefined, {
        sensitivity: 'base',
      });
    });
}

export function stockSummaryHtml(): string {
  const totals: LegacyValue = {
    all: runtimeValue('stockState').items.length,
    low: 0,
    out: 0,
    not_counted: 0,
  };
  runtimeValue('stockState').items.forEach(function (item: LegacyValue) {
    const key = readStocksBinding('stockStatus', stockStatus)(item).key;
    if (Object.prototype.hasOwnProperty.call(totals, key)) totals[key]++;
  });
  function metric(
    key: LegacyValue,
    label: LegacyValue,
    value: LegacyValue,
    cls: LegacyValue,
  ): string {
    const active = runtimeValue('stockState').status === key;
    return (
      '<button class="metric' +
      (active ? ' active' : '') +
      '" data-act="setStockStatus" data-status="' +
      key +
      '" aria-pressed="' +
      (active ? 'true' : 'false') +
      '"><div class="lbl">' +
      label +
      '</div><div class="val ' +
      (cls || '') +
      '">' +
      value +
      '</div></button>'
    );
  }
  return (
    '<div class="stock-summary">' +
    metric('all', 'Tracked', totals.all, '') +
    metric('low', 'Low stock', totals.low, '') +
    metric('out', 'Out of stock', totals.out, 'bad') +
    metric('not_counted', 'Not counted', totals.not_counted, '') +
    '</div>'
  );
}
