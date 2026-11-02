import {
  readPublicationBinding,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyFunction,
  type LegacyValue,
} from './bindings';
import {
  closePublishProductModal,
  renderPublishProductModal,
} from './modal';

function livePublication(
  name: string,
  fallback: LegacyFunction,
): LegacyFunction {
  return readPublicationBinding<LegacyFunction>(name, fallback);
}

export function waitForCostingSync(timeoutMs: LegacyValue): Promise<void> {
  const started = runtimeValue<LegacyValue>('Date').now();
  const limit = timeoutMs || 8000;
  return new (runtimeValue<LegacyValue>('Promise'))(function (
    resolve: LegacyFunction,
    reject: LegacyFunction,
  ) {
    function check(): void {
      if (runtimeValue<LegacyValue>('pendingRemote')) {
        reject({
          posMessage:
            'A partner update is waiting. Close this window, review the latest costing, then publish again.',
        });
        return;
      }
      if (
        !runtimeValue<LegacyValue>('pendingSave') &&
        !runtimeValue<LegacyValue>('saveTimer')
      ) {
        if (runtimeValue<LegacyValue>('localDirty')) {
          reject({
            posMessage:
              'Your latest costing changes are not saved to the cloud yet. Check your connection and try again.',
          });
          return;
        }
        resolve();
        return;
      }
      if (runtimeValue<LegacyValue>('Date').now() - started >= limit) {
        reject({
          posMessage:
            'Costing is still syncing. Wait for “Saved to cloud,” then try again.',
        });
        return;
      }
      runtimeFunction('setTimeout')(check, 80);
    }
    check();
  });
}

export async function publishProductToPos(): Promise<boolean> {
  if (
    !runtimeValue<LegacyValue>('publishModalOpen') ||
    !runtimeValue<LegacyValue>('publishSnapshot') ||
    runtimeValue<LegacyValue>('publishSubmitting')
  ) {
    return false;
  }
  let product = runtimeFunction('getById')(
    runtimeValue<LegacyValue>('state').products,
    runtimeValue<LegacyValue>('publishProductId'),
  );
  let validation = runtimeFunction('validateProductForPublish')(product);
  if (!validation.valid) {
    writeRuntimeBinding('publishError', validation.error);
    livePublication('renderPublishProductModal', renderPublishProductModal)();
    return false;
  }
  const category = runtimeFunction('String')(
    runtimeValue<LegacyValue>('publishSnapshot').categoryName || '',
  ).trim();
  const size = runtimeFunction('String')(
    runtimeValue<LegacyValue>('publishSnapshot').size || '',
  ).trim();
  if (!category) {
    writeRuntimeBinding(
      'publishError',
      'Enter a POS category, such as Matcha Drinks.',
    );
    livePublication('renderPublishProductModal', renderPublishProductModal)();
    return false;
  }
  if (category.length > 80) {
    writeRuntimeBinding(
      'publishError',
      'Keep the POS category under 80 characters.',
    );
    livePublication('renderPublishProductModal', renderPublishProductModal)();
    return false;
  }
  if (size.length > 40) {
    writeRuntimeBinding(
      'publishError',
      'Keep the size or variant under 40 characters.',
    );
    livePublication('renderPublishProductModal', renderPublishProductModal)();
    return false;
  }
  if (
    runtimeFunction('stableSerialize')(
      runtimeFunction('buildProductCostingSnapshot')(product, '').snapshot,
    ) !== runtimeValue<LegacyValue>('publishSnapshot').sourceFingerprint
  ) {
    writeRuntimeBinding(
      'publishError',
      'The costing changed after this window opened. Close it and review the updated figures before publishing.',
    );
    livePublication('renderPublishProductModal', renderPublishProductModal)();
    return false;
  }
  if (!runtimeFunction('posCanPublish')()) {
    writeRuntimeBinding(
      'publishError',
      'The POS workspace is unavailable. Check your connection and try again.',
    );
    livePublication('renderPublishProductModal', renderPublishProductModal)();
    return false;
  }
  const requestGeneration = runtimeValue<LegacyValue>('posLoadGeneration');
  const requestUserId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session') &&
      runtimeValue<LegacyValue>('session').user &&
      runtimeValue<LegacyValue>('session').user.id ||
      '',
  );
  const requestBusinessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  const requestCostingGeneration = runtimeValue<LegacyValue>(
    'costingLoadGeneration',
  );
  writeRuntimeBinding('publishSubmitting', true);
  writeRuntimeBinding('publishError', '');
  livePublication('renderPublishProductModal', renderPublishProductModal)();
  try {
    await livePublication('waitForCostingSync', waitForCostingSync)(8000);
    if (
      !runtimeFunction('posRequestIsCurrent')(
        requestGeneration,
        requestUserId,
        requestBusinessId,
      )
    ) {
      throw { posSessionChanged: true };
    }
    if (
      !runtimeFunction('costingRequestIsCurrent')(
        requestCostingGeneration,
        requestUserId,
      ) ||
      !runtimeValue<LegacyValue>('costingCloudReady')
    ) {
      throw {
        posMessage:
          'The shared costing data refreshed while this product was being reviewed. Close this window, check the latest figures, then publish again.',
      };
    }
    product = runtimeFunction('getById')(
      runtimeValue<LegacyValue>('state').products,
      runtimeValue<LegacyValue>('publishProductId'),
    );
    validation = runtimeFunction('validateProductForPublish')(product);
    if (!validation.valid) throw { posMessage: validation.error };
    if (
      runtimeFunction('stableSerialize')(
        runtimeFunction('buildProductCostingSnapshot')(product, '').snapshot,
      ) !== runtimeValue<LegacyValue>('publishSnapshot').sourceFingerprint
    ) {
      throw {
        posMessage:
          'The costing changed while you were publishing. Review the new figures and try again.',
      };
    }
    const built = runtimeFunction('buildProductCostingSnapshot')(product, size);
    const result = await runtimeValue<LegacyValue>('cloud').client.rpc(
      'pos_publish_costing_product',
      {
        p_business_id: requestBusinessId,
        p_source_costing_product_id: runtimeFunction('String')(product.id),
        p_source_costing_recipe_id: runtimeFunction('String')(product.recipeId),
        p_name: runtimeFunction('String')(product.name || '').trim(),
        p_selling_price_centavos: built.sellingPriceCentavos,
        p_ingredient_cost_centavos: built.ingredientCostCentavos,
        p_packaging_cost_centavos: built.packagingCostCentavos,
        p_costing_snapshot: built.snapshot,
        p_size: size || null,
        p_category_name: category || null,
        p_expected_active_version_id:
          runtimeValue<LegacyValue>('publishSnapshot').expectedActiveVersionId ||
          null,
      },
    );
    if (
      !runtimeFunction('posRequestIsCurrent')(
        requestGeneration,
        requestUserId,
        requestBusinessId,
      )
    ) {
      throw { posSessionChanged: true };
    }
    const rows = runtimeFunction('rpcRows')(result);
    const row = rows[0];
    if (!row || !row.version_id) {
      throw new (runtimeValue<LegacyValue>('Error'))(
        'Missing publication result',
      );
    }
    runtimeValue<LegacyValue>('posContext').publications[
      runtimeFunction('String')(product.id)
    ] = {
      product_id: row.product_id,
      source_costing_product_id: runtimeFunction('String')(product.id),
      category_id: row.category_id || null,
      category_name: row.category_name || null,
      catalog_name: row.product_name || product.name,
      available: row.available !== false,
      archived_at: null,
      active_version_id: row.version_id,
      version_number: row.version_number,
      name_snapshot: runtimeFunction('String')(product.name || '').trim(),
      size_snapshot: row.size_snapshot || null,
      source_costing_recipe_id: runtimeFunction('String')(product.recipeId),
      source_costing_hash: row.source_costing_hash,
      selling_price_centavos: runtimeFunction('Number')(
        row.selling_price_centavos,
      ),
      ingredient_cost_centavos: runtimeFunction('Number')(
        row.ingredient_cost_centavos,
      ),
      packaging_cost_centavos: runtimeFunction('Number')(
        row.packaging_cost_centavos,
      ),
      estimated_unit_cost_centavos: runtimeFunction('Number')(
        row.estimated_unit_cost_centavos,
      ),
      costing_snapshot: built.snapshot,
      published_at: row.published_at,
    };
    try {
      await runtimeFunction('loadPosPublicationStatus')();
    } catch (refreshError) {}
    if (
      !runtimeFunction('posRequestIsCurrent')(
        requestGeneration,
        requestUserId,
        requestBusinessId,
      )
    ) {
      return false;
    }
    let catalogRefreshed = false;
    try {
      catalogRefreshed = await runtimeFunction('refreshPosCatalogOnly')();
    } catch (catalogRefreshError) {}
    if (
      !runtimeFunction('posRequestIsCurrent')(
        requestGeneration,
        requestUserId,
        requestBusinessId,
      )
    ) {
      return false;
    }
    runtimeValue<LegacyValue>('posCheckout').notice = catalogRefreshed
      ? 'Drink published and added to the POS cards.'
      : 'Drink published. Refresh the POS menu when the connection is stable.';
    writeRuntimeBinding('publishSubmitting', false);
    livePublication(
      'closePublishProductModal',
      closePublishProductModal,
    )();
    runtimeFunction('renderProducts')();
    runtimeFunction('renderPos')();
    return true;
  } catch (error: LegacyValue) {
    if (error && error.posSessionChanged) return false;
    writeRuntimeBinding('publishSubmitting', false);
    writeRuntimeBinding(
      'publishError',
      error && error.posMessage
        ? error.posMessage
        : runtimeFunction('posFriendlyError')(error),
    );
    if (
      error &&
      runtimeFunction('String')(error.code || '') === '40001'
    ) {
      try {
        await runtimeFunction('loadPosPublicationStatus')();
      } catch (refreshError) {}
    }
    livePublication('renderPublishProductModal', renderPublishProductModal)();
    return false;
  }
}

export function explainPublishedProductDelete(target: LegacyValue): void {
  runtimeFunction('alert')(
    '"' +
      runtimeFunction('String')(target && target.name || 'This product') +
      '" is already published in the POS. Keep its costing record for now; menu archive controls are coming in the next POS phase.',
  );
}

export async function deleteCostingProduct(id: LegacyValue): Promise<boolean> {
  let target = runtimeFunction('getById')(
    runtimeValue<LegacyValue>('state').products,
    id,
  );
  if (!target) return false;
  let published = runtimeValue<LegacyValue>('posContext').publications[
    runtimeFunction('String')(id)
  ];
  if (published && !published.archived_at) {
    livePublication(
      'explainPublishedProductDelete',
      explainPublishedProductDelete,
    )(target);
    return false;
  }
  if (!runtimeValue<LegacyValue>('TEST_MODE')) {
    if (
      !runtimeValue<LegacyValue>('session') ||
      !runtimeValue<LegacyValue>('cloud').connected ||
      !runtimeValue<LegacyValue>('posContext').businessId
    ) {
      runtimeFunction('alert')(
        'Connect to the shared cloud and POS before deleting a costing product, so its publication status can be checked safely.',
      );
      return false;
    }
    if (
      runtimeValue<LegacyValue>('posContext').role !== 'owner' &&
      runtimeValue<LegacyValue>('posContext').role !== 'manager'
    ) {
      runtimeFunction('alert')(
        'Only a POS owner or manager can verify and delete a costing product.',
      );
      return false;
    }
    try {
      const refreshed = await runtimeFunction('loadPosPublicationStatus')();
      if (!refreshed) {
        throw new (runtimeValue<LegacyValue>('Error'))('stale POS status');
      }
    } catch (error) {
      runtimeFunction('alert')(
        'The POS publication status could not be verified. Nothing was deleted; check your connection and try again.',
      );
      return false;
    }
    target = runtimeFunction('getById')(
      runtimeValue<LegacyValue>('state').products,
      id,
    );
    if (!target) return false;
    published = runtimeValue<LegacyValue>('posContext').publications[
      runtimeFunction('String')(id)
    ];
    if (published && !published.archived_at) {
      livePublication(
        'explainPublishedProductDelete',
        explainPublishedProductDelete,
      )(target);
      runtimeFunction('renderProducts')();
      return false;
    }
  }
  if (
    !runtimeFunction('confirm')(
      'Delete "' +
        runtimeFunction('String')(target.name || 'this product') +
        '"?',
    )
  ) {
    return false;
  }
  runtimeValue<LegacyValue>('state').products = runtimeValue<LegacyValue>(
    'state',
  ).products.filter(function (item: LegacyValue) {
    return item.id !== id;
  });
  runtimeFunction('logChanges')();
  runtimeFunction('save')();
  runtimeFunction('renderAll')();
  return true;
}
