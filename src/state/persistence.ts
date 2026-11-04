import {
  incrementRuntimeBinding,
  runtimeFunction,
  runtimeValue,
  stateFunction,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function setStatus(text: LegacyValue, kind: LegacyValue): void {
  const element = runtimeValue<Document>('document').getElementById('syncStatus');
  if (element) {
    element.textContent = text;
    element.className = 'status ' + (kind || '');
  }
}

export function save(): void {
  const version = incrementRuntimeBinding('saveVersion');
  stateFunction('markLocalDirty')();
  try {
    runtimeValue<Storage>('localStorage').setItem(
      runtimeValue('KEY'),
      runtimeValue<LegacyValue>('JSON').stringify(runtimeValue('state')),
    );
  } catch (_error) {}
  const cloud = runtimeValue<LegacyValue>('cloud');
  if (
    cloud.connected &&
    runtimeValue('session') &&
    runtimeFunction('stockScopedSourceDeletes')().length
  ) {
    runtimeFunction('clearTimeout')(runtimeValue('saveTimer'));
    writeRuntimeBinding('saveTimer', null);
    writeRuntimeBinding('pendingSave', false);
    stateFunction('setStatus')(
      'Inventory source recovery pending - refresh Stocks',
      'bad',
    );
    return;
  }
  if (cloud.connected && runtimeValue('session')) {
    stateFunction('setStatus')('Saving…', '');
    writeRuntimeBinding('pendingSave', true);
    runtimeFunction('clearTimeout')(runtimeValue('saveTimer'));
    const timer = runtimeFunction('setTimeout')(function () {
      if (version === runtimeValue('saveVersion')) {
        writeRuntimeBinding('saveTimer', null);
      }
      runtimeFunction('consumePendingRemoteForCommit')(false);
      const payload = stateFunction('snapshot')(runtimeValue('state'));
      stateFunction('cloudSave')(payload).then(function () {
        if (version !== runtimeValue('saveVersion')) return;
        if (
          runtimeValue('pendingRemote') &&
          !runtimeFunction('sameDataValue')(
            stateFunction('normalizeState')(runtimeValue('pendingRemote')),
            runtimeValue('state'),
          )
        ) {
          writeRuntimeBinding('pendingSave', false);
          runtimeFunction('consumePendingRemoteForCommit')(false);
          stateFunction('save')();
          return;
        }
        writeRuntimeBinding('pendingSave', false);
        writeRuntimeBinding('pendingRemote', null);
        stateFunction('rememberSynced')(payload, true);
        stateFunction('setStatus')('Saved to cloud ✓', 'good');
      }).catch(function () {
        if (version !== runtimeValue('saveVersion')) return;
        writeRuntimeBinding('pendingSave', false);
        stateFunction('setStatus')(
          'Saved on device — will retry cloud',
          'bad',
        );
      });
    }, 600);
    writeRuntimeBinding('saveTimer', timer);
  } else {
    runtimeFunction('clearTimeout')(runtimeValue('saveTimer'));
    writeRuntimeBinding('saveTimer', null);
    writeRuntimeBinding('pendingSave', false);
    stateFunction('setStatus')('Saved on device', '');
  }
}

export function loadCfg(): LegacyValue {
  try {
    return runtimeValue<LegacyValue>('JSON').parse(
      runtimeValue<Storage>('localStorage').getItem(runtimeValue('CFG_KEY')),
    ) || {};
  } catch (_error) {
    return {};
  }
}

export function saveCfg(config: LegacyValue): void {
  runtimeValue<Storage>('localStorage').setItem(
    runtimeValue('CFG_KEY'),
    runtimeValue<LegacyValue>('JSON').stringify(config),
  );
}

export function activeUrl(): string {
  const config = stateFunction('loadCfg')();
  return (config.url || runtimeValue('DEFAULT_URL') || '').trim();
}

export function activeKey(): string {
  const config = stateFunction('loadCfg')();
  return (config.key || runtimeValue('DEFAULT_KEY') || '').trim();
}
