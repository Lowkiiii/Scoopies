import {
  catalogFunction,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

function stringValue(value: LegacyValue): string {
  return runtimeValue<LegacyValue>('String')(value);
}

function incrementRuntimeBinding(name: string): LegacyValue {
  let value = runtimeValue<LegacyValue>(name);
  value++;
  writeRuntimeBinding(name, value);
  return value;
}

export function posCanManageMedia(): boolean {
  return !!(
    runtimeValue<LegacyValue>('session') &&
    runtimeValue<LegacyValue>('session').user &&
    runtimeValue<LegacyValue>('cloud').client &&
    runtimeValue<LegacyValue>('posContext').businessId &&
    runtimeFunction('posCanManageOperations')()
  );
}

export function posPublicImageUrl(path: LegacyValue): string {
  path = stringValue(path || '').trim();
  if (
    !path ||
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('cloud').client.storage
  ) {
    return '';
  }
  try {
    const result = runtimeValue<LegacyValue>('cloud')
      .client.storage.from(runtimeValue<LegacyValue>('POS_IMAGE_BUCKET'))
      .getPublicUrl(path);
    return stringValue(
      (result && result.data && result.data.publicUrl) || '',
    );
  } catch (_error) {
    return '';
  }
}

export function posDrinkImageHtml(
  item: LegacyValue,
  extraClass: LegacyValue,
): string {
  const name = stringValue(
    (item && item.product_name) || (item && item.name) || 'Drink',
  );
  const url = catalogFunction('posPublicImageUrl')(
    item && item.image_object_path,
  );
  return (
    '<span class="pos-drink-photo ' +
    runtimeFunction('escapeHtml')(extraClass || '') +
    '" aria-hidden="true">' +
    (url
      ? '<img class="pos-drink-image" src="' +
        runtimeFunction('escapeHtml')(url) +
        '" alt="" width="480" height="360" loading="lazy" decoding="async">'
      : '') +
    '<span class="pos-drink-image-fallback"' +
    (url ? ' hidden' : '') +
    '><span>🍵</span><small>' +
    runtimeFunction('escapeHtml')(name.charAt(0).toUpperCase()) +
    '</small></span></span>'
  );
}

export function posMediaRequestCurrent(
  generation: LegacyValue,
  userId: LegacyValue,
  businessId: LegacyValue,
): boolean {
  return (
    generation === runtimeValue<LegacyValue>('posMediaGeneration') &&
    runtimeValue<LegacyValue>('posOpsModal').open &&
    runtimeValue<LegacyValue>('posOpsModal').type === 'manageDrinks' &&
    !!runtimeValue<LegacyValue>('session') &&
    !!runtimeValue<LegacyValue>('session').user &&
    stringValue(runtimeValue<LegacyValue>('session').user.id || '') ===
      stringValue(userId || '') &&
    stringValue(runtimeValue<LegacyValue>('posContext').businessId || '') ===
      stringValue(businessId || '')
  );
}

export function posMediaRow(productId: LegacyValue): LegacyValue {
  return (
    (runtimeValue<LegacyValue>('posOpsModal').mediaRows || []).find(
      function (row: LegacyValue) {
        return stringValue(row.product_id || '') === stringValue(productId || '');
      },
    ) || null
  );
}

export function posPatchProductImage(
  productId: LegacyValue,
  path: LegacyValue,
  updatedAt: LegacyValue,
): boolean {
  productId = stringValue(productId || '');
  path = path ? stringValue(path) : null;
  (runtimeValue<LegacyValue>('posOpsModal').mediaRows || []).forEach(
    function (row: LegacyValue) {
      if (stringValue(row.product_id || '') === productId) {
        row.image_object_path = path;
        if (updatedAt) row.updated_at = updatedAt;
        else {
          const DateConstructor = runtimeValue<LegacyValue>('Date');
          row.updated_at = new DateConstructor().toISOString();
        }
      }
    },
  );
  (runtimeValue<LegacyValue>('posCheckout').catalog || []).forEach(
    function (row: LegacyValue) {
      if (stringValue(row.product_id || '') === productId) {
        row.image_object_path = path;
      }
    },
  );
  catalogFunction('posRememberCatalogCache')();
  return true;
}

export async function openManageDrinksModal(): Promise<boolean> {
  if (!catalogFunction('posCanManageMedia')()) return false;
  runtimeFunction('posOpenOpsModal')('manageDrinks', {
    mediaLoading: true,
    mediaLoaded: false,
    mediaRows: [],
  });
  const generation = incrementRuntimeBinding('posMediaGeneration');
  const userId = stringValue(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = stringValue(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  runtimeFunction('renderPosOpsModal')();
  try {
    const rows = catalogFunction('rpcRows')(
      await runtimeValue<LegacyValue>('cloud').client.rpc(
        'pos_get_product_media',
        { p_business_id: businessId },
      ),
    );
    if (
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    runtimeValue<LegacyValue>('posOpsModal').mediaRows = rows;
    runtimeValue<LegacyValue>('posOpsModal').mediaLoading = false;
    runtimeValue<LegacyValue>('posOpsModal').mediaLoaded = true;
    runtimeValue<LegacyValue>('posOpsModal').error = '';
    runtimeFunction('renderPosOpsModal')();
    runtimeFunction('focusSoon')('#posManageDrinksList');
    return true;
  } catch (error) {
    if (
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    runtimeValue<LegacyValue>('posOpsModal').mediaLoading = false;
    runtimeValue<LegacyValue>('posOpsModal').mediaLoaded = true;
    runtimeValue<LegacyValue>('posOpsModal').error = runtimeFunction(
      'posFriendlyError',
    )(error);
    runtimeFunction('renderPosOpsModal')();
    return false;
  }
}

export async function posReloadMediaRows(
  generation: LegacyValue,
  userId: LegacyValue,
  businessId: LegacyValue,
): Promise<LegacyValue[]> {
  if (
    !catalogFunction('posCanManageMedia')() ||
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'manageDrinks'
  ) {
    return [];
  }
  const rows = catalogFunction('rpcRows')(
    await runtimeValue<LegacyValue>('cloud').client.rpc(
      'pos_get_product_media',
      {
        p_business_id: stringValue(
          runtimeValue<LegacyValue>('posContext').businessId,
        ),
      },
    ),
  );
  if (
    generation != null &&
    !catalogFunction('posMediaRequestCurrent')(
      generation,
      userId,
      businessId,
    )
  ) {
    return [];
  }
  runtimeValue<LegacyValue>('posOpsModal').mediaRows = rows;
  runtimeValue<LegacyValue>('posOpsModal').mediaLoaded = true;
  return rows;
}

export async function uploadPosDrinkImage(
  productId: LegacyValue,
  file: LegacyValue,
): Promise<boolean> {
  if (
    !catalogFunction('posCanManageMedia')() ||
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'manageDrinks' ||
    runtimeValue<LegacyValue>('posOpsModal').submitting
  ) {
    return false;
  }
  const media = catalogFunction('posMediaRow')(productId);
  if (!media) return false;
  const generation = runtimeValue<LegacyValue>('posMediaGeneration');
  const userId = stringValue(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = stringValue(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  const oldPath = media.image_object_path || null;
  runtimeValue<LegacyValue>('posOpsModal').submitting = true;
  runtimeValue<LegacyValue>('posOpsModal').mediaProductId = stringValue(
    productId,
  );
  runtimeValue<LegacyValue>('posOpsModal').error = '';
  runtimeValue<LegacyValue>('posOpsModal').notice = 'Preparing photo…';
  runtimeFunction('renderPosOpsModal')();
  let newPath = '';
  try {
    const blob = file && file.source
      ? await catalogFunction('posExportDrinkImage')(file)
      : await catalogFunction('posPrepareDrinkImage')(file);
    if (
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    newPath =
      businessId +
      '/' +
      stringValue(productId) +
      '/' +
      catalogFunction('posUuid')() +
      '.webp';
    runtimeValue<LegacyValue>('posOpsModal').notice = 'Uploading photo…';
    runtimeFunction('renderPosOpsModal')();
    const upload = await runtimeValue<LegacyValue>('cloud')
      .client.storage.from(runtimeValue<LegacyValue>('POS_IMAGE_BUCKET'))
      .upload(newPath, blob, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false,
      });
    if (upload && upload.error) throw upload.error;
    if (
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    const rows = catalogFunction('rpcRows')(
      await runtimeValue<LegacyValue>('cloud').client.rpc(
        'pos_set_product_image',
        {
          p_business_id: businessId,
          p_product_id: stringValue(productId),
          p_new_path: newPath,
          p_expected_old_path: oldPath,
        },
      ),
    );
    const saved = rows[0];
    if (!saved) {
      const ErrorConstructor = runtimeValue<LegacyValue>('Error');
      throw new ErrorConstructor('Missing image update response');
    }
    if (
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    catalogFunction('posPatchProductImage')(
      productId,
      saved.image_object_path == null ? newPath : saved.image_object_path,
      saved.updated_at,
    );
    let cleanupWarning = false;
    if (oldPath && oldPath !== newPath) {
      try {
        const oldCleanup = await runtimeValue<LegacyValue>('cloud')
          .client.storage.from(runtimeValue<LegacyValue>('POS_IMAGE_BUCKET'))
          .remove([oldPath]);
        cleanupWarning = !!(oldCleanup && oldCleanup.error);
      } catch (_cleanupError) {
        cleanupWarning = true;
      }
    }
    if (
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    runtimeValue<LegacyValue>('posOpsModal').submitting = false;
    runtimeValue<LegacyValue>('posOpsModal').mediaProductId = '';
    runtimeValue<LegacyValue>('posOpsModal').notice = cleanupWarning
      ? 'Photo saved to the shared menu. The previous file could not be cleaned up, but customers will see the new photo.'
      : 'Photo saved to the shared menu.';
    runtimeFunction('renderPosOpsModal')();
    runtimeFunction('renderPos')();
    return true;
  } catch (error) {
    if (
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    let recovered = false;
    let verified = false;
    let authoritative: LegacyValue = null;
    if (newPath) {
      try {
        const latest = await catalogFunction('posReloadMediaRows')(
          generation,
          userId,
          businessId,
        );
        if (
          !catalogFunction('posMediaRequestCurrent')(
            generation,
            userId,
            businessId,
          )
        ) {
          return false;
        }
        verified = true;
        authoritative =
          latest.find(function (row: LegacyValue) {
            return stringValue(row.product_id || '') === stringValue(productId);
          }) || null;
        if (
          authoritative &&
          stringValue(authoritative.image_object_path || '') === newPath
        ) {
          catalogFunction('posPatchProductImage')(
            productId,
            newPath,
            authoritative.updated_at,
          );
          recovered = true;
        }
      } catch (_refreshError) {
        // Classic intentionally continues to the conservative cleanup branch.
      }
      if (
        !recovered &&
        verified &&
        authoritative &&
        stringValue(authoritative.image_object_path || '') !== newPath
      ) {
        try {
          await runtimeValue<LegacyValue>('cloud')
            .client.storage.from(runtimeValue<LegacyValue>('POS_IMAGE_BUCKET'))
            .remove([newPath]);
        } catch (_cleanupError) {
          // Classic treats loser-object cleanup as best effort.
        }
      }
    }
    if (
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return recovered;
    }
    const caught = error as LegacyValue;
    runtimeValue<LegacyValue>('posOpsModal').submitting = false;
    runtimeValue<LegacyValue>('posOpsModal').mediaProductId = '';
    runtimeValue<LegacyValue>('posOpsModal').notice = recovered
      ? 'Photo saved and recovered after the connection stopped.'
      : '';
    runtimeValue<LegacyValue>('posOpsModal').error = recovered
      ? ''
      : caught && caught.posMessage
        ? caught.posMessage
        : runtimeFunction('posFriendlyError')(caught);
    runtimeFunction('renderPosOpsModal')();
    runtimeFunction('renderPos')();
    return recovered;
  }
}

export function requestRemovePosDrinkImage(productId: LegacyValue): boolean {
  if (
    !catalogFunction('posCanManageMedia')() ||
    runtimeValue<LegacyValue>('posOpsModal').submitting ||
    !catalogFunction('posMediaRow')(productId)
  ) {
    return false;
  }
  runtimeValue<LegacyValue>('posOpsModal').mediaRemoveProductId = stringValue(
    productId,
  );
  runtimeValue<LegacyValue>('posOpsModal').error = '';
  runtimeValue<LegacyValue>('posOpsModal').notice = '';
  runtimeFunction('renderPosOpsModal')();
  runtimeFunction('focusSoon')('#posCancelRemoveImage');
  return true;
}

export function cancelRemovePosDrinkImage(): boolean {
  if (runtimeValue<LegacyValue>('posOpsModal').submitting) return false;
  runtimeValue<LegacyValue>('posOpsModal').mediaRemoveProductId = '';
  runtimeValue<LegacyValue>('posOpsModal').error = '';
  runtimeFunction('renderPosOpsModal')();
  return true;
}

export async function confirmRemovePosDrinkImage(): Promise<boolean> {
  if (
    !catalogFunction('posCanManageMedia')() ||
    runtimeValue<LegacyValue>('posOpsModal').submitting ||
    !runtimeValue<LegacyValue>('posOpsModal').mediaRemoveProductId
  ) {
    return false;
  }
  const productId = stringValue(
    runtimeValue<LegacyValue>('posOpsModal').mediaRemoveProductId,
  );
  const media = catalogFunction('posMediaRow')(productId);
  const oldPath = (media && media.image_object_path) || null;
  if (!media || !oldPath) {
    runtimeValue<LegacyValue>('posOpsModal').mediaRemoveProductId = '';
    runtimeFunction('renderPosOpsModal')();
    return false;
  }
  const generation = runtimeValue<LegacyValue>('posMediaGeneration');
  const userId = stringValue(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = stringValue(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  runtimeValue<LegacyValue>('posOpsModal').submitting = true;
  runtimeValue<LegacyValue>('posOpsModal').mediaProductId = productId;
  runtimeValue<LegacyValue>('posOpsModal').error = '';
  runtimeFunction('renderPosOpsModal')();
  try {
    const rows = catalogFunction('rpcRows')(
      await runtimeValue<LegacyValue>('cloud').client.rpc(
        'pos_set_product_image',
        {
          p_business_id: businessId,
          p_product_id: productId,
          p_new_path: null,
          p_expected_old_path: oldPath,
        },
      ),
    );
    if (
      !rows[0] ||
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    catalogFunction('posPatchProductImage')(
      productId,
      null,
      rows[0].updated_at,
    );
    const cleanup = await runtimeValue<LegacyValue>('cloud')
      .client.storage.from(runtimeValue<LegacyValue>('POS_IMAGE_BUCKET'))
      .remove([oldPath]);
    if (
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    runtimeValue<LegacyValue>('posOpsModal').notice =
      cleanup && cleanup.error
        ? 'Photo was removed from the menu, but cloud cleanup should be retried later.'
        : 'Photo removed from the shared menu.';
    runtimeValue<LegacyValue>('posOpsModal').submitting = false;
    runtimeValue<LegacyValue>('posOpsModal').mediaProductId = '';
    runtimeValue<LegacyValue>('posOpsModal').mediaRemoveProductId = '';
    runtimeFunction('renderPosOpsModal')();
    runtimeFunction('renderPos')();
    return true;
  } catch (error) {
    if (
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    try {
      const latest = await catalogFunction('posReloadMediaRows')(
        generation,
        userId,
        businessId,
      );
      if (
        !catalogFunction('posMediaRequestCurrent')(
          generation,
          userId,
          businessId,
        )
      ) {
        return false;
      }
      const authoritative = latest.find(function (row: LegacyValue) {
        return stringValue(row.product_id || '') === productId;
      });
      if (authoritative && !authoritative.image_object_path) {
        catalogFunction('posPatchProductImage')(
          productId,
          null,
          authoritative.updated_at,
        );
        runtimeValue<LegacyValue>('posOpsModal').submitting = false;
        runtimeValue<LegacyValue>('posOpsModal').mediaProductId = '';
        runtimeValue<LegacyValue>('posOpsModal').mediaRemoveProductId = '';
        runtimeValue<LegacyValue>('posOpsModal').notice =
          'Photo removal recovered after the connection stopped.';
        runtimeFunction('renderPosOpsModal')();
        runtimeFunction('renderPos')();
        return true;
      }
    } catch (_refreshError) {
      // Classic falls through to the original error.
    }
    runtimeValue<LegacyValue>('posOpsModal').submitting = false;
    runtimeValue<LegacyValue>('posOpsModal').mediaProductId = '';
    runtimeValue<LegacyValue>('posOpsModal').error = runtimeFunction(
      'posFriendlyError',
    )(error);
    runtimeFunction('renderPosOpsModal')();
    return false;
  }
}
