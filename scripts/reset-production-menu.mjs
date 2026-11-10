#!/usr/bin/env node

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RESET_CONFIRMATION = 'CLEAR RECIPES PRICING AND POS DRINKS';

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredValue(value, label) {
  const cleaned = cleanString(value);
  if (!cleaned) throw new Error(`${label} is required.`);
  return cleaned;
}

export function validateConfirmation(value) {
  if (value !== RESET_CONFIRMATION) {
    throw new Error(`Reset blocked: confirmation must exactly match "${RESET_CONFIRMATION}".`);
  }
}

export function selectManagedBusiness(members, requestedBusinessId = '') {
  if (!Array.isArray(members)) {
    throw new Error('The business membership response was invalid.');
  }

  const managed = members.filter((member) =>
    member && ['owner', 'manager'].includes(member.member_role));
  const requested = cleanString(requestedBusinessId);

  if (requested) {
    const selected = managed.find((member) => member.business_id === requested);
    if (!selected) {
      throw new Error('The requested business is not available to this owner/manager account.');
    }
    return selected;
  }

  if (managed.length !== 1) {
    throw new Error(
      `Reset blocked: expected exactly one owner/manager business, but found ${managed.length}. ` +
      'Provide MATCHA_LUNA_BUSINESS_ID to select one explicitly.',
    );
  }
  return managed[0];
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function prepareCostingReset(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The cloud costing document is not a JSON object.');
  }
  if (!Array.isArray(data.recipes) || !Array.isArray(data.products)) {
    throw new Error('The cloud costing document must contain recipes and products arrays.');
  }

  const preserved = { ...data };
  delete preserved.recipes;
  delete preserved.products;

  return {
    nextData: { ...data, recipes: [], products: [] },
    preservedFingerprint: stableJson(preserved),
    recipeCount: data.recipes.length,
    pricingCount: data.products.length,
  };
}

export function assertCostingReset(originalData, resetData) {
  const prepared = prepareCostingReset(originalData);
  if (!resetData || !Array.isArray(resetData.recipes) || resetData.recipes.length !== 0) {
    throw new Error('Verification failed: recipes were not cleared.');
  }
  if (!Array.isArray(resetData.products) || resetData.products.length !== 0) {
    throw new Error('Verification failed: pricing products were not cleared.');
  }

  const preserved = { ...resetData };
  delete preserved.recipes;
  delete preserved.products;
  if (stableJson(preserved) !== prepared.preservedFingerprint) {
    throw new Error('Verification failed: data outside Recipes and Pricing changed.');
  }
}

function mergeAvailabilityRows(publicationRows, mediaRows) {
  const products = new Map();

  for (const row of Array.isArray(publicationRows) ? publicationRows : []) {
    if (!row || !row.product_id || row.archived_at != null) continue;
    products.set(row.product_id, {
      productId: row.product_id,
      name: row.catalog_name || row.name_snapshot || '',
      available: row.available === true,
      archivedAt: row.archived_at,
    });
  }

  for (const row of Array.isArray(mediaRows) ? mediaRows : []) {
    if (!row || !row.product_id) continue;
    const prior = products.get(row.product_id) || {};
    products.set(row.product_id, {
      productId: row.product_id,
      name: row.product_name || prior.name || '',
      available: row.available === true,
      archivedAt: null,
    });
  }

  return [...products.values()];
}

export function buildResetBackup({ business, stateRow, publicationRows, mediaRows, createdAt }) {
  const products = mergeAvailabilityRows(publicationRows, mediaRows);
  return {
    schemaVersion: 1,
    kind: 'matcha-luna-menu-reset-backup',
    createdAt,
    business: {
      id: business.business_id,
      name: business.business_name,
    },
    costing: {
      stateId: 'main',
      updatedAt: stateRow.updated_at,
      recipes: stateRow.data.recipes,
      products: stateRow.data.products,
    },
    pos: {
      products,
    },
  };
}

export async function writeResetBackup(path, backup) {
  const target = requiredValue(path, 'MATCHA_LUNA_RESET_BACKUP_PATH');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(backup, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function apiErrorMessage(payload, status) {
  const message = payload && typeof payload === 'object'
    ? payload.message || payload.error_description || payload.error
    : '';
  return cleanString(message) || `HTTP ${status}`;
}

async function requestJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, options);
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    throw new Error(`Supabase request failed: ${apiErrorMessage(payload, response.status)}`);
  }
  return payload;
}

export async function signInWithPassword({ baseUrl, apiKey, email, password, fetchImpl = fetch }) {
  const auth = await requestJson(
    fetchImpl,
    `${baseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!auth || !cleanString(auth.access_token)) {
    throw new Error('Supabase login succeeded without returning an access token.');
  }
  return auth.access_token;
}

export function createSupabaseResetApi({ baseUrl, apiKey, accessToken, fetchImpl = fetch }) {
  const root = baseUrl.replace(/\/$/, '');
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const rest = (path, options = {}) => requestJson(
    fetchImpl,
    `${root}/rest/v1/${path}`,
    {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    },
  );
  const rpc = (name, body = {}) => rest(`rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    getBusinesses: () => rpc('pos_get_my_businesses'),
    getPublicationStatus: (businessId) => rpc('pos_get_publication_status', {
      p_business_id: businessId,
    }),
    getProductMedia: (businessId) => rpc('pos_get_product_media', {
      p_business_id: businessId,
    }),
    getCatalog: (businessId) => rpc('pos_get_catalog_v2', {
      p_business_id: businessId,
    }),
    setProductAvailability: (businessId, productId, available) =>
      rpc('pos_set_product_availability', {
        p_business_id: businessId,
        p_product_id: productId,
        p_available: available,
      }),
    async getCostingState() {
      const query = new URLSearchParams({
        id: 'eq.main',
        select: 'data,updated_at',
      });
      const rows = await rest(`scoopies_state?${query}`);
      if (!Array.isArray(rows) || rows.length !== 1) {
        throw new Error(`Expected one main costing row, but found ${Array.isArray(rows) ? rows.length : 0}.`);
      }
      return rows[0];
    },
    async updateCostingState(expectedUpdatedAt, data) {
      const nextUpdatedAt = new Date().toISOString();
      const query = new URLSearchParams({
        id: 'eq.main',
        updated_at: `eq.${expectedUpdatedAt}`,
        select: 'data,updated_at',
      });
      const rows = await rest(`scoopies_state?${query}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ data, updated_at: nextUpdatedAt }),
      });
      if (!Array.isArray(rows)) {
        throw new Error('The costing update returned an invalid response.');
      }
      return rows.length === 1 ? rows[0] : null;
    },
    insertActivity(summary) {
      return rest('scoopies_activity', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([{
          actor: 'System',
          summary,
        }]),
      });
    },
  };
}

async function restoreAfterFailure({ api, businessId, originalStateRow, resetStateRow, disabledIds }) {
  const errors = [];

  if (resetStateRow) {
    try {
      const current = await api.getCostingState();
      if (stableJson(current.data) !== stableJson(resetStateRow.data)) {
        throw new Error('costing data changed after reset; automatic restore would overwrite newer work');
      }
      const restored = await api.updateCostingState(current.updated_at, originalStateRow.data);
      if (!restored) throw new Error('costing restore lost its concurrency check');
      if (stableJson(restored.data) !== stableJson(originalStateRow.data)) {
        throw new Error('costing restore verification failed');
      }
    } catch (error) {
      errors.push(`costing: ${error.message || String(error)}`);
    }
  }

  for (const productId of [...disabledIds].reverse()) {
    try {
      await api.setProductAvailability(businessId, productId, true);
    } catch (error) {
      errors.push(`POS product ${productId}: ${error.message || String(error)}`);
    }
  }

  return errors;
}

export async function resetProductionMenu({
  api,
  businessId = '',
  backupPath,
  reason,
  confirmation,
  now = () => new Date().toISOString(),
  backupWriter = writeResetBackup,
  logger = console,
}) {
  validateConfirmation(confirmation);
  const cleanedReason = requiredValue(reason, 'MATCHA_LUNA_RESET_REASON');

  const businesses = await api.getBusinesses();
  const business = selectManagedBusiness(businesses, businessId);
  const selectedBusinessId = business.business_id;

  const [stateRow, publicationRows, mediaRows] = await Promise.all([
    api.getCostingState(),
    api.getPublicationStatus(selectedBusinessId),
    api.getProductMedia(selectedBusinessId),
  ]);
  const prepared = prepareCostingReset(stateRow.data);
  const products = mergeAvailabilityRows(publicationRows, mediaRows);
  const productsToDisable = products.filter((product) => product.available);
  const createdAt = now();
  const backup = buildResetBackup({
    business,
    stateRow,
    publicationRows,
    mediaRows,
    createdAt,
  });

  await backupWriter(backupPath, backup);
  logger.log(
    `Backup complete. Resetting ${prepared.recipeCount} recipes, ` +
    `${prepared.pricingCount} pricing products, and ${productsToDisable.length} POS drinks.`,
  );

  const disabledIds = [];
  let resetStateRow = null;
  try {
    for (const product of productsToDisable) {
      await api.setProductAvailability(selectedBusinessId, product.productId, false);
      disabledIds.push(product.productId);
    }

    resetStateRow = await api.updateCostingState(stateRow.updated_at, prepared.nextData);
    if (!resetStateRow) {
      throw new Error('Costing data changed during the reset. No costing data was overwritten.');
    }

    const [verifiedState, verifiedCatalog, verifiedMedia] = await Promise.all([
      api.getCostingState(),
      api.getCatalog(selectedBusinessId),
      api.getProductMedia(selectedBusinessId),
    ]);
    assertCostingReset(stateRow.data, verifiedState.data);
    if (!Array.isArray(verifiedCatalog) || verifiedCatalog.length !== 0) {
      throw new Error('Verification failed: one or more POS drinks are still visible.');
    }
    if (!Array.isArray(verifiedMedia) || verifiedMedia.some((product) => product.available === true)) {
      throw new Error('Verification failed: one or more current POS products are still available.');
    }

    const summary = {
      completedAt: now(),
      businessId: selectedBusinessId,
      businessName: business.business_name,
      recipesCleared: prepared.recipeCount,
      pricingProductsCleared: prepared.pricingCount,
      posDrinksHidden: productsToDisable.length,
      backupPath,
    };

    try {
      await api.insertActivity(
        `Menu reset: cleared ${prepared.recipeCount} recipes and ` +
        `${prepared.pricingCount} pricing products; hid ${productsToDisable.length} POS drinks. ` +
        `Reason: ${cleanedReason}`,
      );
    } catch (error) {
      logger.warn(`Reset completed, but the activity note could not be saved: ${error.message || String(error)}`);
    }

    logger.log(`MENU_RESET_RESULT=${JSON.stringify(summary)}`);
    return summary;
  } catch (error) {
    const rollbackErrors = await restoreAfterFailure({
      api,
      businessId: selectedBusinessId,
      originalStateRow: stateRow,
      resetStateRow,
      disabledIds,
    });
    if (rollbackErrors.length) {
      throw new Error(
        `${error.message || String(error)} Rollback needs manual attention: ${rollbackErrors.join('; ')}`,
      );
    }
    throw new Error(`${error.message || String(error)} All partial reset changes were rolled back.`);
  }
}

async function appendSummary(summary) {
  const path = cleanString(process.env.GITHUB_STEP_SUMMARY);
  if (!path) return;
  const content = [
    '## Production menu reset',
    '',
    `- Recipes cleared: ${summary.recipesCleared}`,
    `- Pricing products cleared: ${summary.pricingProductsCleared}`,
    `- POS drinks hidden (history preserved): ${summary.posDrinksHidden}`,
    `- Business: ${summary.businessName}`,
    `- Completed: ${summary.completedAt}`,
    '',
  ].join('\n');
  await appendFile(path, content, 'utf8');
}

async function main() {
  const baseUrl = requiredValue(process.env.MATCHA_LUNA_SUPABASE_URL, 'MATCHA_LUNA_SUPABASE_URL');
  const apiKey = requiredValue(process.env.MATCHA_LUNA_SUPABASE_KEY, 'MATCHA_LUNA_SUPABASE_KEY');
  const email = requiredValue(process.env.MATCHA_LUNA_SMOKE_EMAIL, 'MATCHA_LUNA_SMOKE_EMAIL');
  const password = requiredValue(process.env.MATCHA_LUNA_SMOKE_PASSWORD, 'MATCHA_LUNA_SMOKE_PASSWORD');
  const backupPath = requiredValue(
    process.env.MATCHA_LUNA_RESET_BACKUP_PATH,
    'MATCHA_LUNA_RESET_BACKUP_PATH',
  );
  validateConfirmation(process.env.MATCHA_LUNA_RESET_CONFIRMATION);

  const accessToken = await signInWithPassword({ baseUrl, apiKey, email, password });
  const api = createSupabaseResetApi({ baseUrl, apiKey, accessToken });
  const summary = await resetProductionMenu({
    api,
    businessId: process.env.MATCHA_LUNA_BUSINESS_ID,
    backupPath,
    reason: process.env.MATCHA_LUNA_RESET_REASON,
    confirmation: process.env.MATCHA_LUNA_RESET_CONFIRMATION,
  });
  await appendSummary(summary);
}

const isDirectRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectRun) {
  main().catch((error) => {
    console.error(`Production menu reset failed: ${error.message || String(error)}`);
    process.exitCode = 1;
  });
}
