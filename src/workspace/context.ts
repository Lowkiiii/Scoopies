import {
  runtimeFunction,
  runtimeValue,
  workspaceFunction,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

function incrementRuntimeBinding(name: string): LegacyValue {
  let value = runtimeValue<LegacyValue>(name);
  value++;
  writeRuntimeBinding(name, value);
  return value;
}

export function posRequestIsCurrent(
  generation: LegacyValue,
  userId: LegacyValue,
  businessId: LegacyValue,
): boolean {
  return generation === runtimeValue<LegacyValue>('posLoadGeneration') &&
    !!runtimeValue<LegacyValue>('session') &&
    !!runtimeValue<LegacyValue>('session').user &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('session').user.id || '',
    ) === runtimeFunction('String')(userId || '') &&
    (
      businessId == null ||
      runtimeFunction('String')(
        runtimeValue<LegacyValue>('posContext').businessId || '',
      ) === runtimeFunction('String')(businessId || '')
    );
}

export function costingRequestIsCurrent(
  generation: LegacyValue,
  userId: LegacyValue,
): boolean {
  return generation === runtimeValue<LegacyValue>('costingLoadGeneration') &&
    !!runtimeValue<LegacyValue>('session') &&
    !!runtimeValue<LegacyValue>('session').user &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('session').user.id || '',
    ) === runtimeFunction('String')(userId || '');
}

export async function loadPosPublicationStatus(
  expectedGeneration?: LegacyValue,
): Promise<boolean> {
  if (
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId
  ) {
    return false;
  }
  const generation = expectedGeneration == null
    ? runtimeValue<LegacyValue>('posLoadGeneration')
    : expectedGeneration;
  const statusGeneration = incrementRuntimeBinding('posStatusGeneration');
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  const result = await runtimeValue<LegacyValue>('cloud').client.rpc(
    'pos_get_publication_status',
    { p_business_id: businessId },
  );
  const rows = runtimeFunction('rpcRows')(result);
  const publications: LegacyValue = {};
  if (
    statusGeneration !== runtimeValue<LegacyValue>('posStatusGeneration') ||
    !workspaceFunction('posRequestIsCurrent')(
      generation,
      userId,
      businessId,
    )
  ) {
    return false;
  }
  rows.forEach(function (row: LegacyValue) {
    if (row && row.source_costing_product_id) {
      publications[
        runtimeFunction('String')(row.source_costing_product_id)
      ] = row;
    }
  });
  runtimeValue<LegacyValue>('posContext').publications = publications;
  return true;
}

export async function loadPosContext(): Promise<boolean> {
  if (
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user
  ) {
    runtimeFunction('resetPosContext')('Sign in to use the POS.');
    runtimeFunction('renderProducts')();
    runtimeFunction('renderPos')();
    return false;
  }
  if (runtimeValue<LegacyValue>('posContext').loading) return false;
  const generation = incrementRuntimeBinding('posLoadGeneration');
  incrementRuntimeBinding('posStatusGeneration');
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  runtimeValue<LegacyValue>('posContext').loading = true;
  runtimeValue<LegacyValue>('posContext').error = '';
  runtimeFunction('renderProducts')();
  runtimeFunction('renderPos')();
  try {
    const result = await runtimeValue<LegacyValue>('cloud').client.rpc(
      'pos_get_my_businesses',
    );
    const businesses = runtimeFunction('rpcRows')(result);
    if (
      !workspaceFunction('posRequestIsCurrent')(generation, userId, null)
    ) {
      return false;
    }
    if (!businesses.length) {
      throw { posMessage: 'Your POS workspace has not been set up yet.' };
    }
    if (businesses.length !== 1) {
      throw {
        posMessage:
          'More than one POS workspace was found. Workspace selection is required.',
      };
    }
    const business = businesses[0];
    runtimeValue<LegacyValue>('posContext').businessId =
      runtimeFunction('String')(business.business_id || '');
    runtimeValue<LegacyValue>('posContext').businessName =
      runtimeFunction('String')(
        business.business_name ||
          runtimeValue<LegacyValue>('APP_BRAND_NAME'),
      );
    runtimeValue<LegacyValue>('posContext').role =
      runtimeFunction('String')(business.member_role || '');
    if (
      runtimeValue<LegacyValue>('posContext').role === 'owner' ||
      runtimeValue<LegacyValue>('posContext').role === 'manager'
    ) {
      await workspaceFunction('loadPosPublicationStatus')(generation);
    } else {
      runtimeValue<LegacyValue>('posContext').publications = {};
    }
    if (
      !workspaceFunction('posRequestIsCurrent')(
        generation,
        userId,
        runtimeValue<LegacyValue>('posContext').businessId,
      )
    ) {
      return false;
    }
    runtimeValue<LegacyValue>('posContext').loaded = true;
    runtimeValue<LegacyValue>('posContext').error = '';
    return true;
  } catch (error: LegacyValue) {
    if (
      !workspaceFunction('posRequestIsCurrent')(generation, userId, null)
    ) {
      return false;
    }
    runtimeValue<LegacyValue>('posContext').loaded = true;
    runtimeValue<LegacyValue>('posContext').businessId = '';
    runtimeValue<LegacyValue>('posContext').businessName = '';
    runtimeValue<LegacyValue>('posContext').role = '';
    runtimeValue<LegacyValue>('posContext').publications = {};
    runtimeValue<LegacyValue>('posContext').error = error && error.posMessage
      ? error.posMessage
      : runtimeFunction('posFriendlyError')(error);
    return false;
  } finally {
    if (generation === runtimeValue<LegacyValue>('posLoadGeneration')) {
      runtimeValue<LegacyValue>('posContext').loading = false;
      runtimeFunction('renderProducts')();
      runtimeFunction('renderPos')();
    }
  }
}

export function posRpcErrorText(error: LegacyValue): string {
  if (
    error &&
    runtimeFunction('String')(error.code || '') === '42501'
  ) {
    return 'Your account no longer has access to this POS workspace.';
  }
  return 'Could not load the POS. Check your connection and try again.';
}

export function posHandleAccessDenied(error: LegacyValue): boolean {
  if (
    !error ||
    runtimeFunction('String')(error.code || '') !== '42501'
  ) {
    return false;
  }
  runtimeFunction('setPosReportsLoading')(false);
  runtimeFunction('posClearCatalogCache')();
  runtimeFunction('resetPosContext')(
    workspaceFunction('posRpcErrorText')(error),
  );
  runtimeFunction('renderProducts')();
  runtimeFunction('renderPos')();
  return true;
}
