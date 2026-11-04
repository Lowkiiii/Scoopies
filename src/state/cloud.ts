import {
  runtimeFunction,
  runtimeValue,
  stateFunction,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function initClient(url: LegacyValue, key: LegacyValue): boolean {
  const rootWindow = runtimeValue<LegacyValue>('window');
  if (!rootWindow.supabase) {
    stateFunction('setStatus')('No internet', 'bad');
    return false;
  }
  if (!url || !key) return false;
  const cloud = runtimeValue<LegacyValue>('cloud');
  cloud.client = rootWindow.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  cloud.url = url;
  cloud.key = key;
  cloud.client.auth.onAuthStateChange(function (
    event: LegacyValue,
    session: LegacyValue,
  ) {
    stateFunction('handleAuth')(session, event);
  });
  return true;
}

export async function cloudLoad(): Promise<LegacyValue> {
  const result = await runtimeValue<LegacyValue>('cloud').client
    .from('scoopies_state')
    .select('data')
    .eq('id', 'main')
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data && result.data.data
    ? stateFunction('normalizeState')(result.data.data)
    : null;
}

export function cloudSave(state: LegacyValue): Promise<void> {
  const payload = stateFunction('snapshot')(state);
  const task = runtimeValue<Promise<void>>('cloudSaveChain').then(
    async function () {
      const result = await runtimeValue<LegacyValue>('cloud').client
        .from('scoopies_state')
        .upsert(
          {
            id: 'main',
            data: payload,
            updated_at: new (runtimeValue<LegacyValue>('Date'))().toISOString(),
          },
          { onConflict: 'id' },
        );
      if (result.error) throw result.error;
    },
  );
  writeRuntimeBinding('cloudSaveChain', task.catch(function () {}));
  return task;
}

export function appIsEditing(): boolean {
  if (
    runtimeValue('categoryModalOpen') ||
    runtimeValue('purchasedIngredientModalOpen') ||
    runtimeValue('mixtureModalOpen') ||
    runtimeValue('draftsModalOpen') ||
    runtimeValue('publishModalOpen') ||
    runtimeValue<LegacyValue>('posOpsModal') &&
      runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('stockModal') &&
      runtimeValue<LegacyValue>('stockModal').open
  ) {
    return true;
  }
  const active = runtimeValue<Document>('document').activeElement as
    | HTMLElement
    | null;
  return !!(
    active &&
    (active.tagName === 'INPUT' ||
      active.tagName === 'SELECT' ||
      active.tagName === 'TEXTAREA') &&
    active.closest &&
    active.closest('.wrap')
  );
}

export function maybeApplyRemote(remote: LegacyValue): void {
  if (!remote) return;
  remote = stateFunction('normalizeState')(remote);
  if (runtimeFunction('sameDataValue')(remote, runtimeValue('state'))) {
    stateFunction('rememberSynced')(remote, !runtimeValue('pendingSave'));
    return;
  }
  if (
    runtimeValue('localDirty') ||
    runtimeValue('pendingSave') ||
    stateFunction('appIsEditing')()
  ) {
    writeRuntimeBinding('pendingRemote', remote);
    return;
  }
  writeRuntimeBinding('state', remote);
  writeRuntimeBinding('pendingRemote', null);
  writeRuntimeBinding('lastState', stateFunction('snapshot')(runtimeValue('state')));
  try {
    runtimeValue<Storage>('localStorage').setItem(
      runtimeValue('KEY'),
      runtimeValue<LegacyValue>('JSON').stringify(runtimeValue('state')),
    );
  } catch (_error) {}
  stateFunction('rememberSynced')(remote, true);
  runtimeFunction('renderAll')();
  stateFunction('setStatus')('Updated from partner ✓', 'good');
}

export async function retryDirtySave(): Promise<void> {
  if (
    runtimeValue('retryingDirty') ||
    !runtimeValue<LegacyValue>('cloud').connected ||
    !runtimeValue('session') ||
    !runtimeValue('localDirty') ||
    runtimeValue('pendingSave')
  ) {
    return;
  }
  writeRuntimeBinding('retryingDirty', true);
  stateFunction('setStatus')('Checking cloud before retry…', '');
  try {
    if (runtimeFunction('stockScopedSourceDeletes')().length) {
      await runtimeFunction('stockRecoverSourceDeletes')();
      if (runtimeFunction('stockScopedSourceDeletes')().length) {
        stateFunction('setStatus')(
          'Ingredient deletion recovery pending - refresh Stocks',
          'bad',
        );
        return;
      }
      if (!runtimeValue('localDirty')) return;
    }
    const remote = await stateFunction('cloudLoad')();
    if (remote !== null) {
      writeRuntimeBinding('pendingRemote', remote);
      runtimeFunction('consumePendingRemoteForCommit')(false);
    }
    stateFunction('save')();
  } catch (_error) {
    stateFunction('setStatus')('Saved on device — will retry cloud', 'bad');
  } finally {
    writeRuntimeBinding('retryingDirty', false);
  }
}

export function subscribeRealtime(): void {
  const cloud = runtimeValue<LegacyValue>('cloud');
  if (!cloud.client) return;
  try {
    if (cloud.channel) {
      cloud.client.removeChannel(cloud.channel);
      cloud.channel = null;
    }
    cloud.channel = cloud.client.channel('scoopies-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scoopies_state' },
        function (payload: LegacyValue) {
          stateFunction('maybeApplyRemote')(
            payload && payload.new ? payload.new.data : null,
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scoopies_activity' },
        function () {
          const history = runtimeValue<Document>('document')
            .getElementById('history');
          if (history && history.classList.contains('active')) {
            stateFunction('loadHistory')();
          }
        },
      )
      .subscribe();
  } catch (_error) {}
}
