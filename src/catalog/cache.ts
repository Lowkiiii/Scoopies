import {
  catalogFunction,
  runtimeFunction,
  runtimeValue,
  type LegacyValue,
} from './bindings';

export function posLoadRequestStillCurrent(
  generation: LegacyValue,
  userId: LegacyValue,
  businessId: LegacyValue,
): boolean {
  return generation === runtimeValue<LegacyValue>('posCheckoutLoadGeneration') &&
    !!runtimeValue<LegacyValue>('session') &&
    !!runtimeValue<LegacyValue>('session').user &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('session').user.id || '',
    ) ===
      runtimeFunction('String')(userId || '') &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('posContext').businessId || '',
    ) === runtimeFunction('String')(businessId || '');
}

export function posCatalogRequestStillCurrent(
  generation: LegacyValue,
  userId: LegacyValue,
  businessId: LegacyValue,
): boolean {
  return generation === runtimeValue<LegacyValue>('posCatalogGeneration') &&
    !!runtimeValue<LegacyValue>('session') &&
    !!runtimeValue<LegacyValue>('session').user &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('session').user.id || '',
    ) ===
      runtimeFunction('String')(userId || '') &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('posContext').businessId || '',
    ) === runtimeFunction('String')(businessId || '');
}

export function posCatalogCacheScope(): string {
  if (
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId
  ) {
    return '';
  }
  return runtimeFunction('String')(
    runtimeValue<LegacyValue>('cloud').url || runtimeFunction('activeUrl')() || '',
  ) + '|' + runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  ) + '|' + runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
}

export function posHydrateCatalogCache(): boolean {
  const scope = catalogFunction('posCatalogCacheScope')();
  if (
    !scope ||
    runtimeValue<LegacyValue>('posCheckout').loaded ||
    runtimeValue<LegacyValue>('posCheckout').catalogFromCache
  ) {
    return false;
  }
  try {
    const record = runtimeValue<LegacyValue>('JSON').parse(
      runtimeValue<LegacyValue>('sessionStorage').getItem(
        runtimeValue<LegacyValue>('POS_CATALOG_CACHE_KEY'),
      ),
    );
    if (
      !record ||
      record.schemaVersion !== 2 ||
      record.scope !== scope ||
      !runtimeValue<LegacyValue>('Array').isArray(record.catalog) ||
      !(runtimeFunction('Number')(record.savedAt) > 0) ||
      runtimeValue<LegacyValue>('Date').now() -
          runtimeFunction('Number')(record.savedAt) >
        runtimeValue<LegacyValue>('POS_CATALOG_CACHE_MAX_AGE_MS')
    ) {
      return false;
    }
    runtimeValue<LegacyValue>('posCheckout').catalog =
      runtimeFunction('snapshot')(record.catalog);
    runtimeValue<LegacyValue>('posCheckout').catalogFromCache = true;
    runtimeValue<LegacyValue>('posCheckout').catalogLoading = false;
    runtimeValue<LegacyValue>('posCheckout').catalogError = '';
    catalogFunction('normalizePosCategory')();
    if (!catalogFunction('posRestorePending')()) {
      catalogFunction('markPosCartAgainstCatalog')();
    }
    return true;
  } catch (error) {
    return false;
  }
}

export function posRememberCatalogCache(): boolean {
  const scope = catalogFunction('posCatalogCacheScope')();
  if (
    !scope ||
    !runtimeValue<LegacyValue>('Array').isArray(
      runtimeValue<LegacyValue>('posCheckout').catalog,
    )
  ) {
    return false;
  }
  try {
    runtimeValue<LegacyValue>('sessionStorage').setItem(
      runtimeValue<LegacyValue>('POS_CATALOG_CACHE_KEY'),
      runtimeValue<LegacyValue>('JSON').stringify({
        schemaVersion: 2,
        scope,
        savedAt: runtimeValue<LegacyValue>('Date').now(),
        catalog: runtimeValue<LegacyValue>('posCheckout').catalog,
      }),
    );
    return true;
  } catch (error) {
    return false;
  }
}

export function posClearCatalogCache(): void {
  try {
    runtimeValue<LegacyValue>('sessionStorage').removeItem(
      runtimeValue<LegacyValue>('POS_CATALOG_CACHE_KEY'),
    );
  } catch (error) {}
}
