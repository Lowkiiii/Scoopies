import {
  incrementRuntimeBinding,
  runtimeFunction,
  runtimeValue,
  stateFunction,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function showGate(show: LegacyValue): void {
  const gate = runtimeValue<Document>('document').getElementById('authGate');
  if (gate) gate.style.display = show ? 'flex' : 'none';
}

export function authMsg(text: LegacyValue, bad: LegacyValue): void {
  const element = runtimeValue<Document>('document').getElementById('authMsg');
  if (element) {
    element.textContent = text || '';
    element.className = 'authmsg' + (bad ? ' bad' : '');
  }
}

export function renderGate(): void {
  const documentValue = runtimeValue<Document>('document');
  const title = documentValue.getElementById('authTitle');
  const sub = documentValue.getElementById('authSub');
  const button = documentValue.getElementById('authSubmit');
  const toggle = documentValue.getElementById('authToggle');
  if (!button) return;
  if (runtimeValue('authMode') === 'signup') {
    if (title) title.textContent = 'Create your account';
    if (sub) {
      sub.textContent =
        'Use your email and pick a password (at least 6 characters).';
    }
    button.textContent = 'Create account';
    if (toggle) toggle.textContent = 'Already have an account? Log in';
  } else {
    if (title) {
      title.textContent = 'Log in to ' + runtimeValue('APP_BRAND_NAME');
    }
    if (sub) {
      sub.textContent = 'Only you and your partner should have an account.';
    }
    button.textContent = 'Log in';
    if (toggle) toggle.textContent = 'First time? Create an account';
  }
  stateFunction('authMsg')('');
}

export async function handleAuth(
  nextSession: LegacyValue,
  _event?: LegacyValue,
): Promise<LegacyValue> {
  const StringValue = runtimeFunction('String');
  const nextUserId = StringValue(
    nextSession && nextSession.user && nextSession.user.id || '',
  );
  const currentUserId = runtimeValue('currentUserId');
  const sameSignedInUser = !!(
    nextUserId &&
    currentUserId &&
    nextUserId === StringValue(currentUserId)
  );
  const firstSignIn = !!(
    nextUserId && nextUserId !== StringValue(currentUserId || '')
  );
  writeRuntimeBinding('session', nextSession || null);
  let posContextPromise: LegacyValue;
  if (sameSignedInUser) {
    writeRuntimeBinding('offlineMode', false);
    stateFunction('showGate')(false);
    runtimeValue<LegacyValue>('cloud').connected = true;
    try {
      runtimeValue<LegacyValue>('cloud').client.realtime.setAuth(
        runtimeValue<LegacyValue>('session').access_token,
      );
    } catch (_error) {}
    stateFunction('renderAccount')();
    return true;
  }
  if (runtimeValue('session')) {
    writeRuntimeBinding('offlineMode', false);
    stateFunction('showGate')(false);
    runtimeValue<LegacyValue>('cloud').connected = true;
    if (firstSignIn) runtimeFunction('activateAppTab')('pos', false);
    const session = runtimeValue<LegacyValue>('session');
    if (session.user && session.user.id !== runtimeValue('currentUserId')) {
      runtimeFunction('resetPosContext')('');
      posContextPromise = runtimeFunction('loadPosContext')();
      posContextPromise.then(function (ready: LegacyValue) {
        if (ready && runtimeValue<LegacyValue>('posContext').businessId) {
          return runtimeFunction('loadPosCheckoutData')();
        }
      }).catch(function () {});
      writeRuntimeBinding('costingCloudReady', false);
      writeRuntimeBinding('costingCloudLoading', true);
      writeRuntimeBinding('currentUserId', session.user.id);
      const costingGeneration = incrementRuntimeBinding('costingLoadGeneration');
      const costingUserId = StringValue(session.user.id || '');
      let blockedOfflineInventoryChanges: LegacyValue[] = [];
      stateFunction('setStatus')('Connecting…', '');
      try {
        try {
          runtimeValue<LegacyValue>('cloud').client.realtime.setAuth(
            session.access_token,
          );
        } catch (_error) {}
        const remote = await stateFunction('cloudLoad')();
        if (
          !runtimeFunction('costingRequestIsCurrent')(
            costingGeneration,
            costingUserId,
          )
        ) {
          return;
        }
        if (remote !== null) {
          if (runtimeValue('localDirty')) {
            const mergedState = stateFunction('mergeStates')(
              runtimeValue('syncedState') || stateFunction('blank')(),
              runtimeValue('state'),
              remote,
            );
            const lifecycle = runtimeFunction(
              'reconcileCostingInventoryLifecycle',
            )(
              remote,
              mergedState,
              runtimeValue('syncedState') || stateFunction('blank')(),
            );
            writeRuntimeBinding('state', lifecycle.state);
            blockedOfflineInventoryChanges = lifecycle.blocked;
            stateFunction('rememberSynced')(remote, false);
          } else {
            writeRuntimeBinding('state', remote);
            stateFunction('rememberSynced')(remote, true);
          }
        } else {
          await stateFunction('cloudSave')(runtimeValue('state'));
          if (
            !runtimeFunction('costingRequestIsCurrent')(
              costingGeneration,
              costingUserId,
            )
          ) {
            return;
          }
          stateFunction('rememberSynced')(runtimeValue('state'), true);
        }
        writeRuntimeBinding('costingCloudReady', true);
        writeRuntimeBinding('costingCloudLoading', false);
        try {
          runtimeValue<Storage>('localStorage').setItem(
            runtimeValue('KEY'),
            runtimeValue<LegacyValue>('JSON').stringify(runtimeValue('state')),
          );
        } catch (_error) {}
        writeRuntimeBinding(
          'lastState',
          stateFunction('snapshot')(runtimeValue('state')),
        );
        runtimeFunction('renderAll')();
        if (blockedOfflineInventoryChanges.length) {
          runtimeFunction('setTimeout')(function () {
            runtimeFunction('alert')(
              'For stock-history safety, these offline ingredient deletions or unit-type changes were not uploaded: ' +
              blockedOfflineInventoryChanges.join(', ') +
              '. Reconnect first, then make those changes again. Other offline edits were kept.',
            );
          }, 0);
        }
        if (runtimeValue('localDirty')) stateFunction('save')();
        else stateFunction('setStatus')('Saved to cloud ✓', 'good');
      } catch (_error) {
        if (
          !runtimeFunction('costingRequestIsCurrent')(
            costingGeneration,
            costingUserId,
          )
        ) {
          return;
        }
        writeRuntimeBinding('costingCloudReady', false);
        writeRuntimeBinding('costingCloudLoading', false);
        stateFunction('setStatus')('Signed in — cloud read failed', 'bad');
      }
      if (
        !runtimeFunction('costingRequestIsCurrent')(
          costingGeneration,
          costingUserId,
        )
      ) {
        return;
      }
      stateFunction('subscribeRealtime')();
    }
    if (posContextPromise) await posContextPromise;
    else if (
      !runtimeValue<LegacyValue>('posContext').loaded &&
      !runtimeValue<LegacyValue>('posContext').loading
    ) {
      await runtimeFunction('loadPosContext')();
    }
    if (
      runtimeValue<LegacyValue>('posContext').businessId &&
      !runtimeValue<LegacyValue>('posCheckout').catalogLoading &&
      !runtimeValue<LegacyValue>('posCheckout').catalog.length
    ) {
      runtimeFunction('loadPosCheckoutData')().catch(function () {});
    }
  } else {
    const cloud = runtimeValue<LegacyValue>('cloud');
    cloud.connected = false;
    if (runtimeValue('currentUserId')) runtimeFunction('posClearCatalogCache')();
    writeRuntimeBinding('currentUserId', null);
    writeRuntimeBinding('costingCloudReady', false);
    writeRuntimeBinding('costingCloudLoading', false);
    incrementRuntimeBinding('costingLoadGeneration');
    if (runtimeValue('publishModalOpen')) {
      writeRuntimeBinding('publishSubmitting', false);
      runtimeFunction('closePublishProductModal')();
    }
    runtimeFunction('resetPosContext')('');
    if (cloud.client && !runtimeValue('offlineMode')) {
      stateFunction('showGate')(true);
      stateFunction('setStatus')('Sign in to sync', 'bad');
    } else {
      stateFunction('setStatus')('Saved on device', '');
    }
  }
  stateFunction('renderAccount')();
  runtimeFunction('renderPos')();
}

export async function doLogin(): Promise<void> {
  const cloud = runtimeValue<LegacyValue>('cloud');
  if (!cloud.client) {
    stateFunction('authMsg')(
      'Cloud not ready — please refresh the page.',
      true,
    );
    return;
  }
  const documentValue = runtimeValue<Document>('document');
  const email = ((documentValue.getElementById('authEmail') as HTMLInputElement)
    .value || '').trim();
  const password =
    (documentValue.getElementById('authPass') as HTMLInputElement).value || '';
  if (!email || !password) {
    stateFunction('authMsg')('Enter your email and password.', true);
    return;
  }
  stateFunction('authMsg')('Please wait…');
  try {
    if (runtimeValue('authMode') === 'signup') {
      const result = await cloud.client.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (!result.data.session) {
        stateFunction('authMsg')(
          'Account made, but "Confirm email" is ON in Supabase. Turn it OFF (Authentication settings), then log in.',
          true,
        );
        return;
      }
    } else {
      const result = await cloud.client.auth.signInWithPassword({
        email,
        password,
      });
      if (result.error) throw result.error;
    }
  } catch (error: any) {
    stateFunction('authMsg')(
      error && error.message ? error.message : runtimeFunction('String')(error),
      true,
    );
  }
}

export function toggleAuthMode(): void {
  writeRuntimeBinding(
    'authMode',
    runtimeValue('authMode') === 'login' ? 'signup' : 'login',
  );
  stateFunction('renderGate')();
}

export function openLogin(): void {
  writeRuntimeBinding('offlineMode', false);
  writeRuntimeBinding('authMode', 'login');
  stateFunction('renderGate')();
  stateFunction('showGate')(true);
}

export function goOffline(): void {
  writeRuntimeBinding('offlineMode', true);
  runtimeValue<LegacyValue>('cloud').connected = false;
  writeRuntimeBinding('currentUserId', null);
  writeRuntimeBinding('costingCloudReady', false);
  writeRuntimeBinding('costingCloudLoading', false);
  incrementRuntimeBinding('costingLoadGeneration');
  runtimeFunction('resetPosContext')(
    'Connect to the cloud before publishing to POS.',
  );
  stateFunction('showGate')(false);
  stateFunction('setStatus')('Saved on device', '');
  runtimeFunction('renderAll')();
  stateFunction('renderAccount')();
}

export async function doLogout(): Promise<void> {
  const cloud = runtimeValue<LegacyValue>('cloud');
  try {
    if (cloud.channel) {
      cloud.client.removeChannel(cloud.channel);
      cloud.channel = null;
    }
  } catch (_error) {}
  try {
    await cloud.client.auth.signOut();
  } catch (_error) {}
}

export async function doReconnect(): Promise<void> {
  const documentValue = runtimeValue<Document>('document');
  const url = ((documentValue.getElementById('cfgUrl') as HTMLInputElement)
    .value || '').trim();
  const key = ((documentValue.getElementById('cfgKey') as HTMLInputElement)
    .value || '').trim();
  if (!url || !key) {
    runtimeFunction('alert')('Enter both the Project URL and the key.');
    return;
  }
  stateFunction('saveCfg')({ url, key });
  runtimeFunction('alert')(
    'Saved. The page will reload to apply the new settings.',
  );
  runtimeValue<Location>('location').reload();
}

export function renderAccount(): void {
  const documentValue = runtimeValue<Document>('document');
  const element = documentValue.getElementById('cloudState');
  if (!element) return;
  const session = runtimeValue<LegacyValue>('session');
  if (session) {
    const email = session.user ? session.user.email : '';
    element.innerHTML =
      '<div class="note" style="background:#e9f6ea;border-color:#bfe3c1;color:#22622a">✅ Signed in as <strong>' +
      runtimeFunction('escapeHtml')(email) +
      '</strong> — live sync on. Changes save automatically; your partner\'s edits appear by themselves.</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn danger" data-act="logout">Log out</button></div>';
  } else if (runtimeValue('offlineMode')) {
    element.innerHTML =
      '<div class="note">Working on this device only (not signed in). Saved locally, not synced.</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn" data-act="openLogin">Log in to sync</button></div>';
  } else {
    element.innerHTML = '<div class="note">Not signed in.</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn" data-act="openLogin">Log in</button></div>';
  }
  const url = documentValue.getElementById('cfgUrl') as HTMLInputElement | null;
  const key = documentValue.getElementById('cfgKey') as HTMLInputElement | null;
  const cloud = runtimeValue<LegacyValue>('cloud');
  if (url && !url.value) {
    url.value = cloud.url || stateFunction('activeUrl')();
  }
  if (key && !key.value) {
    key.value = cloud.key || stateFunction('activeKey')();
  }
}
