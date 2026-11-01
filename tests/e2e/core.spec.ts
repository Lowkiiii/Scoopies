import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    });
  });
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } }).MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
});

test('typed Core preserves unit metadata and conversion behavior', async ({ page }) => {
  const result = await page.evaluate(() => {
    const core = (
      window as typeof window & {
        MatchaLunaApp: { domains: { core: Record<string, unknown> } };
      }
    ).MatchaLunaApp.domains.core as {
      UNIT_FACTOR: Record<string, number>;
      UNIT_TYPE: Record<string, string>;
      TYPE_UNITS: Record<string, string[]>;
      TYPE_BASE: Record<string, string>;
      toBase: (quantity: unknown, unit: string) => number;
      convertUnitQuantity: (quantity: unknown, fromUnit: string, toUnit: string) => unknown;
    };

    return {
      unitFactor: core.UNIT_FACTOR,
      unitType: core.UNIT_TYPE,
      typeUnits: core.TYPE_UNITS,
      typeBase: core.TYPE_BASE,
      frozen: {
        unitFactor: Object.isFrozen(core.UNIT_FACTOR),
        unitType: Object.isFrozen(core.UNIT_TYPE),
        typeUnits: Object.isFrozen(core.TYPE_UNITS),
        typeBase: Object.isFrozen(core.TYPE_BASE),
        weightUnits: Object.isFrozen(core.TYPE_UNITS.weight),
        volumeUnits: Object.isFrozen(core.TYPE_UNITS.volume),
        countUnits: Object.isFrozen(core.TYPE_UNITS.count),
      },
      toBase: {
        kilograms: core.toBase('1.5', 'kg'),
        milliliters: core.toBase('250', 'ml'),
        blank: core.toBase('', 'g'),
        unknownUnit: core.toBase('2', 'unknown'),
      },
      conversions: {
        kilogramsToGrams: core.convertUnitQuantity(1, 'kg', 'g'),
        gramsToKilograms: core.convertUnitQuantity(1500, 'g', 'kg'),
        litersToMilliliters: core.convertUnitQuantity(1, 'l', 'ml'),
        millilitersToLiters: core.convertUnitQuantity(250, 'ml', 'l'),
        blank: core.convertUnitQuantity('', 'g', 'kg'),
        nullValue: core.convertUnitQuantity(null, 'g', 'kg'),
        invalidNumber: core.convertUnitQuantity('not-a-number', 'g', 'kg'),
        incompatibleUnits: core.convertUnitQuantity(3, 'g', 'ml'),
        unknownUnit: core.convertUnitQuantity(4, 'unknown', 'g'),
      },
    };
  });

  expect(result).toEqual({
    unitFactor: { g: 1, kg: 1000, ml: 1, l: 1000, piece: 1 },
    unitType: { g: 'weight', kg: 'weight', ml: 'volume', l: 'volume', piece: 'count' },
    typeUnits: { weight: ['g', 'kg'], volume: ['ml', 'l'], count: ['piece'] },
    typeBase: { weight: 'g', volume: 'ml', count: 'piece' },
    frozen: {
      unitFactor: false,
      unitType: false,
      typeUnits: false,
      typeBase: false,
      weightUnits: false,
      volumeUnits: false,
      countUnits: false,
    },
    toBase: { kilograms: 1500, milliliters: 250, blank: 0, unknownUnit: 2 },
    conversions: {
      kilogramsToGrams: 1000,
      gramsToKilograms: 1.5,
      litersToMilliliters: 1000,
      millilitersToLiters: 0.25,
      blank: '',
      nullValue: null,
      invalidNumber: 'not-a-number',
      incompatibleUnits: 3,
      unknownUnit: 4,
    },
  });
});

test('typed Core preserves money, percentage, and numeric helpers', async ({ page }) => {
  const result = await page.evaluate(() => {
    const core = (
      window as typeof window & {
        MatchaLunaApp: { domains: { core: Record<string, unknown> } };
      }
    ).MatchaLunaApp.domains.core as {
      peso: (value: unknown) => string;
      pct: (value: unknown) => string;
      num: (value: unknown) => number;
      ceilTo: (value: number, step: number) => number;
    };

    return {
      peso: core.peso(1234.5),
      pesoFromString: core.peso('12.5'),
      pesoFromNull: core.peso(null),
      pesoInfinity: core.peso(Number.POSITIVE_INFINITY),
      pesoNaN: core.peso(Number.NaN),
      percentage: core.pct(54.14),
      percentageFromString: core.pct('12.34'),
      percentageInfinity: core.pct(Number.POSITIVE_INFINITY),
      parsedNumber: core.num('12.5'),
      blankNumber: core.num(''),
      invalidNumber: core.num('abc'),
      infiniteNumber: core.num('Infinity'),
      roundedUp: core.ceilTo(12.01, 5),
      alreadyOnStep: core.ceilTo(10, 5),
    };
  });

  expect(result).toEqual({
    peso: '₱1,234.50',
    pesoFromString: '₱12.50',
    pesoFromNull: '₱0.00',
    pesoInfinity: '—',
    pesoNaN: '—',
    percentage: '54.1%',
    percentageFromString: '12.3%',
    percentageInfinity: '—',
    parsedNumber: 12.5,
    blankNumber: 0,
    invalidNumber: 0,
    infiniteNumber: Number.POSITIVE_INFINITY,
    roundedUp: 15,
    alreadyOnStep: 10,
  });
});

test('typed Core preserves classic live-binding behavior after reassignment', async ({ page }) => {
  const result = await page.evaluate(() => {
    type UidFunction = (() => string) & { _c?: number };
    type CoreNamespace = {
      UNIT_FACTOR: Record<string, number>;
      UNIT_TYPE: Record<string, string>;
      toBase: (quantity: unknown, unit: string) => number;
      convertUnitQuantity: (quantity: unknown, fromUnit: string, toUnit: string) => unknown;
      uid: UidFunction;
      canonicalValue: (value: unknown) => unknown;
      stableSerialize: (value: unknown) => string | undefined;
      sameDataValue: (left: unknown, right: unknown) => boolean;
    };
    const appWindow = window as typeof window & {
      MatchaLunaApp: { domains: { core: CoreNamespace } };
    };
    const core = appWindow.MatchaLunaApp.domains.core;
    const originals = {
      UNIT_FACTOR: core.UNIT_FACTOR,
      UNIT_TYPE: core.UNIT_TYPE,
      uid: core.uid,
      canonicalValue: core.canonicalValue,
      stableSerialize: core.stableSerialize,
    };
    const originalToBase = core.toBase;
    const originalConvert = core.convertUnitQuantity;
    const originalStableSerialize = core.stableSerialize;
    const originalSameDataValue = core.sameDataValue;
    const replacementUid: UidFunction = () => 'replacement';
    replacementUid._c = 40;
    const readOnlyUid: UidFunction = () => 'read-only';
    Object.defineProperty(readOnlyUid, '_c', { configurable: true, value: 5, writable: false });

    try {
      core.UNIT_FACTOR = { g: 3, kg: 30, ml: 1, l: 10, piece: 1 };
      core.UNIT_TYPE = {
        g: 'weight',
        kg: 'weight',
        ml: 'volume',
        l: 'volume',
        piece: 'count',
      };
      const reassignedToBase = originalToBase(2, 'g');
      const reassignedConversion = originalConvert(2, 'kg', 'g');

      core.canonicalValue = (value) => ({ wrapped: value });
      const reassignedCanonical = originalStableSerialize('value');

      core.stableSerialize = (value) => (value === 'same' ? 'shared' : String(value));
      const reassignedSerializer = originalSameDataValue('same', 'same');

      core.uid = replacementUid;
      const idFromOriginalUid = originals.uid();
      Reflect.set(core, 'uid', 7);
      const idWithPrimitiveBinding = originals.uid();
      core.uid = readOnlyUid;
      const idWithReadOnlyCounter = originals.uid();

      return {
        reassignedToBase,
        reassignedConversion,
        reassignedCanonical,
        reassignedSerializer,
        replacementUidCounter: replacementUid._c,
        idFromOriginalUidStartsAtNextCounter: idFromOriginalUid.startsWith('id41_'),
        primitiveBindingUsesTransientCounter: idWithPrimitiveBinding.startsWith('id1_'),
        readOnlyBindingUsesComputedCounter: idWithReadOnlyCounter.startsWith('id6_'),
        readOnlyCounterUnchanged: readOnlyUid._c,
      };
    } finally {
      core.UNIT_FACTOR = originals.UNIT_FACTOR;
      core.UNIT_TYPE = originals.UNIT_TYPE;
      core.uid = originals.uid;
      core.canonicalValue = originals.canonicalValue;
      core.stableSerialize = originals.stableSerialize;
    }
  });

  expect(result).toEqual({
    reassignedToBase: 6,
    reassignedConversion: 20,
    reassignedCanonical: '{"wrapped":"value"}',
    reassignedSerializer: true,
    replacementUidCounter: 41,
    idFromOriginalUidStartsAtNextCounter: true,
    primitiveBindingUsesTransientCounter: true,
    readOnlyBindingUsesComputedCounter: true,
    readOnlyCounterUnchanged: 5,
  });
});

test('typed Core preserves identity and strict lookup behavior', async ({ page }) => {
  const result = await page.evaluate(() => {
    type UidFunction = (() => string) & { _c?: number };
    const core = (
      window as typeof window & {
        MatchaLunaApp: { domains: { core: Record<string, unknown> } };
      }
    ).MatchaLunaApp.domains.core as {
      uid: UidFunction;
      getById: <T extends { id: unknown }>(items: T[], id: unknown) => T | null;
    };
    const hadCounter = Object.prototype.hasOwnProperty.call(core.uid, '_c');
    const originalCounter = core.uid._c;

    try {
      const first = core.uid();
      const second = core.uid();
      const firstItem = { id: 'first', value: 1 };
      const numericItem = { id: 1, value: 2 };
      const items = [firstItem, numericItem];

      return {
        first,
        second,
        unique: first !== second,
        firstStartsWithId: first.startsWith('id'),
        secondStartsWithId: second.startsWith('id'),
        counterDelta: (core.uid._c || 0) - (originalCounter || 0),
        sameObjectIdentity: core.getById(items, 'first') === firstItem,
        missingIsNull: core.getById(items, 'missing') === null,
        numericIdMatches: core.getById(items, 1) === numericItem,
        strictIdEquality: core.getById(items, '1') === null,
      };
    } finally {
      if (hadCounter) core.uid._c = originalCounter;
      else delete core.uid._c;
    }
  });

  expect(result.unique).toBe(true);
  expect(result.firstStartsWithId).toBe(true);
  expect(result.secondStartsWithId).toBe(true);
  expect(result.first).toMatch(/^id\d+_[a-z0-9]+$/);
  expect(result.second).toMatch(/^id\d+_[a-z0-9]+$/);
  expect(result.counterDelta).toBe(2);
  expect(result.sameObjectIdentity).toBe(true);
  expect(result.missingIsNull).toBe(true);
  expect(result.numericIdMatches).toBe(true);
  expect(result.strictIdEquality).toBe(true);
});

test('typed Core preserves canonical serialization behavior', async ({ page }) => {
  const result = await page.evaluate(() => {
    const core = (
      window as typeof window & {
        MatchaLunaApp: { domains: { core: Record<string, unknown> } };
      }
    ).MatchaLunaApp.domains.core as {
      canonicalValue: (value: unknown) => unknown;
      stableSerialize: (value: unknown) => string | undefined;
      sameDataValue: (left: unknown, right: unknown) => boolean;
    };
    const canonicalInput = {
      z: 9,
      a: { omitted: undefined, d: 4, b: 2 },
      list: [{ z: 2, a: 1 }, 3],
    };
    const sparse = new Array(2);
    sparse[1] = { z: 2, a: 1 };
    const canonicalSparse = core.canonicalValue(sparse) as unknown[];
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    let cycleThrows = false;
    let bigintThrows = false;
    try {
      core.stableSerialize(cycle);
    } catch {
      cycleThrows = true;
    }
    try {
      core.stableSerialize(1n);
    } catch {
      bigintThrows = true;
    }

    return {
      canonical: core.canonicalValue(canonicalInput),
      canonicalNull: core.canonicalValue(null),
      topLevelOrder: core.stableSerialize({ b: 2, a: 1 }),
      nestedOrder: core.stableSerialize({ z: { y: 2, x: 1 }, a: 0 }),
      arrayOrder: core.stableSerialize([2, 1]),
      omittedObjectUndefined: core.stableSerialize({ omitted: undefined, a: 1 }),
      arrayUndefined: core.stableSerialize([1, undefined]),
      undefinedResult: core.stableSerialize(undefined) === undefined,
      sparseLength: canonicalSparse.length,
      sparseHoleRetained: !(0 in canonicalSparse),
      cycleThrows,
      bigintThrows,
      undefinedLikeValuesMatch: core.sameDataValue(undefined, () => undefined),
      sameAfterKeyReordering: core.sameDataValue(
        { b: 2, a: { d: 4, c: 3 } },
        { a: { c: 3, d: 4 }, b: 2 },
      ),
      differentMeaning: core.sameDataValue({ a: 1 }, { a: 2 }),
    };
  });

  expect(result).toEqual({
    canonical: {
      a: { b: 2, d: 4 },
      list: [{ a: 1, z: 2 }, 3],
      z: 9,
    },
    canonicalNull: null,
    topLevelOrder: '{"a":1,"b":2}',
    nestedOrder: '{"a":0,"z":{"x":1,"y":2}}',
    arrayOrder: '[2,1]',
    omittedObjectUndefined: '{"a":1}',
    arrayUndefined: '[1,null]',
    undefinedResult: true,
    sparseLength: 2,
    sparseHoleRetained: true,
    cycleThrows: true,
    bigintThrows: true,
    undefinedLikeValuesMatch: true,
    sameAfterKeyReordering: true,
    differentMeaning: false,
  });
});
